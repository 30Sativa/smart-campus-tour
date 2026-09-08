import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from './ui-store'

describe('ui-store', () => {
  beforeEach(() => {
    useUiStore.setState({ sidebarOpen: true })
  })

  it('starts with the sidebar open', () => {
    expect(useUiStore.getState().sidebarOpen).toBe(true)
  })

  it('setSidebarOpen updates the flag', () => {
    useUiStore.getState().setSidebarOpen(false)
    expect(useUiStore.getState().sidebarOpen).toBe(false)

    useUiStore.getState().setSidebarOpen(true)
    expect(useUiStore.getState().sidebarOpen).toBe(true)
  })
})
