import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import GenericToolPage from '../pages/tools/GenericToolPage'
import ToolPageShell from '../components/tools/ToolPageShell'
import { initialParamsFromManifest } from '../hooks/useToolExecute'
import { getToolPage, TOOL_PAGE_IDS } from '../lib/toolPages'
import type { ToolManifest } from '../lib/api'

const MANIFEST: ToolManifest = {
  id: 'demo.tool',
  name: 'Demo Tool',
  description: 'A tool used to prove that every manifest parameter reaches a real control.',
  category: 'Testing',
  tags: ['demo'],
  input_kinds: ['any'],
  output_kinds: ['json'],
  parameters_schema: {
    input_path: { type: 'string', title: 'Input File Path', description: 'Absolute path to the input.', default: '' },
    mode: { type: 'string', title: 'Processing Mode', enum: ['fast', 'thorough'], default: 'fast' },
    strength: { type: 'number', title: 'Strength', minimum: 0, maximum: 10, default: 5 },
    keep_metadata: { type: 'boolean', title: 'Keep Metadata', default: true },
    notes: { type: 'string', title: 'Notes', widget: 'textarea', default: '' },
  },
}

test('generic tool page surfaces every manifest parameter as a labelled control', () => {
  const html = renderToStaticMarkup(
    <GenericToolPage manifest={MANIFEST} initialParams={initialParamsFromManifest(MANIFEST)} />,
  )
  for (const key of Object.keys(MANIFEST.parameters_schema)) {
    assert.ok(
      html.includes(`data-param-key="${key}"`),
      `parameter "${key}" has no bound control on the generic page`,
    )
  }
  for (const title of ['Input File Path', 'Processing Mode', 'Strength', 'Keep Metadata', 'Notes']) {
    assert.ok(html.includes(title), `label "${title}" is missing from the rendered page`)
  }
  assert.match(html, /<option value="fast"/)
  assert.match(html, /<option value="thorough"/)
})

test('initialParamsFromManifest seeds every declared default and applies overrides', () => {
  assert.deepEqual(initialParamsFromManifest(MANIFEST), {
    input_path: '', mode: 'fast', strength: 5, keep_metadata: true, notes: '',
  })
  assert.deepEqual(initialParamsFromManifest(MANIFEST, { mode: 'thorough' }).mode, 'thorough')
})

test('initialParamsFromManifest leaves keys without a declared default out of the payload', () => {
  const sparse: ToolManifest = { ...MANIFEST, parameters_schema: { alpha: { type: 'string' } } }
  assert.deepEqual(initialParamsFromManifest(sparse), {})
})

test('the registry resolves only real ids and falls back for everything else', () => {
  for (const id of TOOL_PAGE_IDS) {
    assert.ok(getToolPage(id), `registry id "${id}" must resolve to a component`)
  }
  assert.equal(getToolPage('demo.tool'), undefined, 'an unregistered id must fall back to the generic page')
  assert.equal(getToolPage('constructor'), undefined, 'prototype keys must not leak through the registry')
  assert.equal(new Set(TOOL_PAGE_IDS).size, TOOL_PAGE_IDS.length, 'registry ids must be unique')
})

test('tool page shell renders identity, ports and tags without executing anything', () => {
  const html = renderToStaticMarkup(
    <ToolPageShell manifest={MANIFEST}>
      <p>child slot</p>
    </ToolPageShell>,
  )
  assert.match(html, /Demo Tool/)
  assert.match(html, /A tool used to prove/)
  assert.match(html, /demo\.tool/)
  assert.match(html, /child slot/)
  assert.match(html, /Output/)
})