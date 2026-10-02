"""Timestamped RGB-D person perception with an optional Nav2 speed policy.

Inference and RGB-D fusion run on one daemon worker. ROS callbacks retain only
the newest immutable synchronized snapshot, while executor timers publish
results and enforce stale-data policy. No output is a protective stop.
"""

from collections import deque
from contextlib import contextmanager
from dataclasses import dataclass
import math
import threading
import time
import weakref

import numpy as np
import rclpy
from diagnostic_msgs.msg import DiagnosticArray, DiagnosticStatus, KeyValue
from geometry_msgs.msg import Pose, PoseArray
from message_filters import ApproximateTimeSynchronizer, Subscriber
from nav2_msgs.msg import SpeedLimit
from rclpy.callback_groups import CallbackGroup
from rclpy.node import Node
from rclpy.qos import HistoryPolicy, QoSProfile, ReliabilityPolicy
from sensor_msgs.msg import CameraInfo, Image, PointCloud2, PointField
from tf2_ros import Buffer, TransformListener
from visualization_msgs.msg import Marker, MarkerArray

PERSON_CLASS_ID = 0
FUSION_PHASES = ('cloud_decode', 'transform', 'projection', 'roi')


class PerceptionError(ValueError):
    """An observation cannot be interpreted safely."""


class SampledInputGroup(CallbackGroup):
    """Permit one take per subscription per sample tick, before deserialization."""

    def __init__(self):
        super().__init__()
        self._lock = threading.Lock()
        self._allowed = set()
        self._active = None

    def release(self):
        with self._lock:
            # Replace permits; missed ticks never accumulate a catch-up burst.
            self._allowed = self.entities.copy()

    def can_execute(self, entity):
        with self._lock:
            return self._active is None and weakref.ref(entity) in self._allowed

    def beginning_execution(self, entity):
        with self._lock:
            ref = weakref.ref(entity)
            if self._active is not None or ref not in self._allowed:
                return False
            self._allowed.remove(ref)
            self._active = entity
            return True

    def ending_execution(self, entity):
        with self._lock:
            assert self._active is entity
            self._active = None


@dataclass(frozen=True)
class Snapshot:
    image: object
    cloud: object | None
    info: object | None
    image_stamp: float
    cloud_stamp: float | None
    queued_at: float


@dataclass(frozen=True)
class InferenceResult:
    snapshot: Snapshot
    boxes: np.ndarray
    scores: np.ndarray
    latency_s: float
    error: str = ''
    people: list | None = None
    fusion_error: str = ''


def stamp_seconds(stamp):
    return float(stamp.sec) + float(stamp.nanosec) * 1e-9


def quat_to_matrix(x, y, z, w):
    if not np.isfinite([x,y,z,w]).all():
        raise PerceptionError('non-finite TF quaternion')
    n = math.sqrt(x*x + y*y + z*z + w*w)
    if n == 0:
        raise PerceptionError('invalid zero quaternion')
    x, y, z, w = x/n, y/n, z/n, w/n
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                     [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                     [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])


def letterbox_params(src_h, src_w, dst):
    r = min(dst/src_h, dst/src_w)
    nh, nw = int(round(src_h*r)), int(round(src_w*r))
    return r, (dst-nw)//2, (dst-nh)//2, nw, nh


def unletterbox(boxes, r, pad_x, pad_y, src_w, src_h):
    if boxes.size == 0:
        return boxes.astype(np.float32, copy=True).reshape((-1, 4))
    out = boxes.astype(np.float32, copy=True)
    out[:, [0, 2]] = np.clip((out[:, [0, 2]]-pad_x)/r, 0, src_w-1)
    out[:, [1, 3]] = np.clip((out[:, [1, 3]]-pad_y)/r, 0, src_h-1)
    return out


