import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import DemucsHero from '../sites/demucs/DemucsHero'
import DemucsWorkspace from '../sites/demucs/DemucsWorkspace'
import {
  ARCHIVE_LEDGER_NOTE,
  DECLARED_STEMS,
  DEMUCS_COMMAND,
  DEMUCS_ID,
  artifactContentUrl,
  failureHeadline,
  isPlayableAudioName,
  ledgerCaption,
  ledgerEntryKind,
  playhead,
} from '../sites/demucs/demucsModel'
import { discoverSiteIdsOnDisk } from './siteParity'
import { describeSite } from '../sites/registry'
import type { ToolManifest } from '../lib/api'

/**
 * The manifest exactly as `DemucsTool.register` in
 * `backend/app/tools/mediainfo_tool.py` declares it: one parameter, no format,
 * no model, no stem count, and nothing else.
 */
const MANIFEST: ToolManifest = {
  id: 'demucs',
  name: 'AI Audio Stem Separator (Demucs)',
  description:
    'Isolate vocal, drum, bass, and instrumental stems from songs and audio tracks using AI.',
  category: 'Media',
  tags: ['audio', 'ai', 'stems', 'demucs', 'music', 'separator'],
  input_kinds: ['audio', 'video', 'any'],
  output_kinds: ['audio', 'binary'],
  parameters_schema: {
    input_path: { type: 'string' },
  },
} as unknown as ToolManifest

/**
 * The failure a real run returned on this machine, byte for byte. `demucs` is
 * genuinely absent, so the backend's own subprocess runs and dies on the missing
 * PyTorch import rather than refusing to start.
 */
const REAL_DEMUCS_FAILURE = [
  'Traceback (most recent call last):',
  'File "[path]", line 3, in <module>',
  'from demucs.separate import main',
  'File "[path]", line 11, in <module>',
  'import torch as th',
  "ModuleNotFoundError: No module named 'torch'",
].join('\n')

function renderHero() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <DemucsHero manifest={MANIFEST} />
    </MemoryRouter>,
  )
}

function renderWorkspace(initialInputPath?: string) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <DemucsWorkspace manifest={MANIFEST} initialInputPath={initialInputPath} />
    </MemoryRouter>,
  )
}

// ------------------------------------------------------------- what the backend does

test('the archive name is the one the backend zips its output into', () => {
  // `DemucsTool.execute` builds `dest / "stems.zip"` and returns exactly that
  // one Artifact, so a name the page invents would be a second false artifact.
  assert.equal(DEMUCS_ID, 'demucs')
  const html = renderHero()
  assert.match(html, /stems\.zip/)
})

test('an archive is never offered as playable audio', () => {
  assert.equal(ledgerEntryKind('stems.zip'), 'archive')
  assert.equal(isPlayableAudioName('stems.zip'), false)
  assert.match(ledgerCaption('stems.zip'), /An archive\./)
  assert.match(ledgerCaption('stems.zip'), /inside this file/)
})

test('sound is playable and a zip is not, whatever the backend calls the kind', () => {
  // `DemucsTool.execute` labels the zip `kind=audio`. Trusting that label would
  // put a play button on an archive, so the extension decides.
  assert.equal(ledgerEntryKind('vocals.wav'), 'audio')
  assert.equal(isPlayableAudioName('vocals.wav'), true)
  assert.equal(isPlayableAudioName('track.mp3'), true)
  assert.equal(isPlayableAudioName('track.flac'), true)
  assert.equal(ledgerEntryKind('notes.txt'), 'other')
  assert.equal(isPlayableAudioName('noextension'), false)
  assert.match(ledgerCaption('vocals.wav'), /Sound served from this machine/)
})

test('the ledger note says the stems are inside the archive, not beside it', () => {
  assert.match(ARCHIVE_LEDGER_NOTE, /one file/i)
  assert.match(ARCHIVE_LEDGER_NOTE, /inside it/)
  assert.match(ARCHIVE_LEDGER_NOTE, /not four separate artifacts/i)
})

test('the declared stems are the manifest description\'s own words', () => {
  // The backend's own sentence: "Isolate vocal, drum, bass, and instrumental
  // stems from songs and audio tracks using AI." Anything else would be a stem
  // list this page made up.
  assert.deepEqual([...DECLARED_STEMS], ['vocal', 'drum', 'bass', 'instrumental'])
  for (const stem of DECLARED_STEMS) {
    assert.ok(
      MANIFEST.description.toLowerCase().includes(stem),
      `the manifest description does not name "${stem}"`,
    )
  }
})

test('the command shown is the one DemucsTool.execute builds', () => {
  // cmd = ["demucs", "--out", str(dest), str(src)]
  assert.equal(DEMUCS_COMMAND, 'demucs --out <destination> <source>')
})

test('the headline is the failing line of a real traceback, not a paraphrase', () => {
  assert.equal(
    failureHeadline(REAL_DEMUCS_FAILURE),
    "ModuleNotFoundError: No module named 'torch'",
  )
  assert.equal(failureHeadline(''), null)
  assert.equal(failureHeadline(null), null)
})

test('a playhead reads off the clock and never guesses one', () => {
  assert.equal(playhead(0), '00:00')
  assert.equal(playhead(8), '00:08')
  assert.equal(playhead(75.4), '01:15')
  assert.equal(playhead(Number.NaN), '--:--')
})

test('artifact bytes are served through the content endpoint, path-encoded', () => {
  const url = artifactContentUrl('/downloads/demucs/stems.zip')
  assert.match(url, /\/api\/artifacts\/content\?path=/)
  assert.match(url, /stems\.zip/)
  // A path with a space has to survive the query string.
  assert.match(artifactContentUrl('/a b/song one.wav'), /a%20b%2Fsong%20one\.wav/)
})

