import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { PageHeader } from './ConsolePrimitives'
import { useCurrentPageTitle, usePageTitle } from './use-page-title'

/** Stands in for a shell's header line. */
function HeaderLine() {
  return <p data-testid="header-line">{useCurrentPageTitle() ?? 'Vận hành tour'}</p>
}

function Page({ title }: { title: string }) {
  usePageTitle(title)
  return null
}

describe('page title', () => {
  beforeEach(() => { document.title = 'Smart Campus Tour' })

  it('PageHeader names the browser tab and the header after the page, not the menu item', () => {
    const view = render(<><HeaderLine /><PageHeader eyebrow="Tour hôm nay" title="Kiểm tra trước khi bắt đầu" description="Xem các điều kiện." /></>)
    expect(document.title).toBe('Kiểm tra trước khi bắt đầu · CampusTour')
    expect(screen.getByTestId('header-line')).toHaveTextContent('Kiểm tra trước khi bắt đầu')
    view.unmount()
    expect(document.title).toBe('Smart Campus Tour')
  })

  it('follows a page change and falls back once no page is mounted', () => {
    function Switcher() {
      const [page, setPage] = useState<'list' | 'create' | null>('list')
      return (
        <>
          <HeaderLine />
          {page === 'list' && <Page title="Tour" />}
          {page === 'create' && <Page title="Tạo Tour" />}
          <button type="button" onClick={() => setPage('create')}>Tạo</button>
          <button type="button" onClick={() => setPage(null)}>Đóng</button>
        </>
      )
    }
    render(<Switcher />)
    expect(document.title).toBe('Tour · CampusTour')
    fireEvent.click(screen.getByRole('button', { name: 'Tạo' }))
    expect(document.title).toBe('Tạo Tour · CampusTour')
    expect(screen.getByTestId('header-line')).toHaveTextContent('Tạo Tour')
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
    expect(document.title).toBe('Smart Campus Tour')
    expect(screen.getByTestId('header-line')).toHaveTextContent('Vận hành tour')
  })
})
