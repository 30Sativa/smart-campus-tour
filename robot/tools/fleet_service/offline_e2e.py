#!/usr/bin/env python3
"""Offline end-to-end check of the fleet service: the real supervisor ("robot fleet --service"), the
real fleet_bridge of the staged runtime, and a loopback mock backend. Read robot/docs/fleet-service.md.

Isolated from the robot: temporary profile, state and log dirs; ROS_DOMAIN_ID 89 with a discovery
server address nobody serves (127.0.0.1:11899), so nothing reaches the robot's DDS graph; robot
code amr_e2e on http://127.0.0.1:<port> (loopback HTTP is the bridge's only allowed plain HTTP).

  offline_e2e.py --overlay ~/.cache/sct-runtime/<id>/install [--base ~/smart-campus-tour/robot] [--systemd]

Scenarios: online without Nav2; backend down -> retrying on the same bridge; backend back ->
connected; "robot nav --fleet" -> commands (polls start); nav ends -> telemetry; bridge killed ->
restarted; second bridge refused; SIGTERM -> clean stop. --systemd also runs the supervisor as a
transient user unit and kills it with SIGKILL: systemd must restart it and leave one bridge.
"""
import argparse, http.server, json, os, shutil, signal, subprocess, sys, tempfile, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROBOT = os.path.normpath(os.path.join(HERE, '..', '..', 'scripts', 'robot'))


