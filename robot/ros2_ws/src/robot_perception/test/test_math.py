"""Offline tests for perception geometry, parsing and policy."""
import struct
import sys
import types
import unittest

import numpy as np
try:
    import cv2  # noqa: F401
    HAS_CV2=True
except ImportError:
    HAS_CV2=False


def _stub(name, attrs=()):
    mod=types.ModuleType(name)
    for attr in attrs: setattr(mod,attr,type(attr,(),{}))
    sys.modules[name]=mod
    return mod


r=_stub('rclpy'); r.time=types.SimpleNamespace(Time=object)
_stub('rclpy.node',['Node'])
q=_stub('rclpy.qos')
for n in ('QoSProfile','ReliabilityPolicy','HistoryPolicy'):
    setattr(q,n,type(n,(),{'BEST_EFFORT':0,'KEEP_LAST':1}))
for mod,attrs in [('diagnostic_msgs',()),('diagnostic_msgs.msg',['DiagnosticArray','DiagnosticStatus','KeyValue']),
                  ('geometry_msgs',()),('geometry_msgs.msg',['Pose','PoseArray']),
                  ('nav2_msgs',()),('nav2_msgs.msg',['SpeedLimit']),
                  ('sensor_msgs',()),('sensor_msgs.msg',['CameraInfo','Image','PointCloud2']),
                  ('tf2_ros',['Buffer','TransformListener']),('visualization_msgs',()),
                  ('visualization_msgs.msg',['Marker','MarkerArray']),('message_filters',['ApproximateTimeSynchronizer','Subscriber'])]:
    m=_stub(mod,attrs)
    if mod=='sensor_msgs.msg': m.PointField=type('PointField',(),{'FLOAT32':7})
    if mod=='visualization_msgs.msg': m.Marker=type('Marker',(),{'CYLINDER':3,'ADD':0,'DELETEALL':3})

class StubSpeedLimit:
    def __init__(self): self.header=types.SimpleNamespace(stamp=None,frame_id='')

sys.modules['nav2_msgs.msg'].SpeedLimit=StubSpeedLimit

from robot_perception import person_perception_node as P  # noqa: E402


class Field:
    def __init__(self,name,offset): self.name=name; self.offset=offset; self.datatype=7


def cloud(points, *, big=False, row_pad=0, malformed=False):
    height=len(points); width=len(points[0]); point_step=20; row_step=width*point_step+row_pad
    payload=bytearray(row_step*height); endian='>' if big else '<'
    offsets=(1,7,13)
    for y,row in enumerate(points):
        for x,p in enumerate(row):
            for offset,value in zip(offsets,p):
                struct.pack_into(endian+'f',payload,y*row_step+x*point_step+offset,value)
    return types.SimpleNamespace(fields=[Field('x',offsets[0]),Field('y',offsets[1]),Field('z',offsets[2])],width=width,height=height,
       point_step=point_step,row_step=row_step if not malformed else row_step+10,is_bigendian=big,data=bytes(payload))


def scalar_cloud_reference(msg):
    endian='>' if msg.is_bigendian else '<'
    fields={field.name:field.offset for field in msg.fields}
    points=[]
    for row in range(msg.height):
        for col in range(msg.width):
            base=row*msg.row_step+col*msg.point_step
            point=tuple(struct.unpack_from(endian+'f',msg.data,base+fields[name])[0]
                        for name in ('x','y','z'))
            if np.isfinite(point).all() and point[2]>.05:
                points.append(point)
    return np.asarray(points,dtype=np.float32).reshape(-1,3)


