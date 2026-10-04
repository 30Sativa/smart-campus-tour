"""Resolve manifest exec/depend keys to apt packages without shipping rosdep."""

import argparse
import os
import re
import subprocess


def apt_packages(output):
    """Reject other installers/invalid output instead of omitting a dependency."""
    result = set()
    installer = None
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith('#ROSDEP[') and line.endswith(']'):
            installer = None
            continue
        if line.startswith('#'):
            installer = line[1:].strip()
            if installer != 'apt':
                raise ValueError(f'Runtime dependency uses unsupported installer: {installer}')
            continue
        if installer != 'apt':
            raise ValueError('rosdep returned packages without an apt installer')
        for package in line.split():
            if not re.fullmatch(r'[a-z0-9][a-z0-9+.-]*(?::[a-z0-9]+)?', package):
                raise ValueError(f'Invalid apt package name: {package}')
            result.add(package)
    if not result:
        raise ValueError('No runtime packages resolved')
    return sorted(result)


def resolve(source, distro, skip_keys, run=subprocess.check_output):
    # --ignore-src must skip local packages, not packages already installed in
    # the builder's sourced ROS environment: the final image needs those too.
    env = {key: value for key, value in os.environ.items()
           if key not in ('AMENT_PREFIX_PATH', 'ROS_PACKAGE_PATH')}
    keys = run([
        'rosdep', 'keys', '--from-paths', source, '--ignore-src',
        '--rosdistro', distro, '--dependency-types', 'exec',
    ], text=True, env=env).splitlines()
    keys = sorted(set(keys) - set(skip_keys))
    if not keys:
        raise ValueError('No manifest runtime dependency keys found')
    return apt_packages(run(
        ['rosdep', 'resolve', '--rosdistro', distro, *keys], text=True, env=env))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source')
    parser.add_argument('--rosdistro', required=True)
    parser.add_argument('--skip-keys', default='')
    args = parser.parse_args()
    print('\n'.join(resolve(args.source, args.rosdistro, args.skip_keys.split())))
