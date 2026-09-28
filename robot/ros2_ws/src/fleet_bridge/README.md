# fleet_bridge

Robot -> backend telemetry. Two nodes:

| Node | Source of the pose | Endpoint | Use |
|---|---|---|---|
| `gazebo_telemetry` | Gazebo ground truth (`/gazebo/model_states`) | `/api/simulation/pose` (Development preview only) | Web preview of the Gazebo world |
| `pose_telemetry` | AMCL: TF `map -> base_footprint` + `amcl_pose` covariance | `/api/robots/telemetry` | Real robot (and Gazebo running AMCL) on the Staff 3D twin and the Student 2D map |

Contract: `docs/architecture.md` §3.4.

## Real robot

1. Create the device secret once and register its hash (never commit the secret):

   ```bash
   python3 -c "import secrets,hashlib; s=secrets.token_urlsafe(32); print('secret:', s); print('sha256:', hashlib.sha256(s.encode()).hexdigest())"
   ```

   - With SQL Server: `UPDATE dbo.Robots SET CredentialHash = 0x<sha256> WHERE RobotCode = 'robot_01';`
     (`SourceType` must be `PHYSICAL` for the real robot).
   - Without a database: backend configuration
     `RobotTelemetry:Robots: [{ "RobotCode": "robot_01", "Source": "physical", "SecretSha256": "<sha256>" }]`
     and `RobotTelemetry:UseConfiguredRobots=true`.

2. On the robot, put `ROBOT_TELEMETRY_SECRET=<secret>` in the compose `.env` / `env_file`, keep the clock on NTP (chrony), then with AMCL running:

   ```bash
   ros2 launch fleet_bridge pose_telemetry.launch.py robot_id:=robot_01 \
       endpoint:=https://<backend>/api/robots/telemetry map_key:=campus_v1
   ```

3. Logs: `Backend refused pose (401)` = wrong secret/robot code; `(409)` = source differs from
   `Robots.SourceType`, or the clock is off (> 10 s behind / 5 s ahead).

## Gazebo with AMCL (no hardware)

Run `sim_navigation.launch.py`, register a robot with `Source: gazebo`, then launch with
`source:=gazebo use_sim_time:=true map_key:=<key of the map AMCL runs on>`. That key needs an
entry in `web/src/features/digital-twin/map-config.ts`; mark its `scene` calibrated only when
that map frame really lines up with the 3D scene, otherwise the twin lists the robot without placing it.

## Tests

```bash
cd robot/ros2_ws/src/fleet_bridge && PYTHONPATH=. python3 -m unittest discover -s test -p "test_*telemetry*.py"
```
