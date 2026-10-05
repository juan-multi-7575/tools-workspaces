import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import AudioProcessorHero from '../sites/audio_processor/AudioProcessorHero'
import AudioProcessorWorkspace from '../sites/audio_processor/AudioProcessorWorkspace'
import { discoverSiteIdsOnDisk } from './siteParity'
import { describeSite } from '../sites/registry'
import type { ToolManifest } from '../lib/api'

/**
 * Transcribed from the live `/api/tools/audio_processor` manifest: two keys,
 * both enums, plus the `unit` on the rate. The backend also reads `input_path`,
 * which it does not declare, so the workspace carries a source control bound to
 * that exact key as well.
 */
const MANIFEST: ToolManifest = {
  id: 'audio_processor',
  name: 'Audio Extractor & Processor (FFmpeg)',
  description:
    'Extract audio tracks from video files or convert & resample audio (WAV, MP3, FLAC, M4A, OGG) via FFmpeg.',
  category: 'Media',
  tags: ['audio', 'ffmpeg', 'converter', 'extractor', 'video-to-audio'],
  input_kinds: ['video', 'audio'],
  output_kinds: ['audio'],
  parameters_schema: {
    format: { type: 'string', enum: ['wav', 'mp3', 'flac', 'ogg', 'm4a'], default: 'wav' },
    sample_rate: { type: 'number', enum: [22050, 44100, 48000], default: 44100, unit: 'Hz' },
  },
}

function renderHero() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <AudioProcessorHero manifest={MANIFEST} />
    </MemoryRouter>,
  )
}

function renderWorkspace() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <AudioProcessorWorkspace manifest={MANIFEST} />
    </MemoryRouter>,
  )
}

test('the hero states what the tool does and offers its two ways in', () => {
  const html = renderHero()
  assert.match(html, /Choose a file/, 'the hero must offer the file picker')
  assert.match(html, /Open an empty workspace/, 'the hero must offer the empty workspace')
  assert.equal(html.match(/<button/g)?.length, 2, 'the hero must offer exactly two actions')
  assert.doesNotMatch(html, /<form/, 'the hero is not a form')
  assert.match(html, /<h1 class="ap-hero__title">/, 'the hero needs a real title')
  assert.match(html, /class="ap-lede"/, 'the hero needs a description')
})

test('the workspace carries the home affordance back to the index', () => {
  assert.match(renderWorkspace(), /All tools/)
})

test('the workspace binds a control to every key the manifest declares', () => {
  const html = renderWorkspace()
  for (const key of Object.keys(MANIFEST.parameters_schema)) {
    assert.ok(
      html.includes(`data-param-key="${key}"`),
      `the backend declares "${key}" but the workspace renders no control for it`,
    )
  }
  // The backend reads input_path out of the same params dict without declaring it.
  assert.ok(html.includes('data-param-key="input_path"'), 'input_path has no bound control')
})

/**
 * The signature: format and sample rate are choices, so they are pill segments
 * with a real pressed state, not a <select>.
 */
test('format and sample rate are tactile pill segments, not a dropdown', () => {
  const html = renderWorkspace()
  for (const option of ['wav', 'mp3', 'flac', 'ogg', 'm4a']) {
    assert.ok(html.includes(`>${option}</button>`), `format option "${option}" is not a pill`)
  }
  for (const option of ['22.05k', '44.1k', '48k']) {
    assert.ok(html.includes(`>${option}</button>`), `sample rate "${option}" is not a pill`)
  }
  // The pill labels are abbreviated for the reader; the value the backend reads
  // must still be the exact enum member, not the abbreviation.
  assert.ok(html.includes('title="sample_rate"'))
})

test('every manifest label is the manifest title, with the key kept as a tooltip', () => {
  const html = renderWorkspace()
  for (const spec of Object.values(MANIFEST.parameters_schema) as { title?: string }[]) {
    if (spec.title) assert.ok(html.includes(spec.title), `label "${spec.title}" is missing`)
  }
  for (const key of ['format', 'sample_rate', 'input_path']) {
    assert.ok(html.includes(`title="${key}"`), `parameter "${key}" lost its tooltip key`)
  }
})

/**
 * The truth contract. There is no bitrate or channel parameter in this manifest,
 * and the page must not grow one: it would be a control the backend ignores.
 */
test('the page invents no parameter the backend does not declare', () => {
  const html = renderWorkspace()
  assert.doesNotMatch(html, /data-param-key="bit_rate"/, 'bitrate is not a parameter of this tool')
  assert.doesNotMatch(html, /data-param-key="bitrate"/, 'bitrate is not a parameter of this tool')
  assert.doesNotMatch(html, /data-param-key="channels"/, 'channel count is forced by the backend, not chosen here')
})

test('with no source the page says so and offers the actions that fill it', () => {
  const html = renderWorkspace()
  assert.match(html, /Nothing to draw yet\./)
  assert.match(html, /Choose a file/, 'the empty state must point at the action that fills it')
  assert.match(html, /No source file yet, so there is nothing to convert\./)
})

test('the waveform is a container for real decoded peaks, not drawn bars', () => {
  const html = renderWorkspace()
  // The hero's crest profile is decoration and is marked as such; the
  // workspace's waveform hands the bytes to wavesurfer.js and draws what comes
  // back, so there is no generated bar array in it.
  assert.ok(html.includes('ap-wave__empty'), 'an unchosen source shows a designed empty state')
  assert.doesNotMatch(html, /ap-hero__bar/, 'the workspace must not reuse the hero profile')
})

test('playback is the real waveform, not the shared player', () => {
  const html = renderWorkspace()
  assert.ok(html.includes('ap-transport'), 'the workspace must carry its own transport')
  assert.match(html, />Play</, 'the transport must be reachable without a file picker')
  // The shared AudioPlayerModal draws 48 bars from Math.sin(i * 0.3) and routes to
  // other tools. Neither belongs on a standalone page whose whole point is that
  // the waveform is the decoded file.
  assert.ok(!html.includes('AudioPlayerModal'), 'the workspace must not render the shared modal')
  assert.ok(
    !renderWorkspace().includes('STANDALONE AUDIO PLAYER TOOL'),
    'the shared modal carries Tools Garage chrome and must not appear',
  )
})

test('no surface narrates its own honesty', () => {
  for (const [name, html] of [
    ['hero', renderHero()],
    ['workspace', renderWorkspace()],
  ] as const) {
    assert.doesNotMatch(
      html,
      /not this page|on purpose|nothing is drawn|manifest declares|backend reads|not a stub|no placeholder|already been handed/i,
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
  const region = html.indexOf('data-tool-gate-region="audio_processor"')
  const stage = html.indexOf('class="ap-stage"')
  assert.ok(region > -1, 'the trailing action bar must be marked as the gate region')
  assert.ok(region > stage, 'the gate must sit after the scrolling stage')
})

test('the audio_processor site is registered and discovered', async () => {
  const onDisk = await discoverSiteIdsOnDisk()
  assert.ok(onDisk.includes('audio_processor'), `audio_processor must have a site.ts, found: ${onDisk}`)
  assert.equal(describeSite('audio_processor', new Set(onDisk)).availability, 'built')
})