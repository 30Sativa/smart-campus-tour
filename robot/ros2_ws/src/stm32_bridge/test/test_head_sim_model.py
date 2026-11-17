"""head_sim (Gazebo): mo hinh dau quay gia lap phai lam dung nhu firmware nhin tu ben ngoai."""

import pytest
from stm32_bridge.head_sim_model import (
    STATE_HOMING,
    STATE_IDLE,
    STATE_MOVING,
    STATE_NO_REF,
    STATE_OFF,
    HeadSimModel,
    describe,
    plan_seconds,
)


def run(model, seconds, dt=0.02, start=0.0):
    t = start
    while t < start + seconds:
        t += dt
        model.tick(dt, t)
    return t


def homed():
    model = HeadSimModel()
    model.home()
    run(model, 30.0)
    return model


def test_boots_off_and_refuses_angles_until_homed():
    model = HeadSimModel()
    assert model.state == STATE_OFF and not model.referenced
    assert model.angle(10, 0) == (False, 'rejected:head_not_zeroed')


def test_home_finds_the_stops_then_returns_to_zero():
    model = HeadSimModel(pan=40.0, tilt=5.0)
    model.home()
    assert model.state == STATE_HOMING
    # PAN 40 -> -174 at 20 deg/s is 10.7 s, then 174 back at 60 deg/s is 2.9 s.
    assert plan_seconds(model) == pytest.approx(214 / 20 + 174 / 60)
    run(model, 5.0)
    assert model.state == STATE_HOMING and not model.referenced
    run(model, 10.0, start=5.0)
    assert (model.state, model.referenced, model.pan, model.tilt) == (STATE_IDLE, True, 0.0, 0.0)


def test_angle_within_limits_at_60_deg_per_second():
    model = homed()
    assert model.angle(45, 10) == (True, 'moving')
    assert model.state == STATE_MOVING
    assert plan_seconds(model) == pytest.approx(0.75)
    run(model, 1.0)
    assert (model.pan, model.tilt, model.state) == (45.0, 10.0, STATE_IDLE)
    assert describe(model) == 'PAN 45 trai, TILT 10 ngua, IDLE'


@pytest.mark.parametrize('pan,tilt', [(171, 0), (-171, 0), (0, 18.5), (0, -27)])
def test_angles_past_the_soft_limits_are_rejected(pan, tilt):
    model = homed()
    assert model.angle(pan, tilt) == (False, 'rejected:head_limit')
    assert (model.pan, model.tilt) == (0.0, 0.0)


def test_steps_use_the_gearbox_sizes_and_stop_at_the_limits():
    model = homed()
    model.step(15, 15)
    run(model, 1.0)
    assert model.pan == pytest.approx(9.0)       # 15 x 0.6 (PAN 3:1)
    assert model.tilt == pytest.approx(5.4)      # 15 x 0.36 (TILT 5:1)
    model.step(0, 100)
    run(model, 1.0)
    assert model.tilt == 18.0


def test_sweep_goes_left_then_right_then_back_and_shrinks_at_the_limit():
    model = homed()
    model.angle(-90, 0)
    run(model, 2.0)
    assert model.sweep(135) == (True, 'started')
    seen = []
    t = 0.0
    while model.state != STATE_IDLE:
        t += 0.02
        model.tick(0.02, t)
        seen.append(model.pan)
    assert max(seen) == pytest.approx(45.0, abs=0.7)      # -90 + 135 (sampled every 20 ms)
    assert min(seen) == pytest.approx(-170.0, abs=0.7)    # -90 - 135 = -225, held at the soft limit
    assert model.pan == -90.0


def test_sweep_needs_a_head_at_rest():
    model = homed()
    model.angle(30, 0)
    assert model.sweep(90) == (False, 'not_ready:MOVING')


def test_jog_needs_to_be_repeated_or_it_stops():
    model = homed()
    model.jog(1, 0, now=0.0)
    run(model, 0.2)
    assert model.pan == pytest.approx(6.0, abs=0.7)
    run(model, 1.0, start=0.2)                    # nothing re-sent: deadman after 0.3 s
    assert model.state == STATE_IDLE
    assert model.pan < 10.0


def test_stop_during_home_keeps_holding_without_a_reference():
    model = HeadSimModel()
    model.home()
    run(model, 1.0)
    model.stop()
    assert (model.state, model.referenced) == (STATE_NO_REF, False)
    assert model.angle(0, 0)[0] is False


def test_each_accepted_command_advances_the_sequence():
    model = homed()
    seq = model.seq
    model.angle(10, 0)
    model.angle(999, 0)                           # rejected: no new seq
    assert model.seq == seq + 1
