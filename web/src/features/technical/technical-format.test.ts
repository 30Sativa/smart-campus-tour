import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api/client'
import { deploymentErrorText, mapUploadFieldErrors, poiVerifyErrors, routeTestErrors } from './technical-format'

describe('map upload errors', () => {
  it('shows a duplicate package beside the file with the area and version from the server', () => {
    const body = JSON.stringify({ message: 'Gói này đã được tải lên ở Thư viện · v2.', errors: { code: 'MAP_PACKAGE_DUPLICATE', fields: null } })

    expect(mapUploadFieldErrors(new ApiError(409, body))).toEqual({ package: 'Gói này đã được tải lên ở Thư viện · v2.' })
  })
})

describe('robot readiness refusals', () => {
  const refusal = (code: string, message = '') => new ApiError(409, JSON.stringify({ message, errors: { code } }))

  it('shows the server sentence for a deployment check on a map the robot does not hold or does not report on', () => {
    expect(deploymentErrorText(refusal('ROBOT_NOT_REPORTING', 'Robot amr-01 chưa gửi dữ liệu theo bản đồ Betea · v1. Bật fleet_bridge với MapKey betea-v1, FrameId map rồi bấm Cập nhật trạng thái.')))
      .toBe('Robot amr-01 chưa gửi dữ liệu theo bản đồ Betea · v1. Bật fleet_bridge với MapKey betea-v1, FrameId map rồi bấm Cập nhật trạng thái.')
    expect(deploymentErrorText(refusal('ROBOT_MAP_NOT_ASSIGNED'))).toMatch(/^Robot không đang gán bản đồ này\./)
  })

  it('puts a POI or route readiness refusal beside the robot, in Vietnamese', () => {
    expect(poiVerifyErrors(refusal('MAP_NOT_DEPLOYED', 'Robot amr-01 đang gán Tầng 6 · tang-6 · phiên bản 1, không phải bản đồ này.')))
      .toEqual({ robotCode: 'Robot amr-01 đang gán Tầng 6 · tang-6 · phiên bản 1, không phải bản đồ này.' })
    expect(routeTestErrors(refusal('ROBOT_NOT_READY_FOR_ROUTE'))).toEqual({ robotCode: expect.stringMatching(/^Robot chưa sẵn sàng trên bản đồ của tuyến này/) })
  })

  it('puts a taken area name beside the name field', () => {
    expect(mapUploadFieldErrors(refusal('MAP_AREA_NAME_TAKEN', 'Đã có khu vực tên Tầng 6 (tang-6). Chọn Khu vực đã có hoặc đặt tên khác.')))
      .toEqual({ areaName: 'Đã có khu vực tên Tầng 6 (tang-6). Chọn Khu vực đã có hoặc đặt tên khác.' })
  })
})
