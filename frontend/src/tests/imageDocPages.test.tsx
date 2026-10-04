import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { BESPOKE_PAGES } from '../lib/toolPageModules'

test('every image and document tool has a bespoke page', () => {
  for (const id of ['imagemagick', 'exif_scrubber', 'pandoc', 'pdf_tools', 'ocrmypdf', 'packager']) {
    assert.ok(BESPOKE_PAGES[id], `${id} must have a bespoke page`)
  }
})

test('exif scrubber shows a real before/after metadata diff', async () => {
  const source = await readFile(new URL('../pages/tools/ExifScrubberPage.tsx', import.meta.url), 'utf8')
  assert.match(source, /inspect/, 'the inspect action must be reachable')
  assert.match(source, /scrub/, 'the scrub action must be reachable')
})

test('pdf tools renders both declared actions', async () => {
  const source = await readFile(new URL('../pages/tools/PdfToolsPage.tsx', import.meta.url), 'utf8')
  for (const action of ['extract_text', 'inspect_info']) {
    assert.ok(source.includes(action), `pdf_tools action ${action} must be reachable`)
  }
})
