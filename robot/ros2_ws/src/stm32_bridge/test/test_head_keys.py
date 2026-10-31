"""Logic phim cua head_teleop: nhan = 1 buoc, giu = JOG, nha = JOG 0,0."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from stm32_bridge.head_keys import HoldDetector, parse_keys  # noqa: E402


def test_parse_arrows_wasd_and_partial_escape():
    keys, rest = parse_keys('\x1b[A\x1b[Dwq\x1b[')
    assert keys == ['up', 'left', 'up', 'q'] and rest == '\x1b['
    keys, rest = parse_keys(rest + 'B')
    assert keys == ['down'] and rest == ''
    assert parse_keys('\x1bOC')[0] == ['right']          # che do "application cursor"


def test_single_press_is_one_step_and_nothing_else():
    h = HoldDetector()
    assert h.on_key('left', 0.0) == [('step', (1, 0))]
    out = []
    t = 0.0
    while t < 2.0:
        t += 0.02
        out += h.tick(t)
    assert out == []                                     # khong JOG khi khong giu


def test_hold_starts_jog_keeps_alive_then_stops_on_release():
    h = HoldDetector()
    out = h.on_key('right', 0.0)                          # nhan: 1 buoc
    t = 0.5                                               # lan lap dau cua OS
    out += h.on_key('right', t)
    while t < 1.5:                                        # OS lap ~30 Hz
        t = round(t + 0.03, 3)
        out += h.on_key('right', t) + h.tick(t)
    assert out[0] == ('step', (-1, 0))
    jogs = [a for a in out[1:] if a[0] == 'jog']
    assert jogs and all(d == (-1, 0) for _, d in jogs)
    assert len(jogs) >= 9                                 # ~10 Hz keepalive
    stop = []
    while t < 1.8:                                        # nha phim
        t = round(t + 0.02, 3)
        stop += h.tick(t)
    # Trong 0,15 s truoc khi nhan ra da nha co the con 1 keepalive; ket thuc
    # bang dung 1 lenh JOG 0,0.
    assert stop[-1] == ('jog', (0, 0))
    assert all(a == ('jog', (-1, 0)) for a in stop[:-1]) and len(stop) <= 3
    assert not h.jogging and h.tick(t + 1.0) == []


def test_change_direction_while_holding_stops_then_steps():
    h = HoldDetector()
    h.on_key('up', 0.0)
    h.on_key('up', 0.5)                                    # dang giu
    assert h.on_key('down', 0.55) == [('jog', (0, 0)), ('step', (0, -1))]


def test_slow_taps_are_separate_steps():
    h = HoldDetector()
    assert h.on_key('up', 0.0) == [('step', (0, 1))]
    h.tick(1.0)
    assert h.on_key('up', 1.0) == [('step', (0, 1))]       # > repeat_window: nhan moi


def test_release_while_jogging():
    h = HoldDetector()
    h.on_key('left', 0.0)
    h.on_key('left', 0.4)
    assert h.release() == [('jog', (0, 0))]
    assert h.release() == []
