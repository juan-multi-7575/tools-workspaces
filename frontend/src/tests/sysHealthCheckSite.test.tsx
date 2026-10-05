import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { ToolManifest } from '../lib/api'
import HealthCheckHero from '../sites/sys_health_check/HealthCheckHero'
import HealthCheckWorkspace from '../sites/sys_health_check/HealthCheckWorkspace'
import HealthCheckStatus from '../sites/sys_health_check/HealthCheckStatus'
import { healthRowDetail, healthStatusClass } from '../sites/sys_health_check/healthCheckData'

const MANIFEST: ToolManifest = {
  id: 'sys.health.check', name: 'AI Model Health Check & Latency Probe', description: 'Probe configured AI providers and inspect the returned model health and latency.', input_kinds: ['any'], output_kinds: ['json'],
  parameters_schema: {
    provider: { type: 'string', title: 'AI Provider Selector', enum: ['all', 'openai'], enumLabels: { all: 'All Configured Providers', openai: 'OpenAI' }, default: 'all' },
    model: { type: 'string', title: 'Specific Model Override', default: '', placeholder: 'Model ID' },
    models: { type: 'string', title: 'Selected Models List', default: '' },
    fetch_live_models: { type: 'boolean', title: 'Fetch Live Models from Provider', default: false },
    api_key: { type: 'string', title: 'Ephemeral API Key', widget: 'secret', default: '' },
    mock_offline: { type: 'boolean', title: 'Mock Offline Simulation', default: false },
  },
}

const render = (node: ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)

test('hero offers exactly two actions and introduces the probe', () => {
  const html = render(<HealthCheckHero manifest={MANIFEST} />)
  assert.match(html, /Know what<br\/>answers\./)
  assert.match(html, /Probe configured AI providers/)
  assert.equal((html.match(/<button/g) ?? []).length, 2)
})

test('workspace binds and labels every manifest parameter', () => {
  const html = render(<HealthCheckWorkspace manifest={MANIFEST} />)
  for (const [key, field] of Object.entries(MANIFEST.parameters_schema)) {
    const start = html.indexOf(`data-param-key="${key}"`)
    assert.notEqual(start, -1, `missing ${key} binding`)
    const fieldMarkup = html.slice(start, html.indexOf('</div>', start))
    assert.ok(fieldMarkup.includes('<label') && fieldMarkup.includes(String(field.title)), `missing labelled ${key} control`)
  }
  assert.match(html, /All tools/)
  assert.doesNotMatch(html, /Tools Garage|Workspaces|Remote|ENGINE STATUS/)
})

test('workspace has a real response table surface and a dependency gate', () => {
  const html = render(<HealthCheckWorkspace manifest={MANIFEST} />)
  assert.match(html, /aria-label="Probe results"/)
  assert.match(html, /Provider \/ model matrix/)
  assert.match(html, /data-dep-gate="sys\.health\.check"/)
})

test('AUTH_ERROR uses the failure status token', () => {
  assert.equal(healthStatusClass('AUTH_ERROR'), 'mh-status-bad')
})

test('status SSR includes the complete status in its title', () => {
  const html = render(<HealthCheckStatus status="AUTH_ERROR" />)
  assert.match(html, /title="AUTH_ERROR"/)
  assert.match(html, />AUTH_ERROR<\/span>/)
})

test('result detail keeps backend error and every real test name', () => {
  assert.equal(healthRowDetail({
    error: { code: 'TOOL_EXECUTION_FAILED', message: 'No API key detected.' },
    tests_passed: ['Model selected'],
    tests_failed: ['Credential Found'],
  }), 'error: No API key detected. · passed: Model selected · failed: Credential Found')
})