// ----------------------------------------------------------------- the hero

test('the hero states what the tool does and offers its two ways in', () => {
  const html = renderHero()
  assert.match(html, /Isolate vocal, drum, bass, and instrumental stems/)
  assert.match(html, /Choose a file/)
  assert.match(html, /Open an empty workspace/)
})

test('the hero offers exactly two actions', () => {
  const html = renderHero()
  const buttons = html.match(/<button\b/g) ?? []
  assert.equal(buttons.length, 2, `the hero must offer two buttons, found ${buttons.length}`)
})

test('the hero labels the stem list as the general split, not a run\'s output', () => {
  const html = renderHero()
  assert.match(html, /What the tool separates, in general/)
  assert.match(html, /not files a run on this machine returned/)
})

test('the hero does not offer a play control for the archive', () => {
  const html = renderHero()
  assert.ok(!html.includes('<audio'), 'the hero has no bytes to play')
  assert.doesNotMatch(html, /Play (the )?(stem|archive)/i)
})

test('the hero says the install is opt-in and asks twice', () => {
  const html = renderHero()
  assert.match(html, /opt-in/)
  assert.match(html, /asks twice/)
})

// ------------------------------------------------------------- the workspace

test('the workspace carries the home affordance back to the index', () => {
  assert.match(renderWorkspace(), /All tools/)
})

test('the workspace binds a control to the one key the manifest declares', () => {
  assert.ok(renderWorkspace().includes('data-param-key="input_path"'))
})

test('the page invents no parameter the backend does not declare', () => {
  const html = renderWorkspace()
  for (const match of html.matchAll(/data-param-key="([^"]+)"/g)) {
    assert.equal(match[1], 'input_path', `the page binds an undeclared key: ${match[1]}`)
  }
  // No format, model or stem-count control exists anywhere on the page, by key
  // or by the field name a form control would carry.
  for (const invented of ['output_format', 'model', 'num_stems', 'stem_count', 'model_name']) {
    assert.ok(
      !new RegExp(`(data-param-key|name|id)="${invented}"`).test(html),
      `the page offers an undeclared key: ${invented}`,
    )
  }
})

test('the source is playable and is served as real bytes', () => {
  const html = renderWorkspace('/home/user/l3.wav')
  assert.match(html, /<audio/)
  assert.match(html, /\/api\/artifacts\/content\?path=/)
  assert.match(html, /Play source/)
})

test('with no source the page says so and names the actions that fill it', () => {
  const html = renderWorkspace()
  assert.match(html, /Nothing to separate yet\./)
  assert.match(html, /Choose a file on the intro page/)
  assert.match(html, /No source file yet, so there is nothing to separate\./)
})

test('an idle workspace never shows a ledger row it did not receive', () => {
  const html = renderWorkspace('/home/user/l3.wav')
  assert.doesNotMatch(html, /dm-ledger/, 'an empty ledger is not a ledger of results')
  assert.doesNotMatch(html, /dm-entry__caption/, 'no caption without an artifact to caption')
})

test('the failure path renders the backend message unbroken', () => {
  // The failure section and the traceback are rendered by the workspace when a
  // run has failed, so the styling hooks must exist and the copy must not have
  // been softened into a summary.
  const css = readFileSync(new URL('../sites/demucs/demucs.css', import.meta.url), 'utf8')
  assert.match(css, /\.dm-failure__trace\b/)
  assert.match(css, /white-space: pre-wrap/)
  assert.match(css, /\.dm-failure__headline\b/)
  // And the model's headline really is the last line of the real message.
  assert.equal(
    failureHeadline(REAL_DEMUCS_FAILURE),
    REAL_DEMUCS_FAILURE.split('\n').at(-1),
  )
})

test('the run control is live once a source is chosen', () => {
  // Deliberately not gated on `deps.ready`: the backend runs the command anyway
  // and fails with a message worth reading, so a disabled button would hide the
  // one true thing this page has to show.
  const html = renderWorkspace('/home/user/l3.wav')
  assert.match(html, /class="dm-btn dm-btn--accent dm-btn--run"/)
  assert.doesNotMatch(html, /class="dm-btn dm-btn--accent dm-btn--run"[^>]*disabled/)
})

test('with no source the run control is disabled', () => {
  const html = renderWorkspace()
  assert.match(html, /class="dm-btn dm-btn--accent dm-btn--run"[^>]*disabled/)
})

test('the dock note refuses to promise a separation the gate says is unavailable', () => {
  const html = renderWorkspace('/home/user/l3.wav')
  assert.match(html, /gate below reports this tool missing on this machine/)
  assert.doesNotMatch(html, /Separating l3\.wav on this machine/)
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
  const region = html.indexOf('data-tool-gate-region="demucs"')
  const main = html.indexOf('class="dm-main"')
  assert.ok(region > -1, 'the trailing action bar must be marked as the gate region')
  assert.ok(region > main, 'the gate must sit after the scrolling stage')
  assert.match(html, /data-dep-gate="demucs"/)
})

test('the demucs site is registered and discovered', async () => {
  const onDisk = await discoverSiteIdsOnDisk()
  assert.ok(onDisk.includes('demucs'), `demucs must have a site.ts, found: ${onDisk}`)
  assert.equal(describeSite('demucs', new Set(onDisk)).availability, 'built')
  // Brief #8's registry accent, so the home index paints this card its own hue.
  assert.equal(describeSite('demucs').accent, '#7A6A53')
})
