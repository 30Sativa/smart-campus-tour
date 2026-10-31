import { create } from 'zustand'

export type ToastTone = 'success' | 'info' | 'error'

export type ToastInput = {
  tone?: ToastTone
  /** What just happened, as a finished fact: "Đã tạo tài khoản staff04". */
  title: string
  /** What it means or what comes next, one sentence. */
  detail?: string
  /** The obvious next step, when there is one. */
  action?: { label: string; to: string }
  /**
   * A milestone rather than a routine save: shown once in the middle of the
   * screen with a short burst, then gone. Use `celebrate()`; keep it for work
   * that finished something whole (a Tour completed, a route or POI created).
   */
  celebrate?: boolean
}

export type Toast = ToastInput & { id: number; tone: ToastTone }

type ToastState = {
  toasts: Toast[]
  push: (input: ToastInput) => number
  dismiss: (id: number) => void
}

/** At most this many on screen; the oldest gives way. */
const MAX_VISIBLE = 4
let nextId = 1

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (input) => {
    const id = nextId++
    set((state) => ({
      // Only one celebration at a time: a newer milestone replaces the one on screen.
      toasts: [...(input.celebrate ? state.toasts.filter((toast) => !toast.celebrate) : state.toasts), { tone: 'success' as const, ...input, id }].slice(-MAX_VISIBLE),
    }))
    return id
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))

/**
 * Tell the person a piece of work finished (or failed), from anywhere: a
 * mutation hook, a page handler. The console shells render the stack.
 */
export function notify(input: ToastInput): number {
  return useToastStore.getState().push(input)
}

/**
 * A milestone finished: a Tour completed, a route or a POI created, a Tour
 * opened for registration. Same words as `notify`, shown with a celebration.
 */
export function celebrate(input: Omit<ToastInput, 'tone' | 'celebrate'>): number {
  return useToastStore.getState().push({ ...input, tone: 'success', celebrate: true })
}
