import { CampusModel } from '../../../digital-twin/CampusModel'
import { CampusLighting } from '../../../digital-twin/CampusLighting'

/** The operations Twin's floor model (NVH tầng 6), as on the Staff map. */
export function NvhMap() {
  return <CampusModel modelKey="nvh-v3" />
}

/** The Twin's daylight and ceiling lamps. */
export function NvhLights() {
  return <CampusLighting />
}
