"""Logs /plan, /plan_smoothed, /received_global_plan (with receipt time) and per-process CPU
(Nav2 servers) every 1 s. Writes RUN/plans.npz, RUN/plans_smoothed.npz, RUN/plans_received.npz, RUN/cpu.csv."""
import os, sys, time, numpy as np, rclpy
from nav_msgs.msg import Path
OUT = sys.argv[1]
NAMES = ['controller_server', 'planner_server', 'smoother_server', 'bt_navigator', 'velocity_smoother', 'behavior_server', 'fakebot2']
rclpy.init(); n = rclpy.create_node('bench_logger')
store = {'plan': [], 'plan_smoothed': [], 'received_global_plan': []}
def cb(k):
    def f(m):
        if len(m.poses) > 1:
            store[k].append((time.time(), np.array([[p.pose.position.x, p.pose.position.y] for p in m.poses], np.float32)))
    return f
for k in store:
    n.create_subscription(Path, '/robot_01/' + k, cb(k), 10)
GC = {}
if os.environ.get('LOG_GCOSTMAP'):
    from nav_msgs.msg import OccupancyGrid
    from rclpy.qos import QoSProfile, DurabilityPolicy, ReliabilityPolicy
    def gcb(m): GC['m'] = m
    n.create_subscription(OccupancyGrid, '/robot_01/global_costmap/costmap', gcb,
                          QoSProfile(depth=1, durability=DurabilityPolicy.TRANSIENT_LOCAL, reliability=ReliabilityPolicy.RELIABLE))
HZ = os.sysconf('SC_CLK_TCK'); prev = {}
cpu = open(os.path.join(OUT, 'cpu.csv'), 'w'); cpu.write('t,' + ','.join(NAMES) + ',sys_busy,ext_load\n')
def sysstat():
    v = [int(x) for x in open('/proc/stat').readline().split()[1:]]
    return sum(v), v[3] + v[4]
ps_prev = sysstat()
def ext():
    for p in os.listdir('/proc'):
        if p.isdigit():
            try:
                c = open(f'/proc/{p}/comm').read().strip()
            except Exception:
                continue
            if c in ('ffmpeg', 'scrcpy', 'colcon', 'pytest', 'cc1plus'):
                return c
    return ''
def pids():
    out = {}
    for p in os.listdir('/proc'):
        if not p.isdigit(): continue
        try:
            cmd = open(f'/proc/{p}/cmdline', 'rb').read().replace(b'\0', b' ').decode(errors='ignore')
            env = open(f'/proc/{p}/environ', 'rb').read()
        except Exception: continue
        if b'ROS_DOMAIN_ID=86' not in env: continue
        for nm in NAMES:
            if nm in cmd and 'ros2 launch' not in cmd: out.setdefault(nm, []).append(p)
    return out
def save():
    if GC.get('m') is not None:
        m = GC['m']; np.savez(os.path.join(OUT, 'gcostmap.npz'), data=np.array(m.data, np.int8).reshape(m.info.height, m.info.width),
                              res=m.info.resolution, ox=m.info.origin.position.x, oy=m.info.origin.position.y)
    for k, v in store.items():
        np.savez(os.path.join(OUT, {'plan': 'plans', 'plan_smoothed': 'plans_smoothed', 'received_global_plan': 'plans_received'}[k] + '.npz'),
                 t=np.array([a for a, _ in v]), paths=np.array([b for _, b in v], dtype=object))
last = time.time(); lastsave = last
try:
  while rclpy.ok():
      rclpy.spin_once(n, timeout_sec=0.1)
      now = time.time()
      if now - last >= 1.0:
          row = [f'{now:.1f}']
          found = pids()
          for nm, ps in [(nm, found.get(nm, [])) for nm in NAMES]:
              tot = 0.0
              for p in ps:
                  try: f = open(f'/proc/{p}/stat').read().rsplit(')', 1)[1].split(); ticks = int(f[11]) + int(f[12])
                  except Exception: continue
                  if p in prev: tot += (ticks - prev[p][0]) / HZ / (now - prev[p][1]) * 100
                  prev[p] = (ticks, now)
              row.append(f'{tot:.1f}')
          tot2, idle2 = sysstat(); busy = 100 * (1 - (idle2 - ps_prev[1]) / max(tot2 - ps_prev[0], 1)); ps_prev = (tot2, idle2)
          row += [f'{busy:.1f}', ext()]
          cpu.write(','.join(row) + '\n'); cpu.flush(); last = now
      if now - lastsave > 5:
          save(); lastsave = now

except KeyboardInterrupt:
  pass
finally:
  save()