class Mock:
    """Fleet Sync, diagnostics and command poll endpoints; up() / down() toggle the listener."""

    def __init__(self, port):
        self.port, self.counts, self.server, self.lock = port, {}, None, threading.Lock()

    def up(self):
        outer = self

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                self.rfile.read(int(self.headers.get('Content-Length', 0)))
                kind = ('sync' if self.path.endswith('/v1/sync') else 'diagnostics' if self.path.endswith('/diagnostics')
                        else 'poll' if self.path.endswith('/poll') else 'other')
                with outer.lock:
                    outer.counts[kind] = outer.counts.get(kind, 0) + 1
                body = {'success': True, 'data': {'accepted': True} if kind == 'sync' else {'command': None} if kind == 'poll' else {}}
                data = json.dumps(body).encode()
                self.send_response(200); self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
        http.server.ThreadingHTTPServer.allow_reuse_address = True
        self.server = http.server.ThreadingHTTPServer(('127.0.0.1', self.port), H)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def down(self):
        self.server.shutdown(); self.server.server_close(); self.server = None

    def count(self, kind):
        with self.lock:
            return self.counts.get(kind, 0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--overlay', required=True)
    ap.add_argument('--base', default=os.path.expanduser('~/smart-campus-tour/robot'))
    ap.add_argument('--port', type=int, default=18089)
    ap.add_argument('--systemd', action='store_true')
    a = ap.parse_args()
    tmp = tempfile.mkdtemp(prefix='fleet_e2e_')
    root = os.path.join(tmp, 'robot_root')
    os.makedirs(os.path.join(root, 'ros2_ws'))
    os.makedirs(os.path.join(root, 'robot_maps'))
    shutil.copy(os.path.join(a.base, 'robot_maps', 'map2.yaml'), os.path.join(root, 'robot_maps', 'map2.yaml'))
    os.symlink(os.path.join(a.base, 'ros2_ws', 'install'), os.path.join(root, 'ros2_ws', 'install'))
    os.symlink(os.path.join(a.base, 'ros2_ws', 'src'), os.path.join(root, 'ros2_ws', 'src'))   # nav2 params
    open(os.path.join(root, '.env'), 'w').write('ROS_DOMAIN_ID=89\nRMW_IMPLEMENTATION=rmw_fastrtps_cpp\n'
                                                 'ROS_DISCOVERY_SERVER=127.0.0.1:11899\nROS_LOCALHOST_ONLY=1\n')
    cred = os.path.join(tmp, 'cred'); open(cred, 'w').write('E2E-NOT-A-SECRET'); os.chmod(cred, 0o600)
    fenv = os.path.join(tmp, 'fleet.env')
    open(fenv, 'w').write(f'FLEET_SYNC_URL=http://127.0.0.1:{a.port}/api/fleet/v1/sync\nFLEET_ROBOT_CODE=amr_e2e\n'
                          f'FLEET_ROBOT_MAP_KEY=e2e-map\nFLEET_ROBOT_FRAME_ID=map\nFLEET_ROBOT_CREDENTIAL_FILE={cred}\n')
    prof = os.path.join(tmp, 'runtime.env')
    open(prof, 'w').write(f'SCT_ROBOT_ROOT={root}\nSCT_OVERLAY={a.overlay}\nROBOT_ID=robot_01\nLIDAR_YAW=-3.0695\n'
                          f'SCT_LOG_ROOT={tmp}/runs\nMIN_FREE_GB=0\nFLEET_ENV_FILE={fenv}\n')
    env = {k: v for k, v in os.environ.items() if not k.startswith(('ROS_', 'AMENT', 'RMW_', 'FASTRTPS', 'FASTDDS'))}
    # empty proc root: a fleet_bridge of the real robot (domain 30) must not make the supervisor wait;
    # waiting for a foreign bridge is covered by robot/scripts/tests.
    os.makedirs(os.path.join(tmp, 'proc'))
    env.update(SCT_ROBOT_PROFILE=prof, SCT_ROBOT_STATE=os.path.join(tmp, 'state'), SCT_FLEET_POLL='0.5',
               SCT_PROC_ROOT=os.path.join(tmp, 'proc'),
               SCT_FLEET_BACKOFF_MIN='2', SCT_FLEET_BACKOFF_MAX='10')
    status_path = os.path.join(tmp, 'state', 'fleet-service.json')
    results = []

    def st():
        try:
            return json.load(open(status_path))
        except (OSError, ValueError):
            return {}

    def wait(what, cond, timeout):
        end = time.time() + timeout
        while time.time() < end:
            if cond():
                results.append((what, True, round(timeout - (end - time.time()), 1))); print(f'PASS {what}', flush=True)
                return True
            time.sleep(0.5)
        results.append((what, False, timeout)); print(f'FAIL {what}: {json.dumps(st())[:600]}', flush=True)
        return False

    def bridges():
        """This test's bridges only (domain 89): a robot running beside the test is never counted."""
        out = subprocess.run(['pgrep', '-f', f'{a.overlay}/fleet_bridge/lib/fleet_bridge/fleet_bridge'],
                             capture_output=True, text=True).stdout.split()
        mine = []
        for x in out:
            try:
                if b'ROS_DOMAIN_ID=89' in open(f'/proc/{x}/environ', 'rb').read().split(b'\0'):
                    mine.append(int(x))
            except OSError:
                pass
        return mine

    mock = Mock(a.port); mock.up()
    log = open(os.path.join(tmp, 'service.log'), 'w')
    svc = subprocess.Popen([sys.executable, ROBOT, 'fleet', '--service'], env=env, stdout=log, stderr=subprocess.STDOUT)
    nav = None
    try:
        wait('online without Nav2 (sync acknowledged, telemetry)', lambda: st().get('sync', {}).get('state') == 'connected'
             and st().get('mode') == 'telemetry' and mock.count('sync') > 0, 60)
        wait('diagnostics reach the backend', lambda: mock.count('diagnostics') > 0, 30)
        polls0 = mock.count('poll'); time.sleep(3)
        results.append(('telemetry mode does not poll commands', mock.count('poll') == polls0, 3))
        pid0 = st().get('child_pid')
        r = subprocess.run([sys.executable, ROBOT, 'fleet', '--dry-run'], env=env, capture_output=True, text=True)
        results.append(('foreground "robot fleet" refused while the service runs', r.returncode == 2, 0))
        mock.down()
        wait('backend down -> bridge retries', lambda: st().get('sync', {}).get('state') == 'retrying', 40)
        results.append(('no restart while the backend is down', st().get('child_pid') == pid0, 0))
        time.sleep(5); mock.up()
        wait('backend back -> connected, same bridge', lambda: st().get('sync', {}).get('state') == 'connected'
             and st().get('child_pid') == pid0, 90)
        sleeper = os.path.join(tmp, 'sleeper.sh'); open(sleeper, 'w').write('#!/bin/sh\nexec sleep 120\n'); os.chmod(sleeper, 0o755)
        # the nav stand-in only takes the workflow lock; an empty proc root keeps processes outside this test
        # (a bridge someone left running on the robot) from refusing it
        empty_proc = os.path.join(tmp, 'proc')
        nav = subprocess.Popen([sys.executable, ROBOT, 'nav', '--fleet'],
                               env=dict(env, SCT_ROBOT_TEST_EXEC=sleeper, SCT_PROC_ROOT=empty_proc),
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        wait('"robot nav --fleet" -> commands mode, new bridge', lambda: st().get('mode') == 'commands'
             and st().get('child_pid') not in (None, pid0), 40)
        wait('commands mode polls the backend', lambda: mock.count('poll') > polls0, 30)
        nav.send_signal(signal.SIGTERM); nav.wait(10); nav = None
        wait('nav ends -> telemetry again', lambda: st().get('mode') == 'telemetry', 40)
        results.append(('exactly one fleet_bridge', len(bridges()) == 1, 0))
        victim = st().get('child_pid'); os.kill(victim, signal.SIGKILL)
        wait('killed bridge restarted', lambda: st().get('child_pid') not in (None, victim)
             and st().get('sync', {}).get('state') == 'connected', 60)
        results.append(('restart counted', st().get('restarts', 0) >= 1, 0))
    finally:
        if nav:
            nav.kill()
        svc.send_signal(signal.SIGTERM)
        try:
            code = svc.wait(25)
        except subprocess.TimeoutExpired:
            svc.kill(); code = None
    results.append(('SIGTERM -> clean stop, no bridge left', code == 0 and not bridges(), 0))
    if a.systemd:
        unit = 'sct-fleet-e2e'
        sets = sum((['--setenv', f'{k}={env[k]}'] for k in ('SCT_ROBOT_PROFILE', 'SCT_ROBOT_STATE', 'SCT_FLEET_POLL', 'SCT_PROC_ROOT',
                                                             'SCT_FLEET_BACKOFF_MIN', 'SCT_FLEET_BACKOFF_MAX', 'HOME', 'USER')), [])
        subprocess.run(['systemd-run', '--user', f'--unit={unit}', '-p', 'Restart=always', '-p', 'RestartSec=2',
                        '-p', 'KillMode=mixed', '-p', 'TimeoutStopSec=20', *sets, sys.executable, ROBOT, 'fleet', '--service'],
                       check=True, capture_output=True)
        try:
            wait('systemd unit: online', lambda: st().get('sync', {}).get('state') == 'connected' and bridges(), 60)
            sup = st().get('pid'); os.kill(sup, signal.SIGKILL)
            wait('systemd: supervisor SIGKILLed -> restarted with one bridge',
                 lambda: st().get('pid') not in (None, sup) and st().get('sync', {}).get('state') == 'connected'
                 and len(bridges()) == 1, 60)
        finally:
            subprocess.run(['systemctl', '--user', 'stop', unit], capture_output=True)
            subprocess.run(['systemctl', '--user', 'reset-failed', unit], capture_output=True)
        results.append(('systemd stop leaves no bridge', not bridges(), 0))
    mock.down() if mock.server else None
    ok = all(r[1] for r in results)
    print(json.dumps({'ok': ok, 'results': results, 'logs': tmp}, indent=1))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
