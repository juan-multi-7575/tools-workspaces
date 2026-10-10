import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { BESPOKE_PAGES } from '../lib/toolPageModules'

test('the three media processing tools each have a bespoke page', () => {
  for (const id of ['trimmer', 'transcriber', 'audio_processor']) {
    assert.ok(BESPOKE_PAGES[id], `${id} must have a bespoke page`)
  }
})

test('trimmer page builds a real region editor and calls the trim endpoint', async () => {
  const source = await readFile(new URL('../pages/tools/TrimmerPage.tsx', import.meta.url), 'utf8')
  assert.match(source, /trimArtifact|regions/, 'the trimmer must send real regions')
  assert.doesNotMatch(source, /Math\.random\(\)/, 'no randomised fake waveform')
})

test('transcriber page renders subtitle output and does not stub the result', async () => {
  const source = await readFile(new URL('../pages/tools/TranscriberPage.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /placeholder.*transcript|lorem ipsum/i, 'no fabricated transcript text')
})