class PerceptionMathTests(unittest.TestCase):
 def test_letterbox_round_trip(self):
    r,px,py,_,_=P.letterbox_params(480,640,320)
    original=np.array([[100.,50.,300.,400.]])
    scaled=original.copy(); scaled[:,[0,2]]=scaled[:,[0,2]]*r+px; scaled[:,[1,3]]=scaled[:,[1,3]]*r+py
    self.assertTrue(np.allclose(P.unletterbox(scaled,r,px,py,640,480),original,atol=.5))

 def test_parser_supported_end_to_end_and_rejects_unknown_tensor(self):
    raw=np.array([[[10,10,50,90,.91,0],[10,10,50,90,.3,0],[60,10,90,90,.95,2]]],np.float32)
    boxes,scores=P.parse_detections(raw,.45,.5)
    self.assertEqual(boxes.shape,(1,4)); self.assertAlmostEqual(scores[0],.91)
    with self.assertRaisesRegex(P.PerceptionError,'unsupported'):
        P.parse_detections(np.zeros((1,3,9),np.float32),.45,.5)

 def test_classic_layout_person_only(self):
    a=np.zeros((1,84,2100),np.float32); a[0,2,:]=20; a[0,3,:]=40
    a[0,0,:5]=[20,21,200,201,20]; a[0,1,:5]=[30,31,210,211,30]
    a[0,4,:5]=[.90,.85,.80,.10,.88]; a[0,6,7]=.99
    boxes,_=P.parse_detections(a,.45,.5)
    self.assertEqual(len(boxes),2)
 def test_cloud_honors_row_padding_endian_and_filters_nan(self):
    points=[[(1,2,3),(float('nan'),0,1)],[(4,5,6),(7,8,9)]]
    for big,row_pad in ((False,0),(False,8),(True,0),(True,8)):
        msg=cloud(points,big=big,row_pad=row_pad)
        self.assertTrue(np.array_equal(P.cloud_xyz(msg),scalar_cloud_reference(msg)))
    self.assertTrue(np.allclose(P.cloud_xyz(cloud(points,big=True,row_pad=8)),[[1,2,3],[4,5,6],[7,8,9]]))

 def test_cloud_rejects_short_payload(self):
    with self.assertRaisesRegex(P.PerceptionError,'data length'):
        P.cloud_xyz(cloud([[(1,2,3)]],malformed=True))

 def test_range_core_uses_p25_band_and_requires_support(self):
    u=np.repeat(np.arange(10),10); v=np.tile(np.arange(10),10)
    z=np.r_[np.full(70,4.),np.full(30,2.)]
    rng,mask,core=P.range_core(u,v,z,np.array([-10,-10,20,20]))
    self.assertAlmostEqual(rng,2.); self.assertEqual(mask.sum(),100); self.assertGreaterEqual(core.sum(),10)
    with self.assertRaisesRegex(P.PerceptionError,'insufficient'):
        P.range_core(np.array([0]),np.array([0]),np.array([2]),np.array([0,0,10,10]))

 @unittest.skipUnless(HAS_CV2,'OpenCV unavailable in host environment')
 def test_distortion_projection_matches_known_plumb_bob_point(self):
    p=np.array([[.5,.2,2.]])
    uv=P.project_points(p,[300,0,160,0,300,120,0,0,1],[.1,-.02,0,0,0])
    self.assertGreater(uv[0,0],235); self.assertGreater(uv[0,1],149)
    pinhole=P.project_points(p,[300,0,160,0,300,120,0,0,1],[0,0,0,0,0])
    self.assertNotAlmostEqual(uv[0,0],pinhole[0,0])

 def test_slowdown_policy_startup_hysteresis_clear_and_unknown(self):
    p=P.SlowdownPolicy()
    self.assertEqual(p.slow,50)
    self.assertEqual(p.observe([(1.9,0,0)],10),50)
    self.assertEqual(p.observe([(2.2,0,0)],10.2),50)
    self.assertEqual(p.observe([],10.4),50)
    self.assertEqual(p.observe([],10.8),50)
    self.assertEqual(p.observe([],11.3),50)  # gap resets the clear hold
    self.assertEqual(p.observe([],11.6),50)
    self.assertEqual(p.observe([],11.9),50)
    self.assertEqual(p.observe([],12.2),50)
    self.assertEqual(p.observe([],12.31),100)
    self.assertEqual(p.unknown(),50)

 def test_policy_uses_forward_corridor_and_each_side(self):
    p=P.SlowdownPolicy(); p.slowing=False
    self.assertEqual(p.observe([(1.0,.81,0),(1.0,-.81,0),(-1.0,0,0)],1.0),100)
    self.assertEqual(p.observe([(1.9,.2,0)],1.2),50)
    p.slowing=False
    self.assertEqual(p.observe([(1.9,-.2,0)],1.4),50)

 def test_policy_rejects_stale_order_and_zero_semantics(self):
    p=P.SlowdownPolicy()
    self.assertEqual(p.observe([],4),50)
    self.assertEqual(p.observe([],3),50)
    self.assertEqual(p.observe([],4.5),50)  # recovery from UNKNOWN starts a fresh hold
    class Publisher:
        def publish(self,msg): self.message=msg
    node=types.SimpleNamespace(limit_pub=Publisher(),base_frame='base_link',
        get_clock=lambda:types.SimpleNamespace(now=lambda:types.SimpleNamespace(to_msg=lambda:'stamp')))
    with self.assertRaises(ValueError):
        P.PersonPerceptionNode._publish_limit(node,0)
    P.PersonPerceptionNode._publish_limit(node,50)
    self.assertEqual(node.limit_pub.message.speed_limit,50)
    self.assertIs(node.limit_pub.message.percentage,True)

 def test_bbox_only_speed_limit_combination_is_rejected(self):
    cfg={'rate_hz':5.,'stale_after_s':1.,'future_stamp_tolerance_s':.05,
         'slow_speed_percent':50.,'slow_enter_x_m':2.,'slow_exit_x_m':2.5,
         'corridor_half_width_m':.8,'clear_hold_s':1.,'clear_max_gap_s':.4,
         'conf_threshold':.45,'iou_threshold':.5,'report_period':5.,
         'imgsz':320,'inference_threads':2,'bbox_only':True,
         'publish_speed_limit':True,'camera_name':'camera','base_frame':'base_link'}
    node=types.SimpleNamespace(cfg=cfg)
    self.assertIn('cannot enable',P.PersonPerceptionNode._validate_config(node))

 def test_people_position_is_not_changed_by_marker_height(self):
    class Position:
        x=y=z=0.0
    class Pose:
        def __init__(self):
            self.position=Position(); self.orientation=types.SimpleNamespace(w=0.0)
    class PoseArray:
        def __init__(self): self.header=types.SimpleNamespace(stamp=None,frame_id=''); self.poses=[]
    class Marker:
        DELETEALL=3; CYLINDER=3; ADD=0
        def __init__(self):
            self.header=None; self.ns=''; self.id=0; self.type=0; self.action=0
            self.pose=Pose(); self.scale=Position(); self.color=types.SimpleNamespace(r=0.,g=0.,b=0.,a=0.)
            self.lifetime=types.SimpleNamespace(sec=0)
    class MarkerArray:
        def __init__(self): self.markers=[]
    class Publisher:
        def publish(self,message): self.message=message
    old=(P.Pose,P.PoseArray,P.Marker,P.MarkerArray)
    P.Pose,P.PoseArray,P.Marker,P.MarkerArray=Pose,PoseArray,Marker,MarkerArray
    try:
        node=types.SimpleNamespace(base_frame='base_link',people_pub=Publisher(),marker_pub=Publisher())
        P.PersonPerceptionNode._publish_people(node,[np.array([1.,2.,3.])],'cloud-stamp')
        self.assertEqual(node.people_pub.message.poses[0].position.z,3.)
        self.assertEqual(node.marker_pub.message.markers[1].pose.position.z,.85)
    finally:
        P.Pose,P.PoseArray,P.Marker,P.MarkerArray=old


if __name__=='__main__':
    unittest.main()
