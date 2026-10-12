import { fleetMetrics, injectScenario, PATROL_TICK, stepPatrol, type FleetScenario, type PatrolState } from './patrol-demo'
import { distance, visibleSegment } from './patrol-routing'
const modes: Record<string, string> = { moving: 'Đang đi', observing: 'Quan sát', yielding: 'Đang vào chỗ tránh', yielded: 'Đã nhường đường', paused: 'Tạm dừng', fault: 'Lỗi thiết bị', charging: 'Đang sạc' }
export const robotModeLabel = (state: PatrolState['robots'][number]) => `${modes[state.mode]}${state.yieldTo ? ` · nhường R${state.yieldTo}` : state.waiting ? ' · chờ tuyến thông' : ''}`

export function cameraPerception(state: PatrolState, number: number) {
  if (state.cameraOffline) return { status: 'OFFLINE', obstacles: [] as { number: number; distance: number }[] }
  const robot = state.robots.find(r => r.number === number)!
  const obstacles = state.robots.filter(r => r.number !== number && distance(robot.pose, r.pose) <= 4 && Math.abs(Math.atan2(Math.sin(Math.atan2(r.pose.y - robot.pose.y, r.pose.x - robot.pose.x) - robot.pose.yaw), Math.cos(Math.atan2(r.pose.y - robot.pose.y, r.pose.x - robot.pose.x) - robot.pose.yaw))) <= Math.PI * 0.75 && visibleSegment(robot.pose, r.pose))
    .map(r => ({ number: r.number, distance: distance(robot.pose, r.pose) })).sort((a, b) => a.distance - b.distance)
  return { status: obstacles[0]?.distance < 1.6 ? 'STOPPED' : obstacles[0]?.distance < 2.5 ? 'SLOWING' : 'CLEAR', obstacles }
}

/** Local rule-based Copilot, grounded in this snapshot; never claims an LLM/VLM call. */
export function askFleet(state: PatrolState, question: string, selected = 1) {
  const normalized = question.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase()
  const explicitRobot = normalized.match(/\b(?:robot\s*|r)([1-6])\b/)
  const number = Number(explicitRobot?.[1] ?? selected)
  const r = state.robots.find(robot => robot.number === number)!, m = fleetMetrics(state)
  const refs = [number]
  let answer: string
  if (/nhuong|cho|tac|cham|dung/.test(normalized)) {
    const yields = state.robots.filter(robot => robot.yieldTo !== null)
    answer = yields.length ? yields.map(robot => `R${robot.number} đang ${robot.mode === 'yielded' ? 'đứng ở chỗ tránh' : 'rời tuyến'} để nhường R${robot.yieldTo}.`).join(' ') : `Hiện có ${state.robots.filter(robot => robot.waiting).length} robot chờ khoảng cách an toàn; chưa có yêu cầu vào chỗ tránh. Ưu tiên R1 → R6. Nếu không tìm được chỗ tránh đủ khoảng hở, robot dừng và tính lại đường.`
    refs.push(...yields.flatMap(robot => [robot.number, robot.yieldTo!]))
  } else if (/pin|sac|battery/.test(normalized)) {
    answer = state.robots.map(robot => `R${robot.number}: ${robot.battery.toFixed(0)}%${robot.mode === 'charging' ? ' (đang sạc)' : robot.chargingTrip ? ' (về sạc)' : ''}`).join('; ') + '. Dưới 15% sẽ đi đến trạm ảo tại Điểm 6 hoặc 10.'
    refs.push(...state.robots.map(robot => robot.number))
  } else if (/camera|nhin|vat can|lidar/.test(normalized)) {
    const seen = cameraPerception(state, number)
    answer = `Camera ảo R${number}: ${seen.status}. ` + (seen.obstacles.length ? seen.obstacles.map(o => `R${o.number} cách ${o.distance.toFixed(1)}m`).join('; ') : 'Không thấy robot khác trong vùng 270°/4m có đường nhìn thông thoáng.') + ' Đây là nhận biết từ hình học scene, chưa phải mô hình VLM hay camera thật.'
    refs.push(...seen.obstacles.map(o => o.number))
  } else if (/loi|fault|canh bao/.test(normalized)) {
    answer = `${m.faults} robot lỗi; ${state.blocked.length} vùng đang chặn; camera ${state.cameraOffline ? 'offline' : 'online'}. ` + state.robots.filter(robot => robot.mode === 'fault').map(robot => `R${robot.number} đứng yên và cần khôi phục.`).join(' ')
  } else if (/nhiem vu|phan cong|tai sao chon/.test(normalized)) answer = state.decisions[0] ?? 'Chưa có nhiệm vụ thủ công. Đích tuần tra được chọn ngẫu nhiên, tránh chọn trùng đích đã có robot nhận. Nhiệm vụ thêm mới được chấm theo khoảng cách + hàng đợi + mức pin, loại robot lỗi hoặc pin dưới 20%.'
  else if (explicitRobot) answer = `R${number}: ${robotModeLabel(r)}, đích Điểm ${r.target + 1}, pin ${r.battery.toFixed(0)}%, đã đến điểm ${r.visits} lượt, đi ${r.travelled.toFixed(1)}m và chờ ${r.waitSeconds.toFixed(1)}s.`
  else {
    answer = `Đội ${state.robots.length} robot, 10 điểm: ${m.active} robot đang di chuyển, ${m.visits} lượt đến điểm, ${state.completedCount} nhiệm vụ đã hoàn thành, ${m.yields} lần vào chế độ nhường đường, tổng ${m.distance.toFixed(1)}m. Robot quan sát 60s rồi chọn đích ngẫu nhiên. Số nhỏ được ưu tiên; ${m.faults} robot lỗi. Bạn có thể hỏi về robot, pin, nhiệm vụ, camera hoặc tắc đường.`
    refs.push(...state.robots.map(robot => robot.number))
  }
  return { answer, robots: [...new Set(refs)], at: state.seconds }
}