def nms(boxes, scores, threshold):
    if not len(boxes):
        return np.empty((0,), np.int64)
    x1,y1,x2,y2 = boxes.T
    area = np.maximum(0,x2-x1)*np.maximum(0,y2-y1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size:
        i = order[0]; keep.append(i); rest = order[1:]
        if not rest.size: break
        xx1=np.maximum(x1[i],x1[rest]); yy1=np.maximum(y1[i],y1[rest])
        xx2=np.minimum(x2[i],x2[rest]); yy2=np.minimum(y2[i],y2[rest])
        inter=np.maximum(0,xx2-xx1)*np.maximum(0,yy2-yy1)
        iou=inter/(area[i]+area[rest]-inter+1e-9)
        order=rest[iou < threshold]
    return np.asarray(keep, np.int64)


def parse_detections(raw, conf_thr, iou_thr):
    """Parse only the two explicitly supported YOLO layouts; reject others."""
    a = np.asarray(raw)
    if a.ndim == 3 and a.shape[0] == 1:
        a = a[0]
    if a.ndim != 2 or not np.isfinite(a).all():
        raise PerceptionError(f'unsupported/non-finite model output shape {a.shape}')
    if a.shape[1] == 6:
        if not a.size: return np.empty((0,4),np.float32), np.empty(0,np.float32)
        cls = a[:,5]
        if not np.equal(cls, np.floor(cls)).all():
            raise PerceptionError('invalid class values in NMS-free output')
        rows = a[(a[:,4] >= conf_thr) & (cls == PERSON_CLASS_ID)]
        boxes, scores = rows[:,:4], rows[:,4]
    else:
        if a.shape[0] < a.shape[1]: a = a.T
        # Current MVP supports COCO's 80-class head (84 channels) only.
        if a.shape[1] != 84 or a.shape[0] <= a.shape[1]:
            raise PerceptionError(f'unsupported model output shape {a.shape}')
        scores = a[:,4+PERSON_CLASS_ID]
        mask = scores >= conf_thr
        if not mask.any(): return np.empty((0,4),np.float32), np.empty(0,np.float32)
        rows=a[mask]; scores=scores[mask]
        cx,cy,w,h=rows[:,0],rows[:,1],rows[:,2],rows[:,3]
        boxes=np.stack((cx-w/2,cy-h/2,cx+w/2,cy+h/2),axis=1)
        keep=nms(boxes,scores,iou_thr); boxes,scores=boxes[keep],scores[keep]
    if not np.isfinite(boxes).all() or not np.isfinite(scores).all():
        raise PerceptionError('non-finite detections')
    good=(boxes[:,2]>boxes[:,0]) & (boxes[:,3]>boxes[:,1])
    return boxes[good].astype(np.float32), scores[good].astype(np.float32)


def cloud_xyz(msg):
    """Read organized clouds honoring row padding and message endianness."""
    fields = {f.name:f for f in msg.fields}
    if any(n not in fields or fields[n].datatype != PointField.FLOAT32 for n in ('x','y','z')):
        raise PerceptionError('PointCloud2 requires float32 x/y/z fields')
    if msg.width < 0 or msg.height < 0 or msg.point_step <= 0:
        raise PerceptionError('invalid PointCloud2 dimensions/point_step')
    min_row = msg.width * msg.point_step
    row_step = msg.row_step
    if row_step < min_row:
        raise PerceptionError('PointCloud2 row_step is smaller than width*point_step')
    required_bytes = row_step * msg.height
    if len(msg.data) != required_bytes:
        raise PerceptionError(
            f'PointCloud2 data length {len(msg.data)} does not match row_step*height {required_bytes}')
    endian = '>' if msg.is_bigendian else '<'
    for n in ('x','y','z'):
        f=fields[n]
        if f.offset < 0 or f.offset+4 > msg.point_step:
            raise PerceptionError(f'invalid {n} field offset')
    if not msg.width or not msg.height:
        return np.empty((0,3), dtype=np.float32)
    data=memoryview(msg.data)
    xyz=[]
    for name in ('x','y','z'):
        field=fields[name]
        xyz.append(np.ndarray(
            shape=(msg.height,msg.width), dtype=np.dtype(f'{endian}f4'), buffer=data,
            offset=field.offset, strides=(row_step,msg.point_step)))
    pts=np.stack(xyz,axis=-1).reshape(-1,3).astype(np.float32,copy=False)
    valid=np.isfinite(pts).all(axis=1) & (pts[:,2] > 0.05)
    return pts[valid]


def range_core(u, v, z, box, shrink=0.5, band=0.4, min_roi=20, min_core=10):
    x1,y1,x2,y2=map(float,box); cx=(x1+x2)/2; cy=(y1+y2)/2
    hw=(x2-x1)*shrink/2; hh=(y2-y1)*shrink/2
    mask=(u>=cx-hw)&(u<=cx+hw)&(v>=cy-hh)&(v<=cy+hh)
    if int(mask.sum()) < min_roi: raise PerceptionError('ROI has insufficient projected depth')
    zz=z[mask]; p25=np.percentile(zz,25); core_mask=np.abs(zz-p25)<=band
    core=zz[core_mask]
    if core.size < min_core: raise PerceptionError('depth core has insufficient points')
    return float(np.median(core)), mask, core_mask


def project_points(points, k, distortion):
    """Project camera-frame XYZ using raw-image intrinsics and plumb_bob D."""
    import cv2
    points=np.asarray(points,dtype=np.float64).reshape(-1,1,3)
    intrinsic=np.asarray(k,dtype=np.float64).reshape(3,3)
    distortion=np.asarray(distortion,dtype=np.float64)
    uv,_=cv2.projectPoints(points,np.zeros(3),np.zeros(3),intrinsic,distortion)
    return uv.reshape(-1,2)


class SlowdownPolicy:
    """Pure policy: unknown/stale fails to 50%; zero is never emitted."""
    def __init__(self, slow=50.0, enter=2.0, exit=2.5, half_width=0.8,
                 hold=1.0, max_gap=0.4):
        self.slow=float(slow); self.enter=float(enter); self.exit=float(exit)
        self.half_width=float(half_width); self.hold=float(hold); self.max_gap=float(max_gap)
        self.slowing=True; self.last_stamp=None; self.clear_since=None

    def unknown(self):
        self.slowing=True; self.clear_since=None; self.last_stamp=None
        return self.slow

    def observe(self, people, stamp):
        if self.last_stamp is not None and stamp <= self.last_stamp:
            return self.unknown()
        if self.last_stamp is not None and stamp-self.last_stamp > self.max_gap:
            self.clear_since=None
        self.last_stamp=stamp
        in_hold=any(x > 0 and abs(y) < self.half_width and x <= self.exit for x,y,z in people)
        in_enter=any(x > 0 and abs(y) < self.half_width and x < self.enter for x,y,z in people)
        if in_enter: self.slowing=True; self.clear_since=None
        elif self.slowing:
            if in_hold: self.clear_since=None
            elif self.clear_since is None: self.clear_since=stamp
            elif stamp-self.clear_since >= self.hold: self.slowing=False
        return self.slow if self.slowing else 100.0


class PersonPerceptionNode(Node):
    def __init__(self):
        super().__init__('person_perception')
        defaults={'model_xml':'','device':'CPU','imgsz':320,'inference_threads':2,
                  'conf_threshold':0.45,'iou_threshold':0.5,'rate_hz':5.0,
                  'camera_name':'camera','base_frame':'base_link','stale_after_s':1.0,
                  'future_stamp_tolerance_s':0.05,
                  'publish_speed_limit':False,'bbox_only':False,'slow_speed_percent':50.0,
                  'slow_enter_x_m':2.0,'slow_exit_x_m':2.5,'corridor_half_width_m':0.8,
                  'clear_hold_s':1.0,'clear_max_gap_s':0.4,'report_period':5.0}
        for k,v in defaults.items(): self.declare_parameter(k,v)
        self.cfg={k:self.get_parameter(k).value for k in defaults}
        self.config_error=self._validate_config()
        self.cam=str(self.cfg['camera_name']); self.base_frame=str(self.cfg['base_frame'])
        safe=defaults if self.config_error else self.cfg
        self.imgsz=int(safe['imgsz']); self.conf=float(safe['conf_threshold']); self.iou=float(safe['iou_threshold'])
        self.stale=float(safe['stale_after_s']); self.bbox_only=bool(self.cfg['bbox_only'])
        self.policy=SlowdownPolicy(safe['slow_speed_percent'],safe['slow_enter_x_m'],safe['slow_exit_x_m'],
             safe['corridor_half_width_m'],safe['clear_hold_s'],safe['clear_max_gap_s'])
        self.tf_buffer=Buffer(); self.tf_listener=TransformListener(self.tf_buffer,self)
        self._lock=threading.Lock(); self._wake=threading.Condition(self._lock)
        self._pending=None; self._result=None; self._worker_busy=False; self._stopping=False
        self._last_image_stamp=None; self._last_cloud_stamp=None; self._last_pair_stamp=None; self._last_valid_mono=None
        self._last_obs_ros=None; self._status_reason='STARTUP'; self._last_people=[]
        self._pending_policy=None; self._last_sync_delta=float('nan')
        self._last_source=('unknown','unknown')
        self._calibration_signature=None
        self._counts={'dropped':0,'duplicate':0,'errors':0}; self._latencies=deque(maxlen=100)
        self._e2e_latencies=deque(maxlen=100); self._observation_times=deque(maxlen=100)
        self._fusion_latencies=deque(maxlen=100)
        self._fusion_phase_latencies={phase:deque(maxlen=100) for phase in FUSION_PHASES}
        self._bbox_count=0; self._valid_fusion_count=0
        self._input_counts={'rgb_received':0,'cloud_received':0,'pairs_accepted':0}
        self._input_group=None
        qos=QoSProfile(depth=5,history=HistoryPolicy.KEEP_LAST,reliability=ReliabilityPolicy.BEST_EFFORT)
        if not self.bbox_only:
            self._input_group=SampledInputGroup()
            input_qos=QoSProfile(depth=1,history=HistoryPolicy.KEEP_LAST,reliability=ReliabilityPolicy.BEST_EFFORT)
            self.image_sub=Subscriber(self,Image,f'{self.cam}/color/image_raw',
                                      qos_profile=input_qos,callback_group=self._input_group)
            self.cloud_sub=Subscriber(self,PointCloud2,f'{self.cam}/depth/points',
                                      qos_profile=input_qos,callback_group=self._input_group)
            self.image_sub.registerCallback(self._count_input,'rgb_received')
            self.cloud_sub.registerCallback(self._count_input,'cloud_received')
            self.sync=ApproximateTimeSynchronizer([self.image_sub,self.cloud_sub],1,0.05,allow_headerless=False)
            self.sync.registerCallback(self._on_pair)
            self.create_subscription(CameraInfo,f'{self.cam}/color/camera_info',self._on_info,qos)
        else:
            self.create_subscription(Image,f'{self.cam}/color/image_raw',self._on_bbox_image,qos)
            self.image_sub=None
        self.info=None
        self.people_pub=self.create_publisher(PoseArray,'people',10)
        self.marker_pub=self.create_publisher(MarkerArray,'people_markers',10)
        self.limit_pub=(self.create_publisher(SpeedLimit,'speed_limit',10)
                        if not self.config_error and self.cfg['publish_speed_limit'] and not self.bbox_only
                        else None)
        self.diag_pub=self.create_publisher(DiagnosticArray,'person_perception/diagnostics',10)
        self.debug_pub=self.create_publisher(Image,'person_perception/debug_image',10)
        self.net=self._load_model() if self.config_error is None else None
        if self.config_error: self.get_logger().error(self.config_error)
        if self.net is None and not self.config_error: self._status_reason='MODEL_ERROR'
        rate=max(1.0,float(safe['rate_hz']))
        self._inference_period=1.0/rate
        self._worker=threading.Thread(target=self._worker_loop,name='person-inference',daemon=True); self._worker.start()
        self.create_timer(1.0/rate,self._health_tick)
        self.create_timer(0.2,self._policy_tick)
        self.create_timer(float(safe['report_period']),self._report)

    def _validate_config(self):
        c=self.cfg
        numeric=('rate_hz','stale_after_s','future_stamp_tolerance_s','slow_speed_percent',
                 'slow_enter_x_m','slow_exit_x_m','corridor_half_width_m','clear_hold_s',
                 'clear_max_gap_s','conf_threshold','iou_threshold','report_period')
        try:
            if any(not math.isfinite(float(c[k])) for k in numeric):
                return 'invalid configuration: numeric parameters must be finite'
        except (TypeError, ValueError):
            return 'invalid configuration: numeric parameters must be numbers'
        try:
            image_size=int(c['imgsz']); inference_threads=int(c['inference_threads'])
        except (TypeError, ValueError):
            return 'invalid configuration: imgsz/inference_threads must be integers'
        if c['bbox_only'] and c['publish_speed_limit']:
            return 'invalid configuration: bbox_only=true cannot enable publish_speed_limit'
        if image_size<=0 or float(c['rate_hz'])<=0 or float(c['stale_after_s'])<=0 or float(c['future_stamp_tolerance_s'])<0:
            return 'invalid configuration: imgsz, rate_hz, stale_after_s must be positive and future tolerance nonnegative'
        if float(c['report_period'])<=0 or inference_threads<0:
            return 'invalid configuration: report_period must be positive and inference_threads nonnegative'
        if not (0<float(c['conf_threshold'])<=1 and 0<=float(c['iou_threshold'])<=1):
            return 'invalid configuration: confidence/IoU thresholds must be in [0,1]'
        if not str(c['camera_name']).strip() or not str(c['base_frame']).strip():
            return 'invalid configuration: camera_name and base_frame cannot be empty'
        if not 0<float(c['slow_speed_percent'])<=100:
            return 'invalid configuration: slow_speed_percent must be in (0,100]'
        if not (0<float(c['slow_enter_x_m'])<float(c['slow_exit_x_m'])):
            return 'invalid configuration: require 0 < slow_enter_x_m < slow_exit_x_m'
        if any(float(c[k])<=0 for k in ('corridor_half_width_m','clear_hold_s','clear_max_gap_s')):
            return 'invalid configuration: corridor and clear timing values must be positive'
        return None

    def _load_model(self):
        xml=self.cfg['model_xml']
        if not xml:
            self.get_logger().error('model_xml is empty; perception remains UNKNOWN')
            return None
        try:
            import openvino as ov
            cfg={'PERFORMANCE_HINT':'LATENCY'}
            if self.cfg['device']=='CPU' and int(self.cfg['inference_threads'])>0:
                cfg['INFERENCE_NUM_THREADS']=int(self.cfg['inference_threads'])
            core=ov.Core(); compiled=core.compile_model(core.read_model(xml),self.cfg['device'],cfg)
            self.get_logger().info(f'Loaded model {xml} on {self.cfg["device"]}; imgsz={self.imgsz}')
            return compiled.create_infer_request()
        except Exception as exc:
            self.get_logger().error(f'model load failed: {exc}')
            return None

    @staticmethod
    def _rgb_array(msg):
        if msg.height<=0 or msg.width<=0: raise PerceptionError('empty image')
        channels=3 if msg.encoding in ('rgb8','bgr8') else 1 if msg.encoding=='mono8' else 0
        if not channels: raise PerceptionError(f'unsupported image encoding {msg.encoding}')
        if msg.step < msg.width*channels or len(msg.data)<msg.step*msg.height:
            raise PerceptionError('Image payload/step is invalid')
        a=np.frombuffer(msg.data,dtype=np.uint8).reshape(msg.height,msg.step)[:,:msg.width*channels]
        a=a.reshape(msg.height,msg.width,channels)
        if channels==1: return np.repeat(a,3,axis=2)
        return a[...,::-1].copy() if msg.encoding=='bgr8' else a.copy()

    def _on_info(self,msg):
        if msg.width and msg.height: self.info=msg

    def _on_pair(self,image,cloud):
        self._enqueue(image,cloud,self.info)

    def _count_input(self,_msg,key):
        with self._wake: self._input_counts[key]+=1

    def _on_bbox_image(self,image):
        self._count_input(image,'rgb_received')
        self._enqueue(image,None,None)

    def _enqueue(self,image,cloud,info):
        try:
            ts=stamp_seconds(image.header.stamp)
            if ts<=0: raise PerceptionError('zero image timestamp')
            cts=stamp_seconds(cloud.header.stamp) if cloud is not None else None
            if cts is not None and (cts<=0 or abs(ts-cts)>0.05): raise PerceptionError('sync delta exceeds 50 ms')
            with self._wake:
                if self._last_image_stamp is not None and ts<=self._last_image_stamp:
                    self._counts['duplicate']+=1
                    self._set_unknown('duplicate/out-of-order image timestamp')
                    return
                if cts is not None and self._last_cloud_stamp is not None and cts<=self._last_cloud_stamp:
                    self._counts['duplicate']+=1
                    self._set_unknown('duplicate/out-of-order cloud timestamp')
                    return
                self._last_image_stamp=ts
                if cts is not None:
                    self._last_cloud_stamp=cts
                    self._input_counts['pairs_accepted']+=1
                snap=Snapshot(image,cloud,info,ts,cts,time.monotonic())
                if self._pending is not None: self._counts['dropped']+=1
                self._pending=snap; self._wake.notify()
        except Exception as exc:
            self._set_unknown(str(exc))

    def _worker_loop(self):
        next_start=0.0
        while True:
            with self._wake:
                while not self._stopping:
                    if self._pending is None:
                        self._wake.wait()
                        continue
                    delay=next_start-time.monotonic()
                    if delay>0:
                        self._wake.wait(timeout=delay)
                        continue
                    snap=self._pending; self._pending=None; self._worker_busy=True
                    next_start=time.monotonic()+self._inference_period
                    break
                if self._stopping:return
            t=time.perf_counter()
            try:
                if self.net is None: raise PerceptionError('MODEL_ERROR: model unavailable')
                img=self._rgb_array(snap.image)
                import cv2
                h,w=img.shape[:2]; r,px,py,nw,nh=letterbox_params(h,w,self.imgsz)
                canvas=np.full((self.imgsz,self.imgsz,3),114,np.uint8)
                canvas[py:py+nh,px:px+nw]=cv2.resize(img,(nw,nh))
                blob=canvas.transpose(2,0,1)[None].astype(np.float32)/255.0
                raw=list(self.net.infer({0:blob}).values())[0]
                boxes,scores=parse_detections(raw,self.conf,self.iou)
                boxes=unletterbox(boxes,r,px,py,w,h)
                result=InferenceResult(snap,boxes,scores,time.perf_counter()-t)
            except Exception as exc:
                result=InferenceResult(snap,np.empty((0,4),np.float32),np.empty(0,np.float32),time.perf_counter()-t,str(exc))

            fusion_duration=None
            if not result.error and not self.bbox_only:
                try:
                    if snap.info is None: raise PerceptionError('missing CameraInfo')
                    fusion_start=time.perf_counter() if len(result.boxes) else None
                    try:
                        people=self._locate(snap,result.boxes)
                    finally:
                        if fusion_start is not None:
                            fusion_duration=time.perf_counter()-fusion_start
                    result=InferenceResult(snap,result.boxes,result.scores,result.latency_s,
                                           people=people)
                except Exception as exc:
                    result=InferenceResult(snap,result.boxes,result.scores,result.latency_s,
                                           fusion_error=str(exc))
            with self._wake:
                # Profile all nonempty _locate attempts, even failed/stale/replaced results.
                if fusion_duration is not None: self._fusion_latencies.append(fusion_duration)
                self._worker_busy=False
                # A result still waiting for the executor is replaced by this newer one.
                if self._result is not None:
                    self._counts['dropped']+=1
                    if self._result.error or self._result.fusion_error:
                        self._counts['errors']+=1
                self._result=result
                self._wake.notify_all()

    def _health_tick(self):
        with self._wake:
            result=self._result; self._result=None
            self._wake.notify_all()
        if result is not None: self._consume(result)
        now_ros=self.get_clock().now().nanoseconds*1e-9
        if self._last_obs_ros is not None and now_ros < self._last_obs_ros:
            with self._wake:
                self._last_image_stamp=None
                self._last_cloud_stamp=None
                self._last_pair_stamp=None
            if not self._status_reason.startswith('MODEL_ERROR'):
                self._set_unknown('ROS clock moved backwards')
        if self._last_valid_mono is None or time.monotonic()-self._last_valid_mono > self.stale:
            if not self._status_reason.startswith('MODEL_ERROR'):
                self._set_unknown('STALE: no fresh valid observation')
        # This existing timer runs at rate_hz. rclpy checks the group before
        # taking a message; DDS KEEP_LAST(1) retains only the latest input.
        if self._input_group is not None: self._input_group.release()

    def _consume(self,result):
        snap=result.snapshot
        now_ros=self.get_clock().now().nanoseconds*1e-9
        image_age=now_ros-snap.image_stamp
        cloud_age=now_ros-snap.cloud_stamp if snap.cloud_stamp is not None else image_age
        age=max(image_age,cloud_age)
        tolerance=float(self.cfg['future_stamp_tolerance_s'])
        if min(image_age,cloud_age) < -tolerance or age>self.stale:
            self._record_error(); self._set_unknown('STALE/INVALID RGB or cloud source timestamp'); return
        if self._last_pair_stamp is not None and snap.image_stamp<=self._last_pair_stamp:
            self._counts['duplicate']+=1; self._set_unknown('out-of-order inference result'); return
        self._last_pair_stamp=snap.image_stamp
        if result.error:
            self._record_error()
            reason=result.error if result.error.startswith('MODEL_ERROR') else f'MODEL_ERROR: {result.error}'
            self._set_unknown(reason); return
        self._latencies.append(result.latency_s)
        self._e2e_latencies.append(image_age)
        self._observation_times.append(time.monotonic())
        self._bbox_count=len(result.boxes)
        if self.bbox_only:
            self._publish_debug(snap.image,result.boxes,result.scores)
            self._status_reason='BBOX_ONLY_VALID'; self._last_valid_mono=time.monotonic(); self._last_obs_ros=now_ros
            return
        if result.fusion_error:
            self._record_error(); self._set_unknown(result.fusion_error); return
        if result.people is None:
            self._record_error(); self._set_unknown('missing RGB-D fusion result'); return
        people=result.people
        self._valid_fusion_count=len(people)
        # Any detected person without reliable depth makes the entire policy UNKNOWN.
        self._publish_people(people,snap.cloud.header.stamp)
        self._last_people=people; self._last_valid_mono=time.monotonic(); self._last_obs_ros=now_ros
        self._status_reason='VALID'
        self._last_sync_delta=abs(snap.image_stamp-snap.cloud_stamp)
        self._last_source=(snap.image_stamp,snap.cloud_stamp)
        self._pending_policy=(people,snap.cloud_stamp)

    def _record_error(self):
        with self._wake: self._counts['errors']+=1

    def _tf(self,target,source):
        if not target or not source: raise PerceptionError('missing TF frame id')
        t=self.tf_buffer.lookup_transform(target,source,rclpy.time.Time())
        q=t.transform.rotation; tr=t.transform.translation
        translation=np.array([tr.x,tr.y,tr.z],dtype=np.float64)
        if not np.isfinite(translation).all(): raise PerceptionError('non-finite TF translation')
        return quat_to_matrix(q.x,q.y,q.z,q.w),translation

    @contextmanager
    def _profile_phase(self,phase):
        started=time.perf_counter()
        try:
            yield
        finally:
            duration=time.perf_counter()-started
            with self._wake: self._fusion_phase_latencies[phase].append(duration)

    def _locate(self,snap,boxes):
        cloud,info=snap.cloud,snap.info
        if cloud is None or info is None: raise PerceptionError('missing cloud/CameraInfo')
        if (info.width,info.height)!=(snap.image.width,snap.image.height): raise PerceptionError('CameraInfo resolution mismatch')
        if info.header.frame_id!=snap.image.header.frame_id: raise PerceptionError('CameraInfo/image frame mismatch')
        if len(info.k)!=9 or not np.isfinite(info.k).all() or info.k[0]<=0 or info.k[4]<=0:
            raise PerceptionError('invalid CameraInfo K')
        if info.distortion_model not in ('plumb_bob',''):
            raise PerceptionError(f'unsupported distortion model {info.distortion_model}')
        d=np.asarray(info.d,dtype=np.float64)
        if not np.isfinite(d).all(): raise PerceptionError('invalid CameraInfo D')
        if info.distortion_model=='' and np.any(np.abs(d)>1e-12): raise PerceptionError('unsupported nonzero D without distortion model')
        signature=(info.header.frame_id,info.width,info.height,tuple(info.k),tuple(info.d),info.distortion_model)
        if self._calibration_signature is not None and signature!=self._calibration_signature:
            self._calibration_signature=signature
            raise PerceptionError('CameraInfo calibration changed; waiting for a new observation')
        self._calibration_signature=signature
        if len(boxes) == 0:
            return []
        with self._profile_phase('cloud_decode'):
            pts=cloud_xyz(cloud)
        if not len(pts):
            if len(boxes): raise PerceptionError('no valid cloud points')
            return []
        with self._profile_phase('transform'):
            Rc,Tc=self._tf(info.header.frame_id,cloud.header.frame_id)
            Rb,Tb=self._tf(self.base_frame,info.header.frame_id)
            cam=pts@Rc.T+Tc; valid=cam[:,2]>0.05; cam=cam[valid]
        if not len(cam):
            if len(boxes): raise PerceptionError('no cloud points in front of camera')
            return []
        with self._profile_phase('projection'):
            k=np.asarray(info.k,dtype=np.float64).reshape(3,3)
            uv=project_points(cam,k,d)
            in_img=(uv[:,0]>=0)&(uv[:,0]<info.width)&(uv[:,1]>=0)&(uv[:,1]<info.height)
        with self._profile_phase('roi'):
            out=[]
            for box in boxes:
                rng,mask,core=range_core(uv[in_img,0],uv[in_img,1],cam[in_img,2],box)
                selected=cam[in_img][mask][core]
                p_color=np.median(selected,axis=0)
                out.append(Rb@p_color+Tb)
        return out

    def _publish_people(self,people,stamp):
        pa=PoseArray(); pa.header.stamp=stamp; pa.header.frame_id=self.base_frame
        arr=MarkerArray(); clear=Marker(); clear.action=Marker.DELETEALL; arr.markers.append(clear)
        for i,xyz in enumerate(people):
            p=Pose(); p.position.x,p.position.y,p.position.z=map(float,xyz); p.orientation.w=1.0; pa.poses.append(p)
            m=Marker(); m.header=pa.header; m.ns='people'; m.id=i; m.type=Marker.CYLINDER; m.action=Marker.ADD
            m.pose.position.x=p.position.x; m.pose.position.y=p.position.y; m.pose.position.z=0.85
            m.pose.orientation.w=1.0; m.scale.x=m.scale.y=0.5; m.scale.z=1.7
            m.color.r,m.color.g,m.color.b,m.color.a=1.0,0.6,0.0,0.6; m.lifetime.sec=1; arr.markers.append(m)
        self.people_pub.publish(pa); self.marker_pub.publish(arr)

    def _publish_debug(self,msg,boxes,scores):
        import cv2
        img=self._rgb_array(msg).copy()
        for box,score in zip(boxes,scores):
            x1,y1,x2,y2=map(int,box); cv2.rectangle(img,(x1,y1),(x2,y2),(0,255,0),2)
            cv2.putText(img,f'person {score:.2f}',(x1,max(0,y1-5)),cv2.FONT_HERSHEY_SIMPLEX,0.5,(0,255,0),1)
        out=Image(); out.header=msg.header; out.height,out.width=img.shape[:2]; out.encoding='rgb8'; out.step=out.width*3; out.data=img.tobytes()
        self.debug_pub.publish(out)

    def _set_unknown(self,reason):
        self._status_reason=reason; self.policy.unknown(); self._pending_policy=None
        if hasattr(self,'marker_pub'):
            clear=Marker(); clear.action=Marker.DELETEALL
            arr=MarkerArray(); arr.markers=[clear]; self.marker_pub.publish(arr)

    def _policy_tick(self):
        if self.config_error:
            self._publish_diagnostics(); return
        now=time.monotonic()
        if self._last_valid_mono is None or now-self._last_valid_mono>self.stale or self._status_reason!='VALID':
            percent=self.policy.unknown()
        elif self._pending_policy is not None:
            people,stamp=self._pending_policy; self._pending_policy=None
            percent=self.policy.observe(people,stamp)
        else:
            percent=self.policy.slow if self.policy.slowing else 100.0
        if self.cfg['publish_speed_limit'] and not self.bbox_only:
            self._publish_limit(percent)
        self._publish_diagnostics(percent)

    def _publish_limit(self,percent):
        if self.limit_pub is None: return
        if percent<=0: raise ValueError('SpeedLimit zero means no limit and is forbidden here')
        msg=SpeedLimit(); msg.header.stamp=self.get_clock().now().to_msg(); msg.header.frame_id=self.base_frame
        msg.percentage=True; msg.speed_limit=float(min(100,max(0.1,percent))); self.limit_pub.publish(msg)

    def _publish_diagnostics(self,percent=None):
        d=DiagnosticArray(); d.header.stamp=self.get_clock().now().to_msg()
        s=DiagnosticStatus(); s.name='person_perception'; s.hardware_id=self.base_frame
        unknown=self._status_reason not in ('VALID','BBOX_ONLY_VALID')
        s.level=DiagnosticStatus.ERROR if unknown else DiagnosticStatus.OK
        s.message=self._status_reason
        age='unknown' if self._last_valid_mono is None else f'{time.monotonic()-self._last_valid_mono:.3f}'
        infer_p50=float(np.percentile(np.asarray(self._latencies),50)) if self._latencies else float('nan')
        infer_p95=float(np.percentile(np.asarray(self._latencies),95)) if self._latencies else float('nan')
        e2e_p50=float(np.percentile(np.asarray(self._e2e_latencies),50)) if self._e2e_latencies else float('nan')
        e2e_p95=float(np.percentile(np.asarray(self._e2e_latencies),95)) if self._e2e_latencies else float('nan')
        with self._wake:
            fusion=tuple(self._fusion_latencies)
            phase_samples={phase:tuple(samples) for phase,samples in self._fusion_phase_latencies.items()}
        fusion_p50,fusion_p95=np.percentile(fusion,[50,95]) if fusion else (float('nan'),float('nan'))
        unique_hz=((len(self._observation_times)-1)/(self._observation_times[-1]-self._observation_times[0])
                   if len(self._observation_times)>1 and self._observation_times[-1]>self._observation_times[0]
                   else float('nan'))
        values={'state':'UNKNOWN' if unknown else self._status_reason,'reason':self._status_reason,
                'observation_age_s':age,'dropped':str(self._counts['dropped']),'duplicates':str(self._counts['duplicate']),
                 'errors':str(self._counts['errors']),
                 'inference_p50_ms':f'{infer_p50*1000:.2f}' if math.isfinite(infer_p50) else 'unknown',
                 'inference_p95_ms':f'{infer_p95*1000:.2f}' if math.isfinite(infer_p95) else 'unknown',
                 'fusion_p50_ms':f'{fusion_p50*1000:.2f}' if math.isfinite(fusion_p50) else 'unknown',
                 'fusion_p95_ms':f'{fusion_p95*1000:.2f}' if math.isfinite(fusion_p95) else 'unknown',
                'bbox_count':str(self._bbox_count),'valid_fusion_count':str(self._valid_fusion_count),
                 'e2e_p50_ms':f'{e2e_p50*1000:.2f}' if math.isfinite(e2e_p50) else 'unknown',
                 'e2e_p95_ms':f'{e2e_p95*1000:.2f}' if math.isfinite(e2e_p95) else 'unknown',
                 'unique_frame_rate_hz':f'{unique_hz:.3f}' if math.isfinite(unique_hz) else 'unknown',
                'sync_delta_s':f'{getattr(self,"_last_sync_delta",float("nan")):.4f}',
                'image_stamp_s':str(getattr(self,'_last_source',('unknown','unknown'))[0]),
                'cloud_stamp_s':str(getattr(self,'_last_source',('unknown','unknown'))[1]),
                'policy_state':'SLOW' if self.policy.slowing else 'CLEAR','speed_limit_percent':str(percent if percent is not None else (self.policy.slow if self.policy.slowing else 100.0))}
        for phase,samples in phase_samples.items():
            p50,p95=np.percentile(samples,[50,95]) if samples else (float('nan'),float('nan'))
            values[f'{phase}_p50_ms']=f'{p50*1000:.2f}' if math.isfinite(p50) else 'unknown'
            values[f'{phase}_p95_ms']=f'{p95*1000:.2f}' if math.isfinite(p95) else 'unknown'
        with self._wake: values.update(self._input_counts)
        s.values=[KeyValue(key=k,value=str(v)) for k,v in values.items()]; d.status=[s]; self.diag_pub.publish(d)

    def _report(self):
        if self._latencies:
            infer=np.asarray(self._latencies)*1000
            e2e=np.asarray(self._e2e_latencies)*1000
            unique_hz=((len(self._observation_times)-1)/(self._observation_times[-1]-self._observation_times[0])
                       if len(self._observation_times)>1 and self._observation_times[-1]>self._observation_times[0]
                       else 0.0)
            self.get_logger().info(
                f'person perception: infer p50/p95={np.percentile(infer,50):.1f}/{np.percentile(infer,95):.1f}ms '
                f'e2e p50/p95={np.percentile(e2e,50):.1f}/{np.percentile(e2e,95):.1f}ms '
                f'unique_fps={unique_hz:.2f} drops={self._counts["dropped"]} status={self._status_reason}')

    def destroy_node(self):
        with self._wake: self._stopping=True; self._wake.notify_all()
        return super().destroy_node()


def main(args=None):
    rclpy.init(args=args); node=PersonPerceptionNode()
    try: rclpy.spin(node)
    except KeyboardInterrupt: pass
    finally:
        node.destroy_node()
        if rclpy.ok(): rclpy.shutdown()


if __name__=='__main__': main()
