export type ModelPoint = [number, number, number]

export type CampusModelConfig = {
  url: string
  format: 'obj' | 'gltf'
  upAxis: 'Y' | 'Z'
  scale: number
  rotationDegrees: number
  /** Anchors use original model coordinates, before axis conversion or scaling. */
  locationAnchors: Record<string, ModelPoint>
  /** Only set after surveying how the API's 0..100 plan maps onto this model. */
  planCalibration: {
    origin: ModelPoint
    xAxis: ModelPoint
    yAxis: ModelPoint
  } | null
}

/** Replace the URL/format here when the final campus model is ready. */
export const CAMPUS_MODEL: CampusModelConfig = {
  url: '/models/campus/campus.obj',
  format: 'obj',
  upAxis: 'Z',
  scale: 1,
  rotationDegrees: 0,
  locationAnchors: {},
  // The current visitor fixtures describe a different plan. Never place those
  // percentages onto arbitrary rooms, or draw straight lines through walls.
  planCalibration: null,
}

export function modelAnchorForPin(
  pin: { id: string; x: number; y: number; role: string },
  config: CampusModelConfig,
): ModelPoint | null {
  const anchor = pin.role !== 'robot' ? config.locationAnchors[pin.id] : undefined
  if (anchor?.every(Number.isFinite)) return anchor
  const calibration = config.planCalibration
  if (!calibration || !Number.isFinite(pin.x) || !Number.isFinite(pin.y)) return null
  return calibration.origin.map((origin, axis) => origin + calibration.xAxis[axis] * pin.x / 100 + calibration.yAxis[axis] * pin.y / 100) as ModelPoint
}
