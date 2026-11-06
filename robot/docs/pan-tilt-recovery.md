# PAN/TILT recovery — 2026-11-05

The `Son` snapshot retained the updated head settings but omitted the serial
integration, generated ROS interface definitions, and firmware timer adapter.
The missing integration is restored from the existing `main` history, including
the IMU feedback-counter dependencies and motor test fixtures used by that
baseline. No backend or fleet-command feature is enabled by this recovery.

## Requested behavior

- PAN/TILT commands do not check or change contactor state.
- Both drivers use full steps: PAN 0.6 degrees at the output with a 3:1
  gearbox; TILT 1.8 degrees with direct drive.
- PAN HOME seeks right approximately 190 degrees and returns 174 degrees.
  Electrical-phase alignment can add up to three full steps to the seek.
- TILT HOME seeks down toward the stop at 20 degrees, then returns to level.
  Normal motion is limited to -18 through +18 degrees; PAN uses +/-170 degrees.
- Contactor output is PA10, enabled at boot. PB10 belongs to TILT nEN.
  Feedback reports the commanded output, not physical contact closure.
- The bridge automatically requests HOME after detecting an STM32 boot and
  requests a return to zero on graceful shutdown when a reference is available.

## Verification

- 103 offline STM32 bridge tests pass, including shared serial sequence wrap,
  error forwarding, auto-HOME with contactor off, and startup behavior.
- All eight firmware host-test executables pass, including full-step,
  high-speed and 1/16-microstep head variants.
- ARM compiler syntax checks pass for the head, contactor, app, protocol,
  generated main and interrupt sources. This is not a linked ARM firmware build.
- `scripts/verify robot` fails at Ruff lint. Python syntax, YAML and the
  tracked-build-output guard pass. ROS build/tests and xacro are unavailable
  in the current Windows environment. This recovery is not DONE (verified).

## Hardware validation still required

Regenerate/build the restored `robot/firmware/stm32/motor_controller/motor_controller.ioc`
project in STM32CubeIDE and flash manually over ST-Link. Confirm the physical
PA10/PB10 wiring against `robot/firmware/stm32/motor_controller/docs/PIN_MAP.md`.
Rebuild `bus_interfaces` and `stm32_bridge` in the ROS 2 deployment environment.

Start with automatic motion disabled:

```bash
ros2 launch stm32_bridge stm32_bridge.launch.py head_auto_home:=false
```

Then explicitly test HOME:

```bash
ros2 action send_goal /head/set bus_interfaces/action/SetHead '{mode: 1}' --feedback
```

Expect PAN to seek right and return toward the front, TILT to seek down and
return toward level, and `head/state` to finish IDLE with a reference.
Test contactor OFF independently through `contactor/set`; head commands must
remain accepted. Use the robot namespace prefix when applicable.

The 190-degree PAN seek only reaches the stop from the documented starting
range (174 degrees right through 16 degrees left). Graceful parking cannot
guarantee that range after power loss or manual rotation. Pulse counts and the
rotor model do not prove physical angle accuracy, successful contact with the
stop, or absence of missed steps. Measure repeated HOME and travel on hardware;
TILT's nominal 20-degree return rounds to 19.8 degrees at full steps.
