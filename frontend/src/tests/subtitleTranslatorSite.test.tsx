import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { ToolManifest } from '../lib/api'
import * as cueTools from '../sites/subtitle-translator/subtitleCues'

const MANIFEST = JSON.parse(readFileSync(new URL('./fixtures/subtitleManifest.json', import.meta.url), 'utf8')) as ToolManifest

test('parses multiline SRT text with its actual sequence id and timestamp', () => {
  const parsed = cueTools.parseSubtitleCues('7\n00:01:02,300 --> 00:01:05,000\nFirst line\nSecond line\n')
  assert.deepEqual(parsed, { format: 'srt', cues: [{ id: '7', ordinal: 1, timestamp: '00:01:02,300 --> 00:01:05,000', text: 'First line\nSecond line' }] })
})

test('parses VTT identifiers and cues without identifiers without inventing IDs', () => {
  const parsed = cueTools.parseSubtitleCues('WEBVTT\n\nchapter-one\n00:00:01.000 --> 00:00:02.000 align:start\nHello\n\n00:00:03.000 --> 00:00:04.000\nWorld')
  assert.deepEqual(parsed.cues.map(({ id, ordinal, timestamp }) => ({ id, ordinal, timestamp })), [
    { id: 'chapter-one', ordinal: 1, timestamp: '00:00:01.000 --> 00:00:02.000 align:start' },
    { id: null, ordinal: 2, timestamp: '00:00:03.000 --> 00:00:04.000' },
  ])
})

test('accepts valid short-form WebVTT timestamps', () => {
  const parsed = cueTools.parseSubtitleCues('WEBVTT\n\n00:03.200 --> 00:04.500\nShort cue')
  assert.equal(parsed.cues[0].timestamp, '00:03.200 --> 00:04.500')
})

test('malformed subtitle blocks return a parse error, not an empty cue list', () => {
  assert.throws(() => cueTools.parseSubtitleCues('not a subtitle block'), /timestamp|cue/i)
})

test('alignment pairs cue order, marks changed text, and preserves trailing unmatched cues', () => {
  const source = cueTools.parseSubtitleCues('1\n00:00:01,000 --> 00:00:02,000\nSame\n\n2\n00:00:03,000 --> 00:00:04,000\nGone\n\n4\n00:00:07,000 --> 00:00:08,000\nMissing translation')
  const translated = cueTools.parseSubtitleCues('1\n00:00:01,000 --> 00:00:02,000\nSame\n\n3\n00:00:05,000 --> 00:00:06,000\nDifferent')
  const rows = cueTools.alignSubtitleCues(source.cues, translated.cues)
  assert.deepEqual(rows.map((row) => [row.source?.id, row.translation?.id, row.state]), [
    ['1', '1', 'same'], ['2', '3', 'changed'], ['4', undefined, 'missing'],
  ])
  assert.equal(cueTools.alignSubtitleCues(source.cues.slice(0, 1), translated.cues).at(-1)?.state, 'extra')
  const changed = cueTools.alignSubtitleCues(source.cues.slice(0, 1), [{ ...translated.cues[0], text: 'Different' }])
  assert.equal(changed[0].state, 'changed')
})

test('subtitle proof pairs cues by file order when IDs or timestamps differ', () => {
  const source = cueTools.parseSubtitleCues('WEBVTT\n\nsource-one\n00:00:01.000 --> 00:00:02.000\nFirst source\n\nsource-two\n00:00:03.000 --> 00:00:04.000\nSecond source')
  const translated = cueTools.parseSubtitleCues('WEBVTT\n\ntranslated-two\n00:00:08.000 --> 00:00:09.000\nFirst translation\n\ntranslated-one\n00:00:09.000 --> 00:00:10.000\nSecond translation')
  const rows = cueTools.alignSubtitleCues(source.cues, translated.cues)
  assert.deepEqual(rows.map((row) => [row.source?.id, row.translation?.id]), [
    ['source-one', 'translated-two'], ['source-two', 'translated-one'],
  ])
  assert.equal(rows[0].source?.timestamp, '00:00:01.000 --> 00:00:02.000')
  assert.equal(rows[0].translation?.timestamp, '00:00:08.000 --> 00:00:09.000')
})

test('retains each VTT cue ID and timestamp when output renumbers its identifier', () => {
  const source = cueTools.parseSubtitleCues('WEBVTT\n\nchapter-one\n00:00:01.000 --> 00:00:02.000\nHello')
  const output = cueTools.parseSubtitleCues('WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nHola')
  const [row] = cueTools.alignSubtitleCues(source.cues, output.cues)
  assert.equal(row.state, 'changed')
  assert.equal(row.source?.id, 'chapter-one')
  assert.equal(row.translation?.id, '1')
  assert.equal(row.source?.timestamp, '00:00:01.000 --> 00:00:02.000')
  assert.equal(row.translation?.timestamp, '00:00:01.000 --> 00:00:02.000')
})

test('a named VTT cue matches the backend failed index by its actual ordinal', () => {
  const [cue] = cueTools.parseSubtitleCues('WEBVTT\n\nchapter-one\n00:00:01.000 --> 00:00:02.000\nHello').cues
  assert.equal(cueTools.cueHasFailedIndex(cue, new Set(['1']), 'vtt'), true)
  assert.equal(cueTools.cueHasFailedIndex(cue, new Set(['chapter-one']), 'vtt'), false)
  assert.equal(cueTools.cueHasFailedIndex(cue, new Set(['2']), 'vtt'), false)
})

