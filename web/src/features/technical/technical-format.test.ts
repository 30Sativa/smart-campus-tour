import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api/client'
import { mapUploadFieldErrors } from './technical-format'

describe('map upload errors', () => {
  it('shows a duplicate package beside the file with the area and version from the server', () => {
    const body = JSON.stringify({ message: 'Gói này đã được tải lên ở Thư viện · v2.', errors: { code: 'MAP_PACKAGE_DUPLICATE', fields: null } })

    expect(mapUploadFieldErrors(new ApiError(409, body))).toEqual({ package: 'Gói này đã được tải lên ở Thư viện · v2.' })
  })
})
