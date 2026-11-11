#!/usr/bin/env python3
"""Where does each robot package in the CURRENT shell come from, and does it match a git ref?

Read-only. Source the runtime exactly as an operator would (source-minipc, then any
overlay), then:

    python3 robot/scripts/runtime_provenance.py [--ref origin/main] [--strict]

For every package under robot/ros2_ws/src it prints the install prefix that wins on
AMENT_PREFIX_PATH, whether that install is a symlink-install (and so follows whatever
checkout it points at), the checkout's HEAD and dirty state, and the files under
launch/ and config/ that differ from --ref. --strict exits 1 on any difference.
"""
import argparse
import hashlib
import os
import subprocess
import sys

ROBOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROBOT, 'ros2_ws', 'src')
REPO = os.path.dirname(ROBOT)


def git(*args, cwd=REPO):
    r = subprocess.run(['git', *args], cwd=cwd, capture_output=True)
    return r.stdout if r.returncode == 0 else None


def packages():
    out = {}
    for root, dirs, files in os.walk(SRC):
        if 'third_party' in root.split(os.sep) or 'COLCON_IGNORE' in files:
            dirs[:] = []
            continue
        if 'package.xml' in files:
            out[os.path.basename(root)] = os.path.relpath(root, REPO)
            dirs[:] = []
    return dict(sorted(out.items()))


def prefix_of(pkg):
    for p in os.environ.get('AMENT_PREFIX_PATH', '').split(os.pathsep):
        if p and os.path.exists(os.path.join(p, 'share', 'ament_index', 'resource_index', 'packages', pkg)):
            return p
    return None


def checkout_of(path):
    top = git('rev-parse', '--show-toplevel', cwd=os.path.dirname(path))
    if not top:
        return None
    top = top.decode().strip()
    head = git('rev-parse', '--short', 'HEAD', cwd=top).decode().strip()
    branch = (git('rev-parse', '--abbrev-ref', 'HEAD', cwd=top) or b'?').decode().strip()
    dirty = bool((git('status', '--porcelain', '--untracked-files=no', cwd=top) or b'').strip())
    return dict(checkout=top, head=head, branch=branch, dirty=dirty)


def compare(pkg, rel_src, share, ref):
    """Files of launch/ and config/ in the installed share vs the same paths at ref."""
    diffs, same = [], 0
    for sub in ('launch', 'config'):
        d = os.path.join(share, sub)
        if not os.path.isdir(d):
            continue
        for root, dirs, files in os.walk(d):
            dirs[:] = [x for x in dirs if x != '__pycache__']
            for f in files:
                if f.endswith('.pyc'):
                    continue
                inst = os.path.join(root, f)
                rel = os.path.relpath(inst, share)
                want = git('show', f'{ref}:{rel_src}/{rel}')
                if want is None:
                    diffs.append(f'{rel} (not in {ref})')
                    continue
                have = open(inst, 'rb').read()
                if hashlib.sha256(have).digest() == hashlib.sha256(want).digest():
                    same += 1
                else:
                    diffs.append(rel)
    return same, diffs


def report(ref):
    rows = []
    for pkg, rel_src in packages().items():
        prefix = prefix_of(pkg)
        row = dict(package=pkg, prefix=prefix)
        if prefix:
            share = os.path.join(prefix, 'share', pkg)
            probe = next((os.path.join(share, f) for f in ('package.xml',) if os.path.lexists(os.path.join(share, f))), None)
            real = os.path.realpath(probe) if probe else None
            row['symlink_install'] = bool(probe and os.path.islink(probe))
            row['source'] = checkout_of(real) if row['symlink_install'] else None
            row['same'], row['diffs'] = compare(pkg, rel_src, share, ref)
        rows.append(row)
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--ref', default='origin/main')
    ap.add_argument('--strict', action='store_true')
    a = ap.parse_args(argv)
    if git('rev-parse', '--verify', '--quiet', a.ref + '^{commit}') is None:
        print(f'unknown git ref {a.ref}')
        return 2
    rows = report(a.ref)
    ndiff = 0
    for r in rows:
        if not r['prefix']:
            print(f"{r['package']:22s} NOT ON AMENT_PREFIX_PATH")
            continue
        kind = 'symlink-install' if r['symlink_install'] else 'copied install'
        src = r['source']
        follows = f" -> {src['checkout']} {src['branch']}@{src['head']}{' DIRTY' if src['dirty'] else ''}" if src else ''
        print(f"{r['package']:22s} {r['prefix']}  [{kind}{follows}]")
        print(f"{'':22s} launch/config vs {a.ref}: {r['same']} same, {len(r['diffs'])} different"
              + (': ' + ', '.join(r['diffs']) if r['diffs'] else ''))
        ndiff += len(r['diffs'])
    return 1 if a.strict and ndiff else 0


if __name__ == '__main__':
    sys.exit(main())
