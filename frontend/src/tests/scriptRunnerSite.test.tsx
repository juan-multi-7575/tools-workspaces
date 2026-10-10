import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { ToolManifest } from '../lib/api'
import ScriptRunnerHero from '../sites/script_runner/ScriptRunnerHero'
import ScriptRunnerWorkspace, { isScriptRunFailure } from '../sites/script_runner/ScriptRunnerWorkspace'

const MANIFEST: ToolManifest = {
  id: 'script_runner',
  name: 'Custom Python & Shell Script Runner',
  description: 'Execute custom user-built Python or Shell scripts, experimental tools, and prototypes.',
  input_kinds: ['any'],
  output_kinds: ['any', 'text', 'json'],
  parameters_schema: {
    language: { type: 'string', enum: ['python', 'bash'], default: 'python' },
    code: { type: 'string', default: "print('Custom tool execution')" },
    custom_args: { type: 'string', default: '' },
    timeout: { type: 'number', default: 300, description: 'Maximum execution time in seconds' },
  },
}

const render = (node: ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)

test('hero has a short description and exactly two workspace actions', () => {
  const html = render(<ScriptRunnerHero manifest={MANIFEST} />)
  assert.match(html, /<h1>Run what<br\/>you write\.<\/h1>/)
  assert.match(html, /Execute custom user-built Python or Shell scripts/)
  assert.equal((html.match(/<button/g) ?? []).length, 2)
})

test('workspace surfaces and labels each manifest parameter', () => {
  const html = render(<ScriptRunnerWorkspace manifest={MANIFEST} />)
  for (const key of Object.keys(MANIFEST.parameters_schema)) {
    assert.ok(html.includes(`data-param-key="${key}"`), `missing control for ${key}`)
  }
  assert.match(html, /aria-label="Code"/)
  assert.match(html, /Custom arguments/)
  assert.match(html, /Timeout/)
  assert.match(html, /All tools/)
})

test('workspace starts the editor empty despite the manifest sample default', () => {
  const html = render(<ScriptRunnerWorkspace manifest={MANIFEST} />)
  assert.match(html, /<textarea[^>]*><\/textarea>/)
  assert.doesNotMatch(html, /Custom tool execution/)
})

test('workspace includes line numbers, console, and a separate trailing action bar', () => {
  const html = render(<ScriptRunnerWorkspace manifest={MANIFEST} />)
  assert.match(html, /class="sr-gutter"/)
  assert.match(html, /aria-label="Execution console"/)
  assert.match(html, /class="sr-action-bar"/)
  assert.match(html, /Run script/)
  assert.doesNotMatch(html, /Tools Garage|Workspaces|Remote|ENGINE STATUS/)
})

test('any non-zero exit code is a failure, even if the response status says completed', () => {
  assert.equal(isScriptRunFailure('completed', 0), false)
  assert.equal(isScriptRunFailure('completed', 7), true)
  assert.equal(isScriptRunFailure('failed', null), true)
})
