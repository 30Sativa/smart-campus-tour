import type { MutableRefObject, ReactNode } from 'react'
import { RobotViewer } from './RobotDriveViewer'
import { studioWorld } from './worlds/studio-world'

const WORLDS = [studioWorld] as const

/** The home page's section 04: the robot alone on a stage (no map loads here), its parts once the story has played. */
export default function RobotShowcase(props: { visible?: boolean; intro?: ReactNode; storyRef?: MutableRefObject<number>; chapter?: number; driveTo?: string }) {
  return <RobotViewer worlds={WORLDS} mode="showcase" {...props} />
}
