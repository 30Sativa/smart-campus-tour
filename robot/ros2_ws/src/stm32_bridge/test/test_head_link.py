"""Test logic dau quay/contactor cua stm32_bridge (khong can ROS)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from stm32_bridge.head_link import (  # noqa: E402
    ABORTED, DONE, JogRelay, PENDING, REJECTED, STATE_HOMING, STATE_IDLE,
    STATE_MOVING, STATE_NO_REF, STATE_OFF, SUPERSEDED, HeadFeedback,
    cmd_contactor, cmd_head_angle, cmd_head_jog, cmd_head_step, cmd_head_word,
    command_outcome, deg_to_cdeg, head_error_kind, next_seq,
    parse_head_feedback, seq_at_or_after,
)

FB19 = 'FB,9,100,110,20,OK,9000,1,1234,1,0,0,2000,1,500,0,2,4,1'


def fb(fb_seq, head_seq, state, pan=0, tilt=0, contactor=None):
    return HeadFeedback(fb_seq, head_seq, pan, tilt, state, contactor)


def test_parse_24_field_frame():
    h = parse_head_feedback(FB19 + ',22,9000,-1500,1,1')
    assert h is not None
    assert (h.fb_seq, h.head_seq, h.pan_cdeg, h.tilt_cdeg, h.state) == (9, 22, 9000, -1500, 1)
    assert h.contactor is True
    assert h.referenced and h.pan_deg == 90.0 and h.tilt_deg == -15.0


def test_parse_draft_23_field_frame_has_no_contactor():
    h = parse_head_feedback(FB19 + ',22,9000,-1500,2')
    assert h is not None and h.contactor is None and h.state == STATE_MOVING


def test_parse_old_firmware_and_garbage():
    assert parse_head_feedback(FB19) is None                     # 19 truong: chua co dau quay
    assert parse_head_feedback(FB19 + ',x,1,2,3,0') is None
    assert parse_head_feedback('ERR,head_limit') is None


def test_parse_ignores_unknown_trailing_fields():
    h = parse_head_feedback(FB19 + ',22,9000,-1500,1,0,777,888')
    assert h is not None and h.contactor is False and h.head_seq == 22


def test_referenced_only_idle_or_moving():
    assert fb(1, 1, STATE_IDLE).referenced
    assert fb(1, 1, STATE_MOVING).referenced
    for s in (STATE_OFF, STATE_HOMING, STATE_NO_REF):
        assert not fb(1, 1, s).referenced


def test_head_error_kind():
    assert head_error_kind('ERR,head_limit') == 'head_limit'
    assert head_error_kind('ERR,head_busy\r\n') == 'head_busy'
    assert head_error_kind('ERR,bad_command') is None


def test_command_formatting():
    assert cmd_head_angle(5, 90.0, -15.004) == 'HEAD,5,9000,-1500'
    assert cmd_head_angle(5, -0.006, 0.0) == 'HEAD,5,-1,0'
    assert cmd_head_word(6, 'HOME') == 'HEAD,6,HOME'
    assert cmd_head_word(6, 'STOP') == 'HEAD,6,STOP'
    assert cmd_head_step(7, -1, 2) == 'HEAD,7,STEP,-1,2'
    assert cmd_head_jog(8, 5, -3) == 'HEAD,8,JOG,1,-1'           # chi -1/0/1
    assert cmd_contactor(9, True) == 'CONTACTOR,9,ON'
    assert cmd_contactor(9, False) == 'CONTACTOR,9,OFF'
    assert deg_to_cdeg(165.0) == 16500
    try:
        cmd_head_word(1, 'SPIN')
        assert False, 'unknown word must raise'
    except ValueError:
        pass


def test_seq_wraps():
    assert seq_at_or_after(5, 5)
    assert seq_at_or_after(6, 5)
    assert not seq_at_or_after(4, 5)
    assert seq_at_or_after(1, 2 ** 32 - 2)                       # sau khi tran
    assert not seq_at_or_after(2 ** 32 - 2, 1)


def test_outcome_angle_command_lifecycle():
    assert command_outcome(50, fb(48, 40, STATE_IDLE)) == PENDING     # firmware chua toi seq 50
    assert command_outcome(50, fb(50, 50, STATE_MOVING)) == PENDING   # chap nhan, dang chay
    assert command_outcome(50, fb(53, 50, STATE_MOVING)) == PENDING   # CMD/STOP sau do khong lam sai
    assert command_outcome(50, fb(60, 50, STATE_IDLE)) == DONE


def test_outcome_home_lifecycle():
    assert command_outcome(70, fb(70, 70, STATE_HOMING)) == PENDING
    assert command_outcome(70, fb(400, 70, STATE_IDLE)) == DONE
    assert command_outcome(70, fb(400, 70, STATE_NO_REF)) == ABORTED  # HOME bi HEAD,STOP
    assert command_outcome(70, fb(400, 70, STATE_OFF)) == ABORTED


def test_outcome_rejected_and_superseded():
    # firmware da xu ly seq 50 (fb_seq >= 50) nhung head_seq van la lenh cu
    assert command_outcome(50, fb(50, 40, STATE_IDLE)) == REJECTED
    assert command_outcome(50, fb(55, 40, STATE_IDLE)) == REJECTED
    # mot lenh HEAD khac (52) duoc chap nhan sau lenh 50
    assert command_outcome(50, fb(52, 52, STATE_MOVING)) == SUPERSEDED


def test_head_seq_zero_means_nothing_accepted_yet():
    # Boot: head_seq=0. Lenh dau tien bi tu choi khong duoc doc nham la "da nhan".
    assert command_outcome(1, fb(0, 0, STATE_OFF)) == PENDING
    assert command_outcome(1, fb(1, 0, STATE_OFF)) == REJECTED
    assert next_seq(1) == 2
    assert next_seq(2 ** 32 - 1) == 1                            # tran: bo qua 0
    assert next_seq(0) == 1


def test_outcome_across_seq_wrap():
    near = 2 ** 32 - 1
    assert command_outcome(near, fb(2, near - 5, STATE_IDLE)) == REJECTED   # fb_seq da tran qua
    assert command_outcome(near, fb(near, near, STATE_IDLE)) == DONE
    assert command_outcome(near, fb(3, 1, STATE_MOVING)) == SUPERSEDED


def test_jog_relay_hold_release():
    r = JogRelay(timeout=0.25, keepalive_period=0.1)
    assert r.on_jog(1, 0, 0.00) == (1, 0)          # bat dau giu: gui ngay
    assert r.on_jog(1, 0, 0.05) is None            # trung, chua toi chu ky
    assert r.tick(0.08) is None
    assert r.on_jog(1, 0, 0.12) == (1, 0)          # keepalive tu nguon
    assert r.on_jog(0, 0, 0.15) == (0, 0)          # nha nut: gui ngay
    assert not r.active
    assert r.tick(1.0) is None                     # khong gui gi khi da nha


def test_jog_relay_keeps_firmware_fed_when_source_is_slow():
    r = JogRelay(timeout=0.25, keepalive_period=0.1)
    sent = [r.on_jog(0, -1, 0.0)]
    t = 0.0
    while t < 1.0:                                 # nguon publish 5 Hz (moi 0.2 s)
        t = round(t + 0.02, 2)
        if abs((t * 100) % 20) < 1e-6:
            sent.append(r.on_jog(0, -1, t))
        sent.append(r.tick(t))
    times = [x for x in sent if x is not None]
    assert len(times) >= 9                         # ~10 Hz du nguon chi 5 Hz
    assert all(x == (0, -1) for x in times)


def test_jog_relay_deadman_when_source_stops():
    r = JogRelay(timeout=0.25, keepalive_period=0.1)
    r.on_jog(-1, 1, 0.0)
    assert r.tick(0.1) == (-1, 1)
    assert r.tick(0.2) == (-1, 1)
    assert r.tick(0.26) == (0, 0)                  # nguon im 0.26 s > 0.25 s
    assert not r.active
    assert r.tick(0.5) is None


def test_jog_relay_direction_change_is_immediate():
    r = JogRelay()
    r.on_jog(1, 0, 0.0)
    assert r.on_jog(-1, 0, 0.01) == (-1, 0)
    assert r.on_jog(-1, 1, 0.02) == (-1, 1)
    assert r.on_jog(7, -9, 0.03) == (1, -1)        # kep ve -1/0/1
