"""Build web/public/models/robot/campus-amr-explode.glb from the per-part STL
export of `A_Full_Xe - Copy.SLDASM` (SolidWorks "Save As STL", one file per
component, assembly coordinates, mm).

After this script, compress with:
    npx @gltf-transform/cli meshopt <out.glb> web/public/models/robot/campus-amr-explode.glb

The Meta Quest 3 is not part of the SolidWorks assembly. Add it to the STL
folder as `A_Full_Xe - Copy - Meta Quest 3-1.STL`, already in assembly
coordinates: the Quest3_mm.stl model moved (0, +160, +14) mm in the Dau.SLDPRT
frame (headset centred on the eyes, strap clear of the head), then by the
Dau-1 placement in the assembly (found by registering Dau.SLDPRT onto the
exported `Assem2s-1 Dau-1.STL`).

Each node is named `<group>__<nn>`; the web catalog
(web/src/features/landing/robot-explode/parts.ts) maps <group> to its label,
colour and explode direction. Run: python build_glb.py <stl-folder> <out.glb>
Needs: trimesh, fast_simplification, numpy.
"""
import glob, os, re, sys, unicodedata
import numpy as np, trimesh

# (group id, test on the SolidWorks part name, triangle budget per part or None = keep)
RULES = [
    ('pcb',      lambda n: n.startswith('3D_PCB1'), 400),
    ('drv',      lambda n: n.startswith('external stepper driver'), 500),
    ('driver',   lambda n: n.startswith('HBS86H'), 4000),
    ('pc',       lambda n: n.startswith('Beelink'), 3000),
    ('sonar',    lambda n: n.startswith('JSN-SR04T') or n.startswith('cam biến'), 1500),
    ('motor',    lambda n: n.startswith('57HS22'), None),
    ('wheel',    lambda n: n.startswith('banh xe'), 2000),
    ('caster',   lambda n: n.startswith('bánh xe phụ'), 1000),
    ('screw',    lambda n: n.startswith('ốc'), 160),
    ('frame',    lambda n: n.startswith('khungxe'), None),
    ('lid',      lambda n: n.startswith('nắp'), None),
    ('battery',  lambda n: n.startswith('pin'), None),
    ('screen',   lambda n: n.startswith('màn'), None),
    ('camera',   lambda n: n.startswith('cam-') or n.startswith('dem cam'), None),
    ('lidar',    lambda n: n.startswith('cam2'), 1500),
    ('column',   lambda n: n.startswith('than tru'), None),
    ('quest',    lambda n: n.startswith('Meta Quest 3'), 6000),
    ('head',     lambda n: n.startswith('Assem2s-1 Dau'), None),
    ('pantilt',  lambda n: n.startswith('Assem2s-1'), 1500),
    ('lowershell', lambda n: any(n.startswith(p) for p in ('vỏ xe dưới', 'vo duoi', 'góc bo dưới')), 1200),
    ('shell',    lambda n: any(n.startswith(p) for p in ('vỏ', 'vo duoi', 'góc bo', 'đệm')), 1200),
]

def group_of(name):
    for gid, test, budget in RULES:
        if test(name): return gid, budget
    raise SystemExit(f'no group for part: {name}')

def cluster(m, cell):
    """Vertex clustering: snap to a `cell` mm grid and drop collapsed faces."""
    v = np.round(m.vertices / cell) * cell
    c = trimesh.Trimesh(v, m.faces, process=False)
    c.merge_vertices()
    c.update_faces(c.nondegenerate_faces())
    c.update_faces(c.unique_faces())
    c.remove_unreferenced_vertices()
    return c

def decimate(m, budget):
    """CAD exports are many small shells, which quadric decimation alone cannot
    collapse; fall back to grid clustering until the part fits its budget."""
    d = m.simplify_quadric_decimation(face_count=budget)
    cell = max(m.extents) / 400
    while len(d.faces) > budget * 1.3 and cell < max(m.extents) / 8:
        d = cluster(m, cell).simplify_quadric_decimation(face_count=budget)
        cell *= 1.4
    return d

def main(src, out):
    files = sorted(glob.glob(os.path.join(src, '*.STL')))
    meshes = []
    for f in files:
        name = unicodedata.normalize('NFC', os.path.basename(f)[:-4])
        name = re.sub(r'^A_Full_Xe - Copy - ', '', name)
        gid, budget = group_of(name)
        m = trimesh.load(f, force='mesh'); m.merge_vertices()
        if budget and len(m.faces) > budget:
            m = decimate(m, budget)
        meshes.append((gid, name, m))
    lo = np.min([m.bounds[0] for _, _, m in meshes], axis=0)
    hi = np.max([m.bounds[1] for _, _, m in meshes], axis=0)
    # Floor centre of the robot becomes the origin; mm -> m.
    origin = np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])
    scene = trimesh.Scene()
    counts = {}
    for gid, name, m in meshes:
        m.apply_translation(-origin); m.apply_scale(0.001)
        counts[gid] = counts.get(gid, 0) + 1
        node = f'{gid}__{counts[gid]:02d}'
        # Hard CAD edges stay sharp: split normals wherever faces meet at > 35 deg.
        m = trimesh.graph.smooth_shade(m, angle=np.radians(35))
        scene.add_geometry(m, node_name=node, geom_name=node)
    scene.export(out, include_normals=True)
    print('parts', len(meshes), 'groups', counts, 'tris', sum(len(m.faces) for *_, m in meshes))
    print('size m', (hi - lo) / 1000)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
