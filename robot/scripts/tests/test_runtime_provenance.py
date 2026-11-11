"""runtime_provenance.py on a fake install tree: symlink vs copied installs, diffs against a ref."""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, '..', 'runtime_provenance.py')
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
PKG_SRC = os.path.join(REPO, 'robot', 'ros2_ws', 'src', 'robot_navigation')


def make_prefix(root, pkg, files, link_to=None):
    share = root / 'share' / pkg
    (root / 'share' / 'ament_index' / 'resource_index' / 'packages').mkdir(parents=True, exist_ok=True)
    (root / 'share' / 'ament_index' / 'resource_index' / 'packages' / pkg).write_text('')
    (share / 'launch').mkdir(parents=True)
    if link_to:
        (share / 'package.xml').symlink_to(os.path.join(link_to, 'package.xml'))
    else:
        (share / 'package.xml').write_text('<package/>')
    for rel, data in files.items():
        (share / rel).parent.mkdir(parents=True, exist_ok=True)
        (share / rel).write_bytes(data)


def run(prefix):
    env = dict(os.environ, AMENT_PREFIX_PATH=str(prefix))
    return subprocess.run([sys.executable, SCRIPT, '--ref', 'HEAD', '--strict'], env=env, capture_output=True, text=True)


def committed(rel):
    return subprocess.run(['git', 'show', f'HEAD:robot/ros2_ws/src/robot_navigation/{rel}'], cwd=REPO,
                          capture_output=True, check=True).stdout


def test_matching_copied_install_passes(tmp_path):
    rel = 'launch/navigation.launch.py'
    make_prefix(tmp_path, 'robot_navigation', {rel: committed(rel), 'launch/__pycache__/x.pyc': b'\0'})
    r = run(tmp_path)
    line = next(x for x in r.stdout.splitlines() if x.startswith('robot_navigation'))
    assert 'copied install' in line
    assert '1 same, 0 different' in r.stdout
    assert r.returncode == 0, r.stdout


def test_a_changed_launch_file_is_reported_and_strict_fails(tmp_path):
    make_prefix(tmp_path, 'robot_navigation', {'launch/navigation.launch.py': b'# edited on the robot\n'})
    r = run(tmp_path)
    assert '0 same, 1 different: launch/navigation.launch.py' in r.stdout
    assert r.returncode == 1


def test_symlink_install_names_the_checkout_it_follows(tmp_path):
    make_prefix(tmp_path, 'robot_navigation', {}, link_to=PKG_SRC)
    r = run(tmp_path)
    line = next(x for x in r.stdout.splitlines() if x.startswith('robot_navigation'))
    assert 'symlink-install ->' in line and REPO in line


def test_packages_missing_from_the_environment_are_listed(tmp_path):
    make_prefix(tmp_path, 'robot_navigation', {})
    assert 'stm32_bridge           NOT ON AMENT_PREFIX_PATH' in run(tmp_path).stdout
