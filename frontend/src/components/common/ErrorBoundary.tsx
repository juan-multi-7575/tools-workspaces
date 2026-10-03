import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  name?: string
  resetKey?: unknown
}
interface State {
  failed: boolean
  generation: number
  copied: boolean
  copyFailed: boolean
}

/** Keep render context while removing locations and common credentials. */
export function sanitizeDiagnostic(text: string): string {
  return text
    .replace(/(?:https?:|file:)[^\s)]+/gi, '[location]')
    .replace(/(?:[A-Za-z]:\\|\/)[^\s)"'<>]+/g, '[path]')
    .replace(/(api[_ -]?key|token|password|secret|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]+/g, '[redacted]')
    .slice(0, 4000)
}

export function recoveryDiagnostics(name = 'View', error?: Error, componentStack?: string | null): string {
  return JSON.stringify({
    code: 'UI_RENDER_FAILED', view: name, time: new Date().toISOString(),
    error: error ? { name: sanitizeDiagnostic(error.name), message: sanitizeDiagnostic(error.message) } : undefined,
    componentStack: componentStack ? sanitizeDiagnostic(componentStack) : undefined,
  }, null, 2)
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, generation: 0, copied: false, copyFailed: false }
  private diagnostics = ''

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true, copied: false, copyFailed: false }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.diagnostics = recoveryDiagnostics(this.props.name, error, info.componentStack)
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) this.reload()
  }

  reload = () => {
    this.diagnostics = ''
    this.setState((state) => ({ failed: false, generation: state.generation + 1, copied: false, copyFailed: false }))
  }

  copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(this.diagnostics || recoveryDiagnostics(this.props.name))
      this.setState({ copied: true, copyFailed: false })
    } catch {
      this.setState({ copied: false, copyFailed: true })
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <section role="alert" className="m-3 rounded-xl border border-brand-sage bg-brand-cream p-4 text-xs text-brand-espresso space-y-3">
          <p className="font-bold">{this.props.name || 'This view'} could not be displayed.</p>
          <p>Reload this view to try again. Other panes remain available.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={this.reload} className="rounded-lg border border-brand-sage px-3 py-2 font-bold">Reload view</button>
            <button type="button" onClick={this.copyDiagnostics} className="rounded-lg border border-brand-sage px-3 py-2">{this.state.copied ? 'Copied diagnostics' : 'Copy diagnostics'}</button>
          </div>
          {this.state.copyFailed && <p>Clipboard unavailable. Diagnostic code: UI_RENDER_FAILED.</p>}
        </section>
      )
    }
    return <Fragment key={this.state.generation}>{this.props.children}</Fragment>
  }
}

/** Defer JSX computation below the boundary while its owner's state stays mounted. */
export function BoundaryContent({ render }: { render: () => ReactNode }) {
  return render()
}
