import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import TranscriberHero from '../sites/transcriber/TranscriberHero'
import TranscriberWorkspace from '../sites/transcriber/TranscriberWorkspace'
import TranscriptView from '../sites/transcriber/TranscriptView'
import {
  MODE_OUTPUTS,
  marginalTime,
  modeWritesSubtitles,
  parseSrt,
  readArtifactText,
  styleAffectsOutput,
  transcriptFromFiles,
} from '../sites/transcriber/transcriberModel'
import { discoverSiteIdsOnDisk } from './siteParity'
import { describeSite } from '../sites/registry'
import type { ToolManifest } from '../lib/api'

/**
 * The manifest exactly as `AudioToTextTool.register` in
 * `backend/app/tools/downloader.py` declares it, including the five keys and
 * nothing else.
 */
const MANIFEST: ToolManifest = {
  id: 'transcriber',
  name: 'Audio to Text & Subtitles (Speech-to-Text / SRT)',
  description:
    'Transcribe speech into clean text (.txt) and broadcast-grade subtitles (.srt / .vtt) using NVIDIA NIM, Groq, or Faster-Whisper.',
  category: 'AI & Tutoring',
  tags: [],
  input_kinds: [],
  output_kinds: [],
  parameters_schema: {
    provider: {
      type: 'string',
      title: 'ASR Provider',
      enum: ['auto', 'nvidia', 'groq', 'faster-whisper'],
      default: 'auto',
      description: "Speech-to-Text provider. 'auto' selects NVIDIA NIM from ~/.bashrc, then Groq, then local Faster-Whisper.",
    },
    model: {
      type: 'string',
      title: 'Model Name',
      default: 'auto',
      description: 'Model override (e.g. openai/whisper-large-v3, whisper-large-v3-turbo, or base).',
    },
    output_mode: {
      type: 'string',
      title: 'Output Format Mode',
      enum: ['both', 'subtitles', 'clean_text', 'timestamped_text'],
      default: 'both',
      description:
        'Choose whether to generate timed subtitles (.srt & .vtt), clean reading text (.txt), or both.',
    },
    subtitle_style: {
      type: 'string',
      title: 'Subtitle Style Preset',
      enum: ['broadcast', 'compact', 'raw'],
      default: 'broadcast',
      description:
        'Enforces professional line length (broadcast: max 42 chars/line; compact: max 30 chars/line).',
    },
    task: {
      type: 'string',
      title: 'Task Mode',
      enum: ['transcribe', 'translate'],
      enumLabels: {
        transcribe: 'Transcribe (Original Spoken Language)',
        translate: 'Translate to English (Auto-detect speech & translate directly to English)',
      },
      default: 'transcribe',
      description:
        "Select 'translate' to translate spoken audio directly into English subtitles and text via Whisper.",
    },
  },
} as unknown as ToolManifest

function renderHero() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <TranscriberHero manifest={MANIFEST} />
    </MemoryRouter>,
  )
}

function renderWorkspace(initialInputPath?: string) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <TranscriberWorkspace manifest={MANIFEST} initialInputPath={initialInputPath} />
    </MemoryRouter>,
  )
}

/** `jfk3.srt` as a real run through the backend left it on disk. */
const REAL_SRT = [
  '1',
  '00:00:00,000 --> 00:00:10,380',
  'And so, my fellow Americans, ask not what your',
  'country can do for you, ask what you can do for',
  'your country.',
  '',
  '2',
  '00:00:11,600 --> 00:00:22,060',
  'Thank you.',
  '',
].join('\n')

// --------------------------------------------------------------- the parser

