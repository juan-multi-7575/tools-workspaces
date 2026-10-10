import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import ErrorBoundary, { recoveryDiagnostics } from '../components/common/ErrorBoundary'
import { HealthMonitor, healthHost } from '../hooks/useHealth'

const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  assert.ok(condition(), 'state transition timed out')
}

test('health poller shares requests, detects disconnect and reconnect, and stops after last listener', async () => {
  let online = true
  let calls = 0
  const monitor = new HealthMonitor(async () => {
    calls++
    if (!online) throw new Error('connection refused')
    return { status: 'ok', version: '1.4.0' }
  }, 'backend:8000', 5, 50)
  assert.equal(monitor.getSnapshot().state, 'connecting')
  const first = monitor.subscribe(() => {})
  const second = monitor.subscribe(() => {})
  await waitFor(() => monitor.getSnapshot().state === 'online')
  assert.equal(calls, 1)
  assert.equal(monitor.getSnapshot().version, '1.4.0')
  online = false
  await waitFor(() => monitor.getSnapshot().state === 'offline')
  online = true
  await waitFor(() => monitor.getSnapshot().state === 'online')
  first()
  second()
  const stoppedCalls = calls
  await new Promise((resolve) => setTimeout(resolve, 15))
  assert.equal(calls, stoppedCalls)
})

test('health timeout becomes offline and old subscriptions cannot overwrite or abort newer polling', async () => {
  const signals: AbortSignal[] = []
  const resolves: ((value: { status: string; version: string }) => void)[] = []
  const monitor = new HealthMonitor((signal) => {
    signals.push(signal)
    return new Promise((resolve) => resolves.push(resolve))
  }, 'server', 1000, 15)
  const stopOld = monitor.subscribe(() => {})
  stopOld()
  const stopNew = monitor.subscribe(() => {})
  resolves[0]({ status: 'ok', version: 'old' })
  await new Promise((resolve) => setTimeout(resolve, 2))
  assert.equal(monitor.getSnapshot().version, null)
  assert.equal(signals[0].aborted, true)
  assert.equal(signals[1].aborted, false)
  await waitFor(() => monitor.getSnapshot().state === 'offline')
  assert.equal(signals[1].aborted, true)
  stopNew()
})

test('host follows API base or same origin deployment', () => {
  assert.equal(healthHost('http://remote-host:8000', 'https://garage.example'), 'remote-host:8000')
  assert.equal(healthHost('', 'https://garage.example'), 'garage.example')
})

test('recovery diagnostics retain safe component and error context and remove credentials and locations', () => {
  const diagnostics = recoveryDiagnostics('Canvas', new Error('render failed in /home/private/file.ts api_key=secret sk-abcd123'), '\n at ToolForm (http://localhost:5173/src/Form.tsx:5)\n at Canvas')
  assert.match(diagnostics, /UI_RENDER_FAILED/)
  assert.match(diagnostics, /render failed/)
  assert.match(diagnostics, /ToolForm/)
  assert.doesNotMatch(diagnostics, /\/home\/private|secret|sk-abcd123|localhost/)
})

test('boundary copies captured diagnostics and Reload view remounts its children', async () => {
  const boundary = new ErrorBoundary({ name: 'Inspector', children: <span>Preserved parameters</span> })
  // Exercise the class lifecycle without a DOM renderer; browser throw handling
  // is verified separately in the integrated application.
  boundary.setState = ((update: unknown) => {
    const patch = typeof update === 'function' ? update(boundary.state) : update
    boundary.state = { ...boundary.state, ...(patch as object) }
  }) as typeof boundary.setState
  boundary.state = { ...boundary.state, ...ErrorBoundary.getDerivedStateFromError() }
  boundary.componentDidCatch(new Error('Bad parameter display'), { componentStack: '\n at ParameterForm' })
  const fallback = renderToStaticMarkup(boundary.render())
  assert.match(fallback, /Reload view/)
  assert.match(fallback, /Copy diagnostics/)
  assert.doesNotMatch(fallback, /Bad parameter display/)
  let copied = ''
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async (text: string) => { copied = text } } } })
  try { await boundary.copyDiagnostics() } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original)
    else Reflect.deleteProperty(globalThis, 'navigator')
  }
  assert.match(copied, /ParameterForm/)
  assert.match(copied, /Bad parameter display/)
  assert.equal(boundary.state.copied, true)
  boundary.reload()
  assert.equal(boundary.state.failed, false)
  assert.equal(boundary.state.generation, 1)
  assert.match(renderToStaticMarkup(boundary.render()), /Preserved parameters/)
})
