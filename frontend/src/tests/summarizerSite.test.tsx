import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { SummarizerHeroProps } from '../sites/summarizer/SummarizerHero'
import type { SummarizerWorkspaceProps, SummarizerResultProps } from '../sites/summarizer/SummarizerWorkspace'
import type { ToolExecuteResult } from '../lib/toolPageTypes'
import * as summarizerState from '../sites/summarizer/summarizerState'
import type { ToolManifest } from '../lib/api'

const MANIFEST = JSON.parse(readFileSync(new URL('./fixtures/summarizerManifest.json', import.meta.url), 'utf8')) as ToolManifest
const [heroModule, workspaceModule] = await Promise.all([
  import('../sites/summarizer/SummarizerHero').catch(() => null),
  import('../sites/summarizer/SummarizerWorkspace').catch(() => null),
])

test('summarizer site components are available for static rendering', () => {
  assert.ok(heroModule && workspaceModule, 'standalone summarizer components are implemented')
})

if (heroModule && workspaceModule) {
  const SummarizerHero = heroModule.SummarizerHero as (props: SummarizerHeroProps) => React.ReactNode
  const SummarizerWorkspace = workspaceModule.SummarizerWorkspace as (props: SummarizerWorkspaceProps) => React.ReactNode
  const SummarizerResult = workspaceModule.SummarizerResult as (props: SummarizerResultProps) => React.ReactNode

test('summarizer hero offers text and file entry without platform chrome', () => {
  const html = renderToStaticMarkup(<MemoryRouter><SummarizerHero manifest={MANIFEST}/></MemoryRouter>)
  assert.match(html, /Start with text/)
  assert.match(html, /Choose a source file/)
  assert.match(html, /accept="\.txt,\.md,\.srt,\.vtt,text\/plain,text\/markdown"/)
  assert.doesNotMatch(html, /Tools Garage|Workspaces|ENGINE STATUS/)
})

test('summarizer workspace binds all four manifest parameters', () => {
  const textMode = renderToStaticMarkup(<MemoryRouter><SummarizerWorkspace manifest={MANIFEST}/></MemoryRouter>)
  const fileMode = renderToStaticMarkup(<MemoryRouter><SummarizerWorkspace manifest={MANIFEST} initialInputPath="/kept/source.md"/></MemoryRouter>)
  const html = textMode + fileMode
  for (const key of Object.keys(MANIFEST.parameters_schema)) {
    assert.ok(html.includes(`data-param-key="${key}"`), `manifest key "${key}" has a labelled control`)
  }
  assert.doesNotMatch(textMode, /Input File \(Optional\)|Path to document file to summarize\.|aria-label="Choose a source file"/)
  assert.match(fileMode, /data-param-key="input_path"/)
  assert.match(fileMode, /value="\/kept\/source\.md"/)
  assert.match(fileMode, /Path to document file to summarize\./)
  assert.match(html, /Markdown/)
  assert.match(html, /<button type="button" disabled="" title="Plain output is unavailable">Plain — unavailable<\/button>/)
  assert.match(html, /accept="\.txt,\.md,\.srt,\.vtt,text\/plain,text\/markdown"/)
  assert.doesNotMatch(html, /Only completed backend results are shown/)
})

test('completed result with empty takeaways says none were returned without inventing list entries', () => {
  const result: ToolExecuteResult = {
    status: 'completed', artifacts: [], error: null, durationSeconds: 0.1,
    data: { takeaways: [], bullet_count: 0 }, outputText: null,
  }
  const html = renderToStaticMarkup(<SummarizerResult result={result} stale={false} runIdentity={1}/>)
  assert.match(html, /No takeaways were returned/)
  assert.doesNotMatch(html, /<li(?:\s|>)/)
})

test('active source mode submits one source field and avoids backend path precedence surprises', () => {
  const mixed = { text: 'Draft text', input_path: '/tmp/source.md', max_bullets: 5, format: 'markdown' }
  assert.deepEqual(summarizerState.summarizerRunParams(mixed, 'text'), { ...mixed, input_path: '' })
  assert.deepEqual(summarizerState.summarizerRunParams(mixed, 'file'), { ...mixed, text: '' })
})

test('output-affecting source and settings edits mark the retained result stale', () => {
  const previous = { text: 'Source', input_path: '', max_bullets: 5, format: 'markdown' }
  assert.equal(summarizerState.summarizerParamsChanged(previous, previous), false)
  assert.equal(summarizerState.summarizerParamsChanged(previous, { ...previous, max_bullets: 4 }), true)
  assert.equal(summarizerState.summarizerParamsChanged(previous, { ...previous, text: 'Edited source' }), true)
})

test('a failed attempt retains the last successful result for review', () => {
  assert.equal(typeof summarizerState.retainCompletedRun, 'function', 'successful output retention has a testable state transition')
  const completed: ToolExecuteResult = { status: 'completed', artifacts: [], error: null, durationSeconds: 0, data: { takeaways: ['Retained result'] }, outputText: null }
  const failed: ToolExecuteResult = { ...completed, status: 'failed', error: 'Current run failed' }
  const snapshot = { text: 'Earlier input', input_path: '', max_bullets: 5, format: 'markdown' }
  assert.deepEqual(summarizerState.retainCompletedRun({ result: completed, params: snapshot, identity: 1 }, failed, snapshot, 2), { result: completed, params: snapshot, identity: 1 })
})

test('same-path artifact previews use a different key for each completed run', () => {
  assert.notEqual(summarizerState.artifactPreviewKey('/tmp/summary.md', 8), summarizerState.artifactPreviewKey('/tmp/summary.md', 9))
})

test('format payload remains Markdown while Plain is unavailable', () => {
  const mixed = { text: 'Text', input_path: '', max_bullets: 5, format: 'plain' }
  assert.equal(summarizerState.summarizerRunParams(mixed, 'text').format, 'markdown')
})

test('file validation rejects unsupported, invalid UTF-8, and binary inputs before upload', async () => {
  const unsupported = await summarizerState.validateSummarizerFile({ name: 'notes.docx', arrayBuffer: async () => new ArrayBuffer(0) })
  assert.match(String(unsupported), /\.txt, \.md, \.srt, or \.vtt/)
  const invalidUtf8 = await summarizerState.validateSummarizerFile({ name: 'notes.txt', arrayBuffer: async () => new Uint8Array([0xff, 0xfe]).buffer })
  assert.match(String(invalidUtf8), /valid UTF-8 text/)
  const binary = await summarizerState.validateSummarizerFile({ name: 'notes.md', arrayBuffer: async () => new Uint8Array([65, 0, 66]).buffer })
  assert.match(String(binary), /plain text/)
  const supported = await summarizerState.validateSummarizerFile({ name: 'notes.txt', arrayBuffer: async () => new TextEncoder().encode('A readable UTF-8 source.').buffer })
  assert.equal(supported, null)
})
}