test('the SRT parser reads the cues the backend writes', () => {
  // Byte-for-byte the shape of `jfk3.srt` as a real run left it on disk.
  const srt = [
    '1',
    '00:00:00,000 --> 00:00:10,380',
    'And so, my fellow Americans, ask not what your',
    'country can do for you, ask what you can do for',
    'your country.',
    '',
    '2',
    '00:00:11,600 --> 00:00:22,060',
    'Thank you.',
    '',
  ].join('\n')

  const cues = parseSrt(srt)
  assert.equal(cues.length, 2)
  assert.deepEqual(
    { n: cues[0].number, s: cues[0].start, e: cues[0].end },
    { n: 1, s: 0, e: 10.38 },
  )
  assert.equal(cues[1].start, 11.6)
  assert.equal(cues[1].end, 22.06)
  // The wrapped lines are joined back into the sentence a reader wants.
  assert.equal(
    cues[0].text,
    'And so, my fellow Americans, ask not what your country can do for you, ask what you can do for your country.',
  )
  assert.equal(cues[1].text, 'Thank you.')
})

test('the SRT parser keeps the punctuation a pure tone actually transcribes to', () => {
  // `tone8.srt` on disk, in full.
  const cues = parseSrt('1\n00:00:00,000 --> 00:00:08,000\n.\n')
  assert.equal(cues.length, 1)
  assert.equal(cues[0].text, '.')
})

test('the SRT parser drops a block it cannot read rather than showing half a cue', () => {
  const cues = parseSrt('1\nnot a timecode\nsomething\n\n2\n00:00:01,000 --> 00:00:02,000\nkept\n')
  assert.equal(cues.length, 1)
  assert.equal(cues[0].number, 2)
})

test('a cue with no words is not a cue', () => {
  assert.equal(parseSrt('1\n00:00:00,000 --> 00:00:08,000\n\n').length, 0)
})

test('the timestamped reader reads the bracketed form the backend writes', () => {
  const { transcript } = transcriptFromFiles([
    {
      name: 'jfk3_timestamped.txt',
      path: '/downloads/transcriber/jfk3_timestamped.txt',
      body: '[00:00:00] And so my fellow Americans.\n[00:00:03] Ask not.\n',
    },
  ])
  assert.equal(transcript?.kind, 'lines')
  if (transcript?.kind !== 'lines') return
  assert.deepEqual(transcript.lines[0], { at: '00:00:00', text: 'And so my fellow Americans.' })
  assert.deepEqual(transcript.lines[1], { at: '00:00:03', text: 'Ask not.' })
})

test('a marginal timecode is read off the cue, never guessed', () => {
  assert.equal(marginalTime(10.38), '00:10.380')
  assert.equal(marginalTime(0), '00:00.000')
  assert.equal(marginalTime(Number.NaN), '--:--.--')
})

// ------------------------------------------------------- what the backend does

test('each output mode is described by the files that mode really writes', () => {
  assert.deepEqual(MODE_OUTPUTS.both.extensions, ['.srt', '.vtt', '_clean.txt'])
  assert.deepEqual(MODE_OUTPUTS.subtitles.extensions, ['.srt', '.vtt'])
  assert.deepEqual(MODE_OUTPUTS.clean_text.extensions, ['.txt'])
  assert.deepEqual(MODE_OUTPUTS.timestamped_text.extensions, ['_timestamped.txt'])
})

test('subtitle style is called inert only on the modes that write no subtitle', () => {
  assert.equal(styleAffectsOutput('both'), true)
  assert.equal(styleAffectsOutput('subtitles'), true)
  // `build_smart_subtitles` uses the style only to wrap subtitle lines.
  assert.equal(styleAffectsOutput('clean_text'), false)
  assert.equal(styleAffectsOutput('timestamped_text'), false)
})

test('a mode is a subtitle mode only when it writes a .srt', () => {
  assert.equal(modeWritesSubtitles('both'), true)
  assert.equal(modeWritesSubtitles('subtitles'), true)
  assert.equal(modeWritesSubtitles('clean_text'), false)
  assert.equal(modeWritesSubtitles('timestamped_text'), false)
})

