"""Freeze test for Nav2 Baseline V3 (robot/docs/nav2-baseline-v3.md).

V3 = V2 + one purpose: no second motion source behind the behaviour tree's back.
  bt_navigator.default_server_timeout 20 -> 200 ms
  the two default trees -> *_v3.xml = the *_no_backup.xml trees + CancelSpin before
  navigating + CancelControl, Delay 500 ms, CancelControl, Delay 200 ms before Spin.
V2 stays frozen (test_nav2_baseline_v2_contract.py) for comparison and rollback.

Any value change makes it a new baseline version: add a new file, doc and hash.
"""

import copy
import hashlib
import json
import os
from pathlib import Path
import xml.etree.ElementTree as ET

import pytest
import yaml


SRC = Path(__file__).resolve().parents[2]
V2_PARAMS = 'robot_control/config/nav2_params_v2.yaml'
V3_PARAMS = 'robot_control/config/nav2_params_v3.yaml'
# sha256 of json.dumps(yaml.safe_load(file), sort_keys=True)
V3_PARAMS_SHA256 = 'e0cbd6ec8a31cb7880816a762646273f54422cd65d419121705280c1b46811b8'
TREES = 'robot_navigation/behavior_trees'
BT = ('bt_navigator', 'ros__parameters')


def _load(relative_path):
    return yaml.safe_load((SRC / relative_path).read_text(encoding='utf-8'))


def _flatten(d, prefix=()):
    out = {}
    for k, v in d.items():
        if isinstance(v, dict):
            out.update(_flatten(v, prefix + (k,)))
        else:
            out[prefix + (k,)] = v
    return out


def test_baseline_v3_params_are_frozen():
    canonical = json.dumps(_load(V3_PARAMS), sort_keys=True).encode()
    assert hashlib.sha256(canonical).hexdigest() == V3_PARAMS_SHA256, (
        'nav2_params_v3.yaml changed: this is no longer Nav2 Baseline V3. '
        'Publish a new baseline version (see robot/docs/nav2-baseline-v3.md).')


def test_v3_differs_from_v2_in_exactly_the_documented_keys():
    v2, v3 = _flatten(_load(V2_PARAMS)), _flatten(_load(V3_PARAMS))
    assert v2.keys() == v3.keys()
    changed = {k: (v2[k], v3[k]) for k in v2 if v2[k] != v3[k]}
    prefix = '$(find-pkg-share robot_navigation)/behavior_trees/'
    assert changed == {
        BT + ('default_server_timeout',): (20, 200),
        BT + ('default_nav_to_pose_bt_xml',): (prefix + 'navigate_to_pose_no_backup.xml',
                                               prefix + 'navigate_to_pose_v3.xml'),
        BT + ('default_nav_through_poses_bt_xml',): (prefix + 'navigate_through_poses_no_backup.xml',
                                                     prefix + 'navigate_through_poses_v3.xml'),
    }


def _tree(name):
    return ET.parse(SRC / TREES / name).getroot()


GUARDS = {'NavigateWithSpinCancelled': 'PipelineSequence', 'SpinAfterFollowPathCancelled': 'Spin'}


def _unguard(root):
    """The V3 tree with the guards removed (each guard Sequence replaced by the node it guards)."""
    root = copy.deepcopy(root)
    for parent in root.iter():
        for i, child in enumerate(list(parent)):
            if child.tag == 'Sequence' and child.get('name') in GUARDS:
                [guarded] = [c for c in child.iter() if c.tag == GUARDS[child.get('name')]]
                parent.remove(child)
                parent.insert(i, guarded)
    return root


def _canon(root):
    for e in root.iter():
        e.text = e.tail = None
    return ET.tostring(root)


@pytest.mark.parametrize('kind', ['navigate_to_pose', 'navigate_through_poses'])
def test_v3_tree_is_the_no_backup_tree_plus_two_cancel_guards(kind):
    v3 = _tree(f'{kind}_v3.xml')
    assert _canon(_unguard(v3)) == _canon(_tree(f'{kind}_no_backup.xml'))

    recovery = v3.find('./BehaviorTree/RecoveryNode[@name="NavigateRecovery"]')
    navigate, fallback = list(recovery)
    # a Spin left running by a timed-out Spin node is cancelled before FollowPath starts
    assert navigate.tag == 'Sequence' and [c.tag for c in navigate] == ['CancelSpin', 'PipelineSequence']
    assert navigate[0].get('server_name') == 'spin'
    # an orphan FollowPath is cancelled before Spin starts, and once more 500 ms later for a
    # goal the controller accepted after the first cancel; Clearing and Wait do not move
    assert fallback.tag == 'ReactiveFallback'
    [guard] = fallback.findall('./RoundRobin/Sequence[@name="SpinAfterFollowPathCancelled"]')
    assert [c.tag for c in guard] == ['CancelControl', 'Delay', 'Delay']
    assert guard[0].get('server_name') == 'follow_path'
    assert guard[1].get('delay_msec') == '500'
    assert [(c.tag, c.get('server_name')) for c in guard[1]] == [('CancelControl', 'follow_path')]
    # the controller loop (10 Hz) acts on a cancel up to ~0.1 s after accepting it
    assert guard[2].get('delay_msec') == '200' and [c.tag for c in guard[2]] == ['Spin']
    assert [e.tag for e in v3.iter() if e.tag in ('Spin', 'BackUp', 'DriveOnHeading')] == ['Spin']
    # the server timeout comes from default_server_timeout, not a per-node override
    assert all(e.get('server_timeout') is None for e in v3.iter())
    assert not [e for e in v3.iter() if e.tag == 'BackUp']


@pytest.mark.skipif(not os.path.isdir('/opt/ros/humble/lib'), reason='needs the Nav2 Humble BT plugins')
@pytest.mark.parametrize('lib, tag', [('libnav2_controller_cancel_bt_node.so', b'CancelControl'),
                                      ('libnav2_spin_cancel_bt_node.so', b'CancelSpin')])
def test_cancel_nodes_exist_in_the_installed_nav2(lib, tag):
    # both libraries are in bt_navigator's default plugin_lib_names on Humble
    assert tag in Path('/opt/ros/humble/lib', lib).read_bytes()


def test_baseline_v3_is_not_the_production_default():
    navigation = (SRC / 'robot_navigation/launch/navigation.launch.py').read_text(encoding='utf-8')
    assert 'nav2_params_v3' not in navigation
    assert "'nav2_params.yaml'" in navigation
