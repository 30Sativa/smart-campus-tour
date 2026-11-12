import type { ReactNode } from 'react'
import { RobotViewer } from './RobotDriveViewer'
import { fptWorld } from './worlds/fpt-world'
import { nvhWorld } from './worlds/nvh-world'

const WORLDS = [fptWorld, nvhWorld] as const

/** The test-drive page's stage: the robot on the FPT campus demo or the NVH floor, to drive. */
export default function RobotDrive({ intro }: { intro?: ReactNode }) {
  return <RobotViewer worlds={WORLDS} mode="drive" intro={intro} />
}
