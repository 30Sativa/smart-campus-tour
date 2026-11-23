"""cpu_log.py OUT.csv -- per-process CPU (% of one core) of this domain's sim, every 1 s.

Started by sonar_run.sh; stops on SIGINT. Matches the processes of the same
ROS_DOMAIN_ID by executable name (argv[0] or a python script's argv[1]), so the robot
stack in another domain is never counted. sonar_report.py averages the rows taken
while the goal runs.
"""
import os
import signal
import sys
import time

NAMES = ['sonar_memory', 'collision_monitor', 'sonarsim', 'controller_server',
         'velocity_smoother', 'fakebot2']
DOMAIN = f'ROS_DOMAIN_ID={os.environ.get("ROS_DOMAIN_ID", "")}'.encode()
HZ = os.sysconf('SC_CLK_TCK')


def processes():
    out = {}
    for pid in filter(str.isdigit, os.listdir('/proc')):
        try:
            argv = open(f'/proc/{pid}/cmdline', 'rb').read().split(b'\0')
            if DOMAIN not in open(f'/proc/{pid}/environ', 'rb').read().split(b'\0'):
                continue
        except OSError:
            continue
        exe = {os.path.basename(a.decode(errors='ignore')).removesuffix('.py') for a in argv[:2]}
        for name in NAMES:
            if name in exe:
                out.setdefault(name, []).append(pid)
    return out


def ticks(pid):
    fields = open(f'/proc/{pid}/stat').read().rsplit(')', 1)[1].split()
    return int(fields[11]) + int(fields[12])


def main(path):
    running = [True]
    signal.signal(signal.SIGINT, lambda *_: running.__setitem__(0, False))
    prev = {}
    with open(path, 'w') as out:
        out.write('t,' + ','.join(NAMES) + '\n')
        while running[0]:
            time.sleep(1.0)
            now = time.time()
            row = [f'{now:.1f}']
            for name in NAMES:
                total = 0.0
                for pid in processes().get(name, []):
                    try:
                        tk = ticks(pid)
                    except OSError:
                        continue
                    if pid in prev:
                        total += (tk - prev[pid][0]) / HZ / (now - prev[pid][1]) * 100.0
                    prev[pid] = (tk, now)
                row.append(f'{total:.1f}')
            out.write(','.join(row) + '\n')
            out.flush()


if __name__ == '__main__':
    main(sys.argv[1])
