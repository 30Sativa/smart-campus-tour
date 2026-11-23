"""Write the sonar test map (PGM + YAML) for the offline sonar scenarios.

Usage: sonar_world.py OUT_DIR   -> OUT_DIR/sonar_world.{pgm,yaml}

An L-shaped corridor, 1.6 m wide: east from x=-1 to x=7.6 (y in [-0.8, 0.8]), then
north from y=0.8 to y=7 (x in [6.0, 7.6]), with a 0.9 m doorway across the north leg
at y=3.5 (gap x in [6.35, 7.25]). Walls are 0.1 m thick and tall (the LiDAR and the
sonars both see them). Low obstacles are NOT in the map: sonarsim.py adds them.
"""
import os
import sys
import numpy as np
from PIL import Image

RES, OX, OY, W, H = 0.05, -2.0, -2.0, 12.0, 10.0
WALLS = [  # (x0, y0, x1, y1) filled rectangles, metres
    (-1.1, -0.9, 7.7, -0.8), (-1.1, 0.8, 6.0, 0.9), (-1.1, -0.9, -1.0, 0.9),   # east leg
    (7.6, -0.9, 7.7, 7.1), (5.9, 0.8, 6.0, 7.1), (5.9, 7.0, 7.7, 7.1),        # north leg
    (6.0, 3.45, 6.35, 3.55), (7.25, 3.45, 7.6, 3.55),                           # doorway posts
]


def grid():
    occ = np.zeros((int(H / RES), int(W / RES)), bool)   # row 0 = lowest y
    yy, xx = np.mgrid[0:occ.shape[0], 0:occ.shape[1]]
    cx, cy = OX + (xx + 0.5) * RES, OY + (yy + 0.5) * RES
    for x0, y0, x1, y1 in WALLS:
        occ |= (cx >= x0) & (cx <= x1) & (cy >= y0) & (cy <= y1)
    inside = (((cx > -1.0) & (cx < 7.6) & (cy > -0.8) & (cy < 0.8)) |
              ((cx > 6.0) & (cx < 7.6) & (cy > -0.8) & (cy < 7.0)))
    return occ, inside


def main(out):
    os.makedirs(out, exist_ok=True)
    occ, inside = grid()
    img = np.full(occ.shape, 205, np.uint8)          # unknown outside the corridor
    img[inside] = 254
    img[occ] = 0
    Image.fromarray(img[::-1]).save(os.path.join(out, 'sonar_world.pgm'))
    with open(os.path.join(out, 'sonar_world.yaml'), 'w') as f:
        f.write(f'image: sonar_world.pgm\nmode: trinary\nresolution: {RES}\n'
                f'origin: [{OX}, {OY}, 0.0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.25\n')
    print(os.path.join(out, 'sonar_world.yaml'))


if __name__ == '__main__':
    main(sys.argv[1])
