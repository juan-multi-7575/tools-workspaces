import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import PdfToolsHero from '../sites/pdf_tools/PdfToolsHero'
import PdfToolsWorkspace from '../sites/pdf_tools/PdfToolsWorkspace'
import type { ToolManifest } from '../lib/api'

const MANIFEST: ToolManifest = {
  id: 'pdf_tools',
  name: 'PDF Text & Page Utilities',
  description: 'Extract raw text, inspect metadata, and analyze page structures from PDF documents.',
  category: 'Documents', tags: ['pdf'], input_kinds: ['document'], output_kinds: ['text', 'json'],
  parameters_schema: {
    input_path: { type: 'string', title: 'Input PDF File', description: 'Path to PDF document.', default: '' },
    action: { type: 'string', title: 'Action', enum: ['extract_text', 'inspect_info'], default: 'extract_text' },
  },
}

function hero() {
  return renderToStaticMarkup(<MemoryRouter><PdfToolsHero manifest={MANIFEST} /></MemoryRouter>)
}
function workspace() {
  return renderToStaticMarkup(<MemoryRouter><PdfToolsWorkspace manifest={MANIFEST} /></MemoryRouter>)
}

test('hero gives a title, description and exactly two ways into the workspace', () => {
  const html = hero()
  assert.match(html, /PDF/)
  assert.match(html, /Extract raw text/)
  assert.equal(html.match(/<button/g)?.length, 2)
})

test('workspace exposes a control for every manifest parameter key', () => {
  const html = workspace()
  for (const key of Object.keys(MANIFEST.parameters_schema)) {
    assert.ok(html.includes(`data-param-key="${key}"`), `missing bound control for ${key}`)
  }
})

test('action options come from the manifest and the home affordance is present', () => {
  const html = workspace()
  for (const option of ['extract text', 'inspect info']) assert.ok(html.includes(option))
  assert.match(html, /All tools/)
})

test('standalone surfaces omit platform chrome', () => {
  for (const html of [hero(), workspace()]) {
    for (const phrase of ['Tools Garage', 'Workspaces', 'Remote', 'ENGINE STATUS']) assert.ok(!html.includes(phrase))
  }
})

test('metadata display maps over returned entries and never declares a page count', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../sites/pdf_tools/PdfToolsWorkspace.tsx', import.meta.url), 'utf8'),
  )
  assert.match(source, /Object\.entries\(info\)/)
  assert.doesNotMatch(source, /page_count|Pages\s*:/)
  assert.match(source, /character_count/)
  assert.match(source, /result\.outputText/)
})
