"""Synthetic CPU load for robustness runs: N busy processes (default 3 of 4 cores), duty cycle D.
Mimics the Quest scrcpy+FFmpeg stream that saturated the J5005 on 19/10 (about 97 %)."""
import multiprocessing as mp, os, sys, time
def spin(duty):
    while True:
        t = time.time()
        while time.time() - t < 0.02 * duty: pass
        time.sleep(0.02 * (1 - duty))
if __name__ == '__main__':
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 3; d = float(sys.argv[2]) if len(sys.argv) > 2 else 0.95
    ps = [mp.Process(target=spin, args=(d,), daemon=True) for _ in range(n)]
    [p.start() for p in ps]
    try:
        while True: time.sleep(1)
    except KeyboardInterrupt:
        pass