export type WhatIfResult = { baseline: ReturnType<typeof fleetMetrics>; scenario: ReturnType<typeof fleetMetrics>; duration: number; samples: number; range: [number, number] }
export async function runWhatIf(snapshot: PatrolState, scenario: FleetScenario, robot: number, point: number, duration: number, samples = 1, yieldUi = () => new Promise<void>(resolve => setTimeout(resolve, 0)), cancelled = () => false): Promise<WhatIfResult> {
  const baselines: ReturnType<typeof fleetMetrics>[] = [], scenarios: ReturnType<typeof fleetMetrics>[] = []
  for (let seed = 0; seed < samples; seed++) {
    let baseline = structuredClone(snapshot), variant = injectScenario(structuredClone(snapshot), scenario, robot, point)
    baseline.seed = (snapshot.seed + seed * 1009) >>> 0; variant.seed = baseline.seed
    for (let tick = 0; tick < duration / PATROL_TICK; tick++) {
      if (cancelled()) throw new Error('Đã hủy phép thử')
      baseline = stepPatrol(baseline); variant = stepPatrol(variant)
      if (tick % 100 === 0) await yieldUi()
    }
    baselines.push(fleetMetrics(baseline)); scenarios.push(fleetMetrics(variant))
  }
  const average = (values: ReturnType<typeof fleetMetrics>[]) => Object.fromEntries(Object.keys(values[0]).map(key => [key, values.reduce((sum, v) => sum + v[key as keyof typeof v], 0) / values.length])) as ReturnType<typeof fleetMetrics>
  const deltas = scenarios.map((v, i) => v.visits - baselines[i].visits)
  return { baseline: average(baselines), scenario: average(scenarios), duration, samples, range: [Math.min(...deltas), Math.max(...deltas)] }
}

export function eventCsv(state: PatrolState) {
  const quote = (s: string) => `"${s.replace(/"/g, '""')}"`
  return '\uFEFFsequence,seconds,robot,type,message\r\n' + [...state.events].reverse().map(e => [e.sequence, e.seconds.toFixed(2), e.robot ?? '', quote(e.kind), quote(e.message)].join(',')).join('\r\n')
}