test('failed cue lookup uses numeric source IDs without also matching duplicate ordinals', () => {
  const [srtCue] = cueTools.parseSubtitleCues('5\n00:00:01,000 --> 00:00:02,000\nCue').cues
  const [vttCue] = cueTools.parseSubtitleCues('WEBVTT\n\n7\n00:00:01.000 --> 00:00:02.000\nCue').cues
  assert.equal(cueTools.cueHasFailedIndex(srtCue, new Set(['5']), 'srt'), true)
  assert.equal(cueTools.cueHasFailedIndex(srtCue, new Set(['1']), 'srt'), false)
  assert.equal(cueTools.cueHasFailedIndex(vttCue, new Set(['7']), 'vtt'), true)
  assert.equal(cueTools.cueHasFailedIndex(vttCue, new Set(['1']), 'vtt'), false)
  const [namedSrtCue] = cueTools.parseSubtitleCues('chapter\n00:00:01,000 --> 00:00:02,000\nCue').cues
  assert.equal(cueTools.cueHasFailedIndex(namedSrtCue, new Set(['1']), 'srt'), false)
})

test('CSS keeps the hidden file picker clipped despite the path-input width rule', () => {
  const css = readFileSync(new URL('../sites/subtitle-translator/subtitle-translator.css', import.meta.url), 'utf8')
  assert.match(css, /\.sub-path-line input\.sub-visually-hidden\s*\{[^}]*width:1px/)
  assert.match(css, /\.sub-path-line input\.sub-visually-hidden\s*\{[^}]*height:1px/)
  assert.match(css, /family=IBM\+Plex\+Sans/)
  assert.doesNotMatch(css, /font:[^;}]*Inter|font-family:Inter/)
})

const components = await Promise.all([
  import('../sites/subtitle-translator/SubtitleTranslatorHero').catch(() => null),
  import('../sites/subtitle-translator/SubtitleTranslatorWorkspace').catch(() => null),
])

test('subtitle hero and manifest-bound workspace expose the six declared controls', () => {
  assert.ok(components.every(Boolean), 'subtitle site components are implemented')
  if (!components[0] || !components[1]) return
  const Hero = components[0].SubtitleTranslatorHero as (props: { manifest: ToolManifest }) => React.ReactNode
  const Workspace = components[1].SubtitleTranslatorWorkspace as (props: { manifest: ToolManifest }) => React.ReactNode
  const CueLedger = components[1].CueLedger as (props: { rows: cueTools.CuePair[]; selected: number; onSelect: (next: number) => void; pane: 'source' | 'translation'; onPane: (next: 'source' | 'translation') => void; failedIndices: Set<string>; sourceFormat: 'srt' | 'vtt' }) => React.ReactNode
  const hero = renderToStaticMarkup(<MemoryRouter><Hero manifest={MANIFEST}/></MemoryRouter>)
  const workspace = renderToStaticMarkup(<MemoryRouter><Workspace manifest={MANIFEST}/></MemoryRouter>)
  assert.match(hero, /Open the cue ledger/)
  assert.match(hero, /Upload subtitles/)
  for (const key of Object.keys(MANIFEST.parameters_schema)) assert.ok(workspace.includes(`data-param-key="${key}"`), `missing ${key}`)
  assert.match(workspace, /type="password"/)
  const src = cueTools.parseSubtitleCues('WEBVTT\n\nsource-id\n00:00:01.000 --> 00:00:02.000\nOriginal')
  const translated = cueTools.parseSubtitleCues('WEBVTT\n\nsource-id\n00:00:01.100 --> 00:00:02.100\nTranslated')
  const ledger = renderToStaticMarkup(<CueLedger rows={cueTools.alignSubtitleCues(src.cues, translated.cues)} selected={0} onSelect={() => {}} pane="source" onPane={() => {}} failedIndices={new Set()} sourceFormat="vtt"/> )
  assert.match(ledger, /00:00:01\.000 --&gt; 00:00:02\.000/)
  assert.match(ledger, /00:00:01\.100 --&gt; 00:00:02\.100/)
  assert.match(ledger, /Source/)
  assert.match(ledger, /Translation/)
  const siteSource = readFileSync(new URL('../sites/subtitle-translator/SubtitleTranslatorWorkspace.tsx', import.meta.url), 'utf8')
  assert.match(siteSource, /setKeyDraft\(''\)/, 'changing provider clears any unsaved provider key')
  assert.doesNotMatch(siteSource, /or use once/)
  assert.equal((siteSource.match(/result\?\.status === 'failed'/g) ?? []).length, 1, 'execution error renders in one location')
  const css = readFileSync(new URL('../sites/subtitle-translator/subtitle-translator.css', import.meta.url), 'utf8')
  assert.match(css, /\.sub-dependency \.dep-gate__panel[^}]*max-height/, 'mobile dependency dock has a compact height')
  assert.match(css, /@media\(max-width:900px\)\{\.sub-dependency \.dep-gate__panel/, 'tablet dependency dock stays compact over the two-column workspace')
})
