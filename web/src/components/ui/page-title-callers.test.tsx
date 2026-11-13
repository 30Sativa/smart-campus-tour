import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { RepPageHeader } from '../../features/representative/components/RepUi'
import { StudentHeader } from '../../features/student/components/StudentHeader'

// Pages outside the console PageHeader still name the browser tab (E2E found them all as "CampusTour").
describe('page titles outside PageHeader', () => {
  afterEach(() => { cleanup(); document.title = '' })

  it('RepPageHeader names the tab from a text title', () => {
    render(<MemoryRouter><RepPageHeader title="Buổi tham quan" /></MemoryRouter>)
    expect(document.title).toBe('Buổi tham quan · CampusTour')
  })

  it('RepPageHeader uses pageTitle when the title is not plain text', () => {
    render(<MemoryRouter><RepPageHeader title={<span>Đăng ký</span>} pageTitle="Đăng ký tham quan" /></MemoryRouter>)
    expect(document.title).toBe('Đăng ký tham quan · CampusTour')
  })

  it('StudentHeader names the tab after the Tour', () => {
    render(<MemoryRouter><StudentHeader session={null} tourName="Tham quan Thư viện" /></MemoryRouter>)
    expect(document.title).toBe('Tham quan Thư viện · CampusTour')
  })
})