test('both shapes of the artifact endpoint are unwrapped to the file itself', async () => {
  // `/api/artifacts/content` returns a FileResponse for `.srt` and `.vtt` and a
  // JSON envelope for `.txt`. Reading one shape and setting it as prose would
  // set the other's braces as if they were the transcription.
  const SRT = '1\n00:00:00,000 --> 00:00:08,000\n.\n'
  const envelope = JSON.stringify({
    content: '[00:00:00] And so my fellow Americans.',
    name: 'speech_timestamped.txt',
    size: 34,
    kind: 'txt',
  })

  const realFetch = globalThis.fetch
  try {
    let body = SRT
    globalThis.fetch = (async () => ({ ok: true, text: async () => body })) as typeof fetch
    assert.equal(await readArtifactText('/downloads/transcriber/tone8.srt'), SRT)

    body = envelope
    assert.equal(await readArtifactText('/downloads/transcriber/speech_timestamped.txt'), '[00:00:00] And so my fellow Americans.')

    // A transcript that merely starts with a brace is still a transcript.
    body = '{"this": "is what was said"}'
    assert.equal(await readArtifactText('/downloads/transcriber/quoted.txt'), '{"this": "is what was said"}')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('a file that could not be read is reported rather than filled in', async () => {
  const realFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => ({ ok: false, status: 404, statusText: 'Not Found' })) as typeof fetch
    await assert.rejects(() => readArtifactText('/downloads/transcriber/gone.txt'), /404/)
  } finally {
    globalThis.fetch = realFetch
  }
})

// ----------------------------------------------------------------- the hero

test('the hero states what the tool does and offers its two ways in', () => {
  const html = renderHero()
  assert.match(html, /Speech in\./)
  assert.match(html, /transcribe speech into clean text/i)
  assert.match(html, /Choose a file/)
  assert.match(html, /Open an empty workspace/)
})

test('the specimen shows the cue format, not an invented transcript', () => {
  const html = renderHero()
  assert.match(html, /HH:MM:SS,mmm/, 'the timestamp format is what the hero must show')
  assert.match(html, /--&gt;|--&gt;|&#45;&gt;|--&gt;|→|-->/)
  assert.doesNotMatch(
    html,
    /fellow Americans|ask not what your country/i,
    'the hero must not set a sentence it did not transcribe',
  )
})

test('the hero says which providers it needs without claiming one answered', () => {
  const html = renderHero()
  assert.match(html, /NVIDIA NIM/)
  assert.match(html, /Groq/)
  assert.match(html, /faster-whisper/)
})

// ------------------------------------------------------------- the workspace

test('the workspace carries the home affordance back to the index', () => {
  const html = renderWorkspace()
  assert.match(html, /All tools/)
})

test('the workspace binds a control to every key the manifest declares', () => {
  const html = renderWorkspace()
  for (const key of ['input_path', 'provider', 'model', 'output_mode', 'subtitle_style', 'task']) {
    assert.ok(
      html.includes(`data-param-key="${key}"`),
      `no control is bound to ${key}`,
    )
  }
})

test('the manifest labels are its own titles, with the key kept as a tooltip', () => {
  const html = renderWorkspace()
  for (const title of ['ASR Provider', 'Model Name', 'Output Format Mode', 'Subtitle Style Preset', 'Task Mode']) {
    assert.ok(html.includes(title), `the label "${title}" is not the manifest's own`)
  }
  assert.ok(html.includes('title="subtitle_style"'))
})

test('every enum option is offered, and each is reachable as a pressed state', () => {
  const html = renderWorkspace()
  for (const option of ['auto', 'nvidia', 'groq', 'faster-whisper']) {
    assert.ok(html.includes(`>${option}<`) || html.includes(`>${option}`), `${option} is not offered`)
  }
  assert.match(html, /aria-pressed="true"/, 'the seeded default must be the pressed one')
})

test('the page invents no parameter the backend does not declare', () => {
  const html = renderWorkspace()
  const declared = ['input_path', 'provider', 'model', 'output_mode', 'subtitle_style', 'task']
  for (const match of html.matchAll(/data-param-key="([^"]+)"/g)) {
    assert.ok(declared.includes(match[1]), `the page binds an undeclared key: ${match[1]}`)
  }
})

test('the transcript is read back out of the file the run wrote', () => {
  // Rendered from the bytes a real run produced, so this checks the marginalia
  // against actual backend output rather than against an intention.
  const { transcript, problem } = transcriptFromFiles([
    { name: 'jfk3.srt', path: '/downloads/transcriber/jfk3.srt', body: REAL_SRT },
  ])
  assert.equal(problem, null)
  const html = renderToStaticMarkup(<TranscriptView transcript={transcript} activeCue={null} />)
  assert.ok(html.includes('tc-cue__margin'), 'cues must carry their marginalia')
  assert.ok(html.includes('tc-cue__num'), 'the cue number belongs in the margin')
  assert.ok(html.includes('tc-cue__text'), 'the spoken words are the paragraph')
  // The margin holds what the backend wrote, read back out of the file: the
  // cue's own index, and the start it was given.
  assert.match(html, /<span class="tc-cue__num ap-mono">1<\/span>/)
  assert.match(html, /00:00\.000/)
  assert.match(html, /00:11\.600/)
  assert.ok(!html.includes('<canvas'), 'there is no waveform here; this page sets text')
})

test('the margin column sits beside the text, not under it', () => {
  const { transcript } = transcriptFromFiles([
    { name: 'jfk3.srt', path: '/downloads/transcriber/jfk3.srt', body: REAL_SRT },
  ])
  const html = renderToStaticMarkup(<TranscriptView transcript={transcript} activeCue={2} />)
  // The margin is a sibling of the text inside the cue, and the playing cue is
  // the one the audio element reported.
  assert.match(html, /class="tc-cue__margin"[^]*?<p class="tc-cue__text">/)
  assert.match(html, /data-playing="true"/)
  assert.equal((html.match(/data-playing="true"/g) ?? []).length, 1)
  assert.equal((html.match(/data-playing="false"/g) ?? []).length, 1)
})

test('a text-only mode is set as prose, with no cue numbers invented for it', () => {
  const { transcript } = transcriptFromFiles([
    {
      name: 'jfk3.txt',
      path: '/downloads/transcriber/jfk3.txt',
      body: 'First paragraph.\n\nSecond paragraph.',
    },
  ])
  const html = renderToStaticMarkup(<TranscriptView transcript={transcript} activeCue={null} />)
  assert.match(html, /tc-doc--prose/)
  assert.ok(!html.includes('tc-cue__num'), 'a clean text file has no cue numbers to set')
  assert.match(html, /First paragraph\./)
  assert.match(html, /Second paragraph\./)
})

test('the source transport is the file itself, not a stand-in', () => {
  const html = renderWorkspace('/tmp/speech.wav')
  assert.match(html, /<audio/)
  assert.match(html, /\/api\/artifacts\/content\?path=/)
  assert.ok(html.includes('tc-source__clock'))
})

test('with no source the page says so and offers the actions that fill it', () => {
  const html = renderWorkspace()
  assert.match(html, /Nothing to set yet\./)
  assert.match(html, /Choose a file on the intro page/)
  assert.match(html, /No source file yet, so there is nothing to transcribe\./)
})

test('the style control admits when the chosen mode makes it do nothing', () => {
  // The default mode is `both`, which writes subtitles, so the control explains
  // itself there; the inert wording belongs to the text-only modes.
  const html = renderWorkspace()
  assert.ok(
    !html.includes('it changes nothing about this run'),
    'on the default mode the style is not inert and must not claim to be',
  )
})

test('the auto provider is described as undecided rather than resolved', () => {
  const html = renderWorkspace()
  assert.match(
    html,
    /reports back only when every one of them has failed/,
    'no run names the provider that answered, so the page must not either',
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
  const region = html.indexOf('data-tool-gate-region="transcriber"')
  const main = html.indexOf('class="tc-main"')
  assert.ok(region > -1, 'the trailing action bar must be marked as the gate region')
  assert.ok(region > main, 'the gate must sit after the scrolling stage')
})

test('the transcriber site is registered and discovered', async () => {
  const onDisk = await discoverSiteIdsOnDisk()
  assert.ok(onDisk.includes('transcriber'), `transcriber must have a site.ts, found: ${onDisk}`)
  assert.equal(describeSite('transcriber', new Set(onDisk)).availability, 'built')
})
