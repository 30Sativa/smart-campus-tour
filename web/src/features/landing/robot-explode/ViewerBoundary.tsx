import { Component, type ReactNode } from 'react'

/** Shows `fallback` instead of the 3D viewer if WebGL or the model fails to load. */
export class ViewerBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
