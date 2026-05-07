import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode; label?: string }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(`[ErrorBoundary] ${this.props.label ?? 'unknown'}:`, error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-4 text-xs text-red-400 bg-red-400/10 rounded-lg m-3">
          <p className="font-semibold mb-1">{this.props.label ?? 'Component'} crashed</p>
          <p className="text-red-500/80 font-mono">{this.state.error.message}</p>
        </div>
      )
    }
    return this.props.children
  }
}
