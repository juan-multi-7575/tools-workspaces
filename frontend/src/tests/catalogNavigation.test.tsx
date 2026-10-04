import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const SOURCE = new URL('../pages/ToolsPage.tsx', import.meta.url)

test('catalog no longer owns a run modal or simulated progress', async () => {
  const source = await readFile(SOURCE, 'utf8')
  assert.doesNotMatch(source, /progressInterval/, 'the simulated progress interval must be deleted')
  assert.doesNotMatch(source, /Transcoding media & formatting output artifacts/, 'invented progress copy must be deleted')
  assert.doesNotMatch(source, /role="dialog"/, 'the execution modal must be deleted')
  assert.doesNotMatch(source, /setRunTarget/, 'run-modal state must be deleted')
})

test('catalog links every tool to its own page route', async () => {
  const source = await readFile(SOURCE, 'utf8')
  assert.match(source, /`\/tools\/\$\{encodeURIComponent\(tool\.id\)\}`/, 'Run must navigate to the tool page route')
})

test('legacy ?tool= deep link redirects to the page route', async () => {
  const source = await readFile(SOURCE, 'utf8')
  assert.match(source, /searchParams\.get\('tool'\)/)
  assert.match(source, /replace: true/, 'the legacy deep link must redirect rather than restore a modal')
})
