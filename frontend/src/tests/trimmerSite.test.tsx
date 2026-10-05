import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import TrimmerHero from '../sites/trimmer/TrimmerHero'
import TrimmerWorkspace from '../sites/trimmer/TrimmerWorkspace'
import { buildSegments, fitLetters, fitSegments, timecode } from '../sites/trimmer/trimmerModel'
import { discoverSiteIdsOnDisk } from './siteParity'
import { describeSite } from '../sites/registry'
import type { ToolManifest } from '../lib/api'

/**
 * Transcribed from the live `/api/tools/trimmer` manifest. The backend declares
 * exactly one parameter — `regions`, an array of `{start, end}` in seconds —
 * and reads `input_path` out of the same params object without declaring it, so
 * the workspace has to carry a source control as well as a region control.
 */
const MANIFEST: ToolManifest = {
  id: 'trimmer',
  name: 'Media & Audio Trimmer (FFmpeg)',
  description:
    'Precision audio and video trimming and splitting using waveform regions and timestamps.',
  category: 'Media',
  tags: ['audio', 'video', 'trimmer', 'ffmpeg', 'cutter'],
  input_kinds: ['audio', 'video', 'any'],
  output_kinds: ['audio'],
  parameters_schema: {
    regions: { type: 'array' },
  },
}

function renderHero() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <TrimmerHero manifest={MANIFEST} />
    </MemoryRouter>,
  )
}

function renderWorkspace() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <TrimmerWorkspace manifest={MANIFEST} />
    </MemoryRouter>,
  )
}

test('the hero states what the tool does and offers its two ways in', () => {
  const html = renderHero()
  assert.match(html, /Choose a file/, 'the hero must offer the file picker')
  assert.match(html, /Open an empty workspace/, 'the hero must offer the empty workspace')
  assert.equal(html.match(/<button/g)?.length, 2, 'the hero must offer exactly two actions')
  assert.doesNotMatch(html, /<form/, 'the hero is not a form')
  assert.match(html, /<h1 class="tr-hero__title">/, 'the hero needs a real title')
  assert.match(html, /class="tr-lede"/, 'the hero needs a description')
})

test('the workspace carries the home affordance back to the index', () => {
  assert.match(renderWorkspace(), /All tools/)
})

test('the workspace binds a control to the one key the manifest declares', () => {
  const html = renderWorkspace()
  assert.ok(html.includes('data-param-key="regions"'), 'regions has no bound control')
  // The backend reads input_path out of the same params dict without declaring
  // it, so the source control is bound to that exact key too.
  assert.ok(html.includes('data-param-key="input_path"'), 'input_path has no bound control')
})

test('the workspace surfaces every manifest parameter, so a new key cannot be dropped silently', () => {
  const html = renderWorkspace()
  for (const key of Object.keys(MANIFEST.parameters_schema)) {
    assert.ok(
      html.includes(`data-param-key="${key}"`),
      `the backend declares "${key}" but the workspace renders no control for it`,
    )
  }
})

/**
 * The truth contract. A source with no measured length must not get a
 * draggable axis: the strip shows the reason and the run stays disabled.
 */
test('with no measured length the timeline is inert and Cut is disabled', () => {
  const html = renderWorkspace()
  assert.match(html, /Set a source and measure it to open the timeline\./)
  assert.ok(html.includes('data-live="false"'), 'the strip must be marked not live')
  assert.ok(html.includes('disabled'), 'Run must be disabled before a source is measured')
  assert.doesNotMatch(html, /Math\.random/, 'no duration may be invented')
  // No letterform is drawn while there is no axis to place one on.
  assert.doesNotMatch(html, /class="tr-glyph"/, 'no glyphs may render without a measured length')
})

test('a source typed without measuring never claims a length', () => {
  const html = renderWorkspace()
  assert.match(html, /No source measured yet\./)
  assert.doesNotMatch(html, /\d+\.\d+ s measured/, 'no duration may be shown before a probe answers')
})

test('the sign-off refuses to claim it was checked', () => {
  for (const [name, html] of [
    ['hero', renderHero()],
    ['workspace', renderWorkspace()],
  ] as const) {
    assert.doesNotMatch(
      html,
      /not this page|on purpose|nothing is drawn|manifest declares|backend reads|not a stub|already been handed|no placeholder/i,
      `the ${name} narrates itself`,
    )
  }
})

test('neither surface carries any Tools Garage chrome', () => {
  for (const [name, html] of [
    ['hero', renderHero()],
    ['workspace', renderWorkspace()],
  ] as const) {
    for (const phrase of ['Tools Garage', 'Workspaces', 'Remote', 'ENGINE STATUS']) {
      assert.ok(!html.includes(phrase), `the ${name} contains the chrome string "${phrase}"`)
    }
  }
})

test('the dependency gate is hosted in the trailing action bar, outside the scrolling area', () => {
  const html = renderWorkspace()
  const region = html.indexOf('data-tool-gate-region="trimmer"')
  const stage = html.indexOf('class="tr-stage"')
  assert.ok(region > -1, 'the trailing action bar must be marked as the gate region')
  assert.ok(region > stage, 'the gate must sit after the scrolling stage')
})

