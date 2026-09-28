#!/usr/bin/env python3
"""Phase 4 step 0: measure the detector on the ACTUAL mini PC before building.

The Dell OptiPlex 3050 Micro has an i3-7100T: 2 cores / 4 threads, 35 W, no
discrete GPU.  Nav2 already lives on those threads.  Whether Phase 4 is even
possible is a measurement, not an opinion -- and the answer decides the design,
so it comes first.

The default run measures CPU only. GPU probing is opt-in because it is not part
of the selected runtime policy:

GPU is added only with `--include-gpu`.

Export the first candidate on a development machine (ultralytics/torch are not
needed on the robot). Precision is selected and recorded after export:

    pip install ultralytics
    yolo export model=yolo26n.pt format=openvino imgsz=320
    # -> yolo26n_openvino_model/yolo26n.xml  (+ .bin)

Copy the exported folder to the host model directory mounted at `/opt/models`
in Compose, then run in the robot container:

    python3 bench_detector.py /opt/models/yolo26n_openvino_model/yolo26n.xml \
        --manifest-out /tmp/person-model-manifest.json

This is a microbenchmark only. The live pipeline rate, drops, and e2e latency
must be measured with RGB, depth, Nav2, and DDS active.
"""

import argparse
import hashlib
import json
import os
import platform
import statistics
import sys
import time

import numpy as np


def bench(xml_path, device, imgsz, threads, iters, warmup):
    import openvino as ov

    core = ov.Core()
    if device not in core.available_devices:
        return None, f'device "{device}" not available (co: {core.available_devices})'

    cfg = {'PERFORMANCE_HINT': 'LATENCY'}
    if device == 'CPU' and threads:
        # A detector that eats every thread starves nav2_controller and the
        # control loop starts missing its 10 Hz deadline.  Pin it.
        cfg['INFERENCE_NUM_THREADS'] = threads

    try:
        model = core.read_model(xml_path)
        model_precision = str(model.input(0).element_type)
        compiled = core.compile_model(model, device, cfg)
    except Exception as exc:  # noqa: BLE001
        return None, f'{type(exc).__name__}: {exc}'

    inp = compiled.input(0)
    shape = list(inp.shape)
    # Ultralytics exports NCHW with a dynamic batch; pin what we cannot infer.
    for i, d in enumerate(shape):
        if d in (-1, 0) or str(d) == '?':
            shape[i] = 1 if i == 0 else imgsz
    blob = np.random.rand(*shape).astype(np.float32)

    req = compiled.create_infer_request()
    for _ in range(warmup):
        req.infer({0: blob})

    times = []
    for _ in range(iters):
        t0 = time.perf_counter()
        req.infer({0: blob})
        times.append((time.perf_counter() - t0) * 1000.0)

    out_shapes = [tuple(o.shape) for o in compiled.outputs]
    return {
        'p50': statistics.median(times),
        'p95': sorted(times)[int(0.95 * len(times)) - 1],
        'mean': statistics.fmean(times),
        'in_shape': tuple(shape),
        'out_shapes': out_shapes,
        'input_dtype': str(blob.dtype),
        'runtime_version': ov.__version__,
        'model_input_precision': model_precision,
    }, None


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as model_file:
        for block in iter(lambda: model_file.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('xml', help='Path to the exported OpenVINO .xml')
    ap.add_argument('--imgsz', type=int, default=320)
    ap.add_argument('--threads', type=int, default=2,
                    help='CPU threads for inference. Leave 1-2 free for Nav2.')
    ap.add_argument('--iters', type=int, default=100)
    ap.add_argument('--warmup', type=int, default=10)
    ap.add_argument('--target-hz', type=float, default=5.0,
                    help='Reference cycle rate; this script is still a synthetic tensor microbenchmark.')
    ap.add_argument('--manifest-out', default='',
                    help='Optional path to write measured runtime/model manifest JSON.')
    ap.add_argument('--include-gpu', action='store_true',
                    help='Also benchmark GPU explicitly; CPU remains the default candidate.')
    args = ap.parse_args()

    print('MODE    : synthetic tensor microbenchmark (not camera pipeline evidence)')
    print(f'model   : {args.xml}')
    print(f'imgsz   : {args.imgsz}   threads(CPU): {args.threads}   iters: {args.iters}')
    print('-' * 62)

    results = {}
    devices = ['CPU', 'GPU'] if args.include_gpu else ['CPU']
    for dev in devices:
        r, err = bench(args.xml, dev, args.imgsz, args.threads, args.iters, args.warmup)
        if err:
            print(f'{dev:<4} : KHONG CHAY DUOC -- {err}')
            if dev == 'GPU':
                print('       (HD 630 la Gen9.5; OpenVINO GPU plugin hay hong tren doi nay.')
                print('        Khong sao -- dung CPU, day chinh la ly do phai do truoc.)')
            continue
        results[dev] = r
        print(f'{dev:<4} : infer-call p50 {r["p50"]:6.1f} ms | p95 {r["p95"]:6.1f} ms')

    if not results:
        print('\nKhong device nao chay duoc. Kiem tra lai duong dan .xml va '
              'xac nhan robot image co OpenVINO 2024.6.0 da pin.')
        return 1

    best_dev = min(results, key=lambda d: results[d]['p50'])
    best = results[best_dev]
    budget_ms = 1000.0 / args.target_hz
    load = 100.0 * best['p50'] / budget_ms

    print('-' * 62)
    print(f'input  : {best["in_shape"]}')
    print(f'output : {best["out_shapes"]}')
    print(f'   (1, N, 6) = model NMS-free (YOLO26) -> parser don gian')
    print(f'   (1, 84, N) = con phai chay NMS tren CPU -> cong them vai ms')
    print()
    print(f'Reference cycle: {args.target_hz:.0f} Hz; tensor p50 uses {load:.0f}% of {budget_ms:.0f} ms.')
    print('Unique RGB frame rate: NOT MEASURED (no camera input). Drops: NOT MEASURED.')
    print('Camera/depth/ROS e2e latency: NOT MEASURED.')
    print('This result cannot establish pipeline e2e latency, detector recall, or safe operating rate.')
    model_files=[args.xml,os.path.splitext(args.xml)[0]+'.bin']
    manifest={'mode':'synthetic_tensor_microbenchmark','model_xml':os.path.abspath(args.xml),
      'model_files_sha256':{f:sha256(f) for f in model_files if os.path.isfile(f)},
      'platform':platform.platform(),'python':sys.version,'device':best_dev,
      'imgsz':args.imgsz,'batch':1,'threads':args.threads,'iterations':args.iters,
      'warmup':args.warmup,'target_hz_reference':args.target_hz,'input_shape':best['in_shape'],
      'input_dtype':best['input_dtype'],'output_shapes':best['out_shapes'],
      'model_input_precision':best['model_input_precision'],
      'openvino_version':best['runtime_version'],'inference_p50_ms':best['p50'],
      'inference_p95_ms':best['p95'],'e2e_pipeline':'not measured',
      'unique_frame_rate_hz':'not measured','drops':'not measured'}
    if args.manifest_out:
        with open(args.manifest_out,'w',encoding='utf-8') as mf:
            json.dump(manifest,mf,indent=2)
        print(f'Manifest: {os.path.abspath(args.manifest_out)}')
    print()
    print('Bay gio chay lai LAN NUA trong khi navigation.launch.py dang chay.')
    print('Con so do moi la con so that.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
