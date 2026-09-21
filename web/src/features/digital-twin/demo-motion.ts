/** Local presentation fixture, not a robot transport contract or physics model. */
export type RobotPose = { x: number; y: number; yaw: number }

export const DEMO_RADIUS = 4
export const DEMO_SPEED = 0.8
export const DEMO_DURATION = 2 * Math.PI * DEMO_RADIUS / DEMO_SPEED

export function demoPose(seconds: number): RobotPose {
  const angle = Math.max(0, seconds) * DEMO_SPEED / DEMO_RADIUS
  return {
    x: DEMO_RADIUS * Math.cos(angle),
    y: DEMO_RADIUS * Math.sin(angle),
    yaw: Math.atan2(Math.cos(angle), -Math.sin(angle)),
  }
}

/** ROS map: x/y ground, z up. Scene: x/-z ground, y up; metres, no offset. */
export function mapToScene(pose: RobotPose) {
  return { position: [pose.x, 0, -pose.y] as [number, number, number], rotation: pose.yaw }
}

export const DEMO_ROUTE = Array.from({ length: 97 }, (_, index) => {
  const { position } = mapToScene(demoPose(index / 96 * DEMO_DURATION))
  return [position[0], 0.025, position[2]] as [number, number, number]
})