test('the trimmer site is registered and discovered', async () => {
  const onDisk = await discoverSiteIdsOnDisk()
  assert.ok(onDisk.includes('trimmer'), `trimmer must have a site.ts, found: ${onDisk}`)
  assert.equal(describeSite('trimmer', new Set(onDisk)).availability, 'built')
})

/* --------------------------------------------------------------- the model */

/**
 * The design claim: a selection is oversized letterform spacing. That only
 * holds if the letter count per stretch is driven by the stretch's own length,
 * so a boundary in the type is a boundary in seconds.
 */
test('a selected stretch earns fewer glyphs than an equal unselected one', () => {
  const [inside] = buildSegments(10, [{ start: 2, end: 4 }]).filter((segment) => segment.inside)
  const outside = buildSegments(10, [{ start: 2, end: 4 }]).filter((segment) => !segment.inside)
  const equalLength = outside.find((segment) => Math.abs(segment.end - segment.start - 2) < 0.01)
  assert.ok(inside && equalLength, 'the fixture needs a 2s selected and a 2s unselected stretch')
  assert.ok(
    inside.letters.length < equalLength.letters.length,
    `2s inside produced ${inside.letters.length} glyphs and 2s outside produced ${equalLength.letters.length} — the spacing would read the same`,
  )
})

test('segments tile the whole duration with no gap and no overlap', () => {
  const segments = buildSegments(12, [
    { start: 1, end: 3 },
    { start: 7.5, end: 9 },
  ])
  assert.equal(segments[0].start, 0)
  assert.equal(segments[segments.length - 1].end, 12)
  for (let index = 1; index < segments.length; index += 1) {
    assert.equal(
      segments[index].start,
      segments[index - 1].end,
      `segment ${index} does not begin where segment ${index - 1} ends`,
    )
  }
  assert.deepEqual(
    segments.map((segment) => segment.inside),
    [false, true, false, true, false],
  )
})

test('a region past the end of the file is clamped, not rendered off the strip', () => {
  const segments = buildSegments(5, [{ start: 4, end: 40 }])
  assert.equal(segments[segments.length - 1].end, 5)
})

test('the hero band sheds letters it cannot set whole', () => {
  // A 400px stretch of 100px letters cannot hold the 12 it asks for.
  assert.equal(fitLetters(12, 400, 100), 3)
  // A stretch narrower than one letter still gets two, so a selected stretch
  // never reads as an empty slot.
  assert.equal(fitLetters(12, 60, 100), 2)
  // An unmeasured stretch keeps what it asked for — the server render, where
  // there is no layout to measure.
  assert.equal(fitLetters(12, 0, 0), 12)
})

test('timecodes are seconds, not a frame count invented at render time', () => {
  assert.equal(timecode(0), '00:00.000')
  assert.equal(timecode(9.5), '00:09.500')
  assert.equal(timecode(75.25), '01:15.250')
})

/**
 * A strip too narrow for the glyphs it earned must shed glyphs rather than let
 * them collide — the selection is drawn in the space between them, and a
 * neighbouring letterform eating that space destroys the only signal there is.
 */
test('a narrow strip sheds glyphs instead of letting them overrun', () => {
  const built = buildSegments(12, [{ start: 3, end: 4.2 }])
  const before = built.reduce((sum, entry) => sum + entry.letters.length, 0)
  // A 360px strip and a 100px glyph: almost nothing fits.
  const fitted = fitSegments(built, 12, 360, 100)
  const after = fitted.reduce((sum, entry) => sum + entry.letters.length, 0)
  assert.ok(after < before, `360px should not hold ${before} glyphs of 100px`)
  for (const entry of fitted) {
    assert.ok(entry.letters.length >= 1, `segment ${entry.key} lost every glyph`)
  }
})

test('a wide strip keeps every glyph the duration earned', () => {
  const built = buildSegments(12, [{ start: 3, end: 4.2 }])
  const fitted = fitSegments(built, 12, 4000, 100)
  assert.deepEqual(
    fitted.map((entry) => entry.letters.length),
    built.map((entry) => entry.letters.length),
  )
})

test('fitting never lets a selected stretch read as denser than an equal unselected one', () => {
  // Two stretches of identical length, one inside a region and one outside.
  const built = buildSegments(12, [{ start: 3, end: 6 }])
  const fitted = fitSegments(built, 12, 900, 60)
  const inside = fitted.find((entry) => entry.inside)
  const sameLengthOutside = fitted.find(
    (entry) => !entry.inside && Math.abs(entry.end - entry.start - (inside.end - inside.start)) < 0.01,
  )
  assert.ok(inside && sameLengthOutside, 'the fixture needs one 3s stretch of each kind')
  assert.ok(
    inside.letters.length <= sameLengthOutside.letters.length,
    `a selected 3s stretch fitted to ${inside.letters.length} glyphs against ${sameLengthOutside.letters.length} outside — the spacing now reads backwards`,
  )
})