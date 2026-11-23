import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { useToastStore } from '../components/ui/toast-store'

// Mock window.matchMedia for GSAP and responsive tests in jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Mock ResizeObserver for Lenis smooth scroll
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

// A <form> inside a <form> (or any invalid nesting) fails the test. Chrome stops a nested form's submit before
// React's root listener, so the inner form's onSubmit never runs; jsdom does not, and only React's warning shows it.
const consoleError = console.error
let domNestingErrors: string[] = []
console.error = (...args: unknown[]) => {
  const text = args.map(String).join(' ')
  if (/cannot be a descendant of|cannot contain a nested|validateDOMNesting/.test(text)) domNestingErrors.push(text)
  consoleError(...args)
}

afterEach(() => {
  cleanup()
  // Notifications live in a module store; one test's must not leak into the next.
  useToastStore.setState({ toasts: [] })
  const nesting = domNestingErrors
  domNestingErrors = []
  if (nesting.length) throw new Error(`Invalid DOM nesting rendered:\n${nesting.join('\n')}`)
})

