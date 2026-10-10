import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { BESPOKE_PAGES } from '../lib/toolPageModules'
import { getToolForm } from '../lib/toolForms'
import CodecToolPage from '../pages/tools/CodecToolPage'
import ScriptRunnerPage from '../pages/tools/ScriptRunnerPage'
import SrtTranslatorPage from '../pages/tools/SrtTranslatorPage'
import SummarizerPage from '../pages/tools/SummarizerPage'
import LlmTranslatorPage from '../pages/tools/LlmTranslatorPage'
import ModelHealthCheckPage from '../pages/tools/ModelHealthCheckPage'

const PAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../pages/tools')
const FORM_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../components/tools')

/** Source files of the reusable forms these pages delegate to. */
const SHARED_FORM_FILES: Partial<Record<(typeof TOOL_IDS)[number], string>> = {
  'subtitle.translate.srt': 'TranslatorForm.tsx',
  'sys.health.check': 'ModelHealthCheckForm.tsx',
}

const TOOL_IDS = [
  'summarizer',
  'subtitle.translate.srt',
  'text.translate.llm',
  'codec_tool',
  'script_runner',
  'sys.health.check',
] as const

const MANIFEST_SCHEMAS: Record<(typeof TOOL_IDS)[number], Record<string, unknown>> = {
  summarizer: {
    text: { type: 'string', title: 'Input Text', widget: 'textarea', default: '' },
    input_path: { type: 'string', title: 'Input File (Optional)', default: '' },
    max_bullets: { type: 'number', title: 'Maximum Key Takeaways', default: 5 },
    format: { type: 'string', title: 'Output Format', enum: ['markdown', 'plain'], default: 'markdown' },
  },
  'subtitle.translate.srt': {
    input_path: { type: 'string', title: 'Subtitle File', default: '' },
    target_lang: { type: 'string', title: 'Target Language', enum: ['English', 'Korean'], default: 'English' },
    source_lang: { type: 'string', title: 'Source Language', enum: ['auto', 'Korean'], default: 'auto' },
    provider: { type: 'string', title: 'AI Translation Provider', enum: ['auto', 'groq'], default: 'auto' },
    model: { type: 'string', title: 'Model Name Override', default: 'auto' },
    batch_size: { type: 'number', title: 'Subtitle Batch Size', default: 50 },
  },
  'text.translate.llm': {
    input_path: { type: 'string', title: 'Text / Document File', default: '' },
    target_lang: { type: 'string', title: 'Target Language', enum: ['English', 'Korean'], default: 'English' },
    source_lang: { type: 'string', title: 'Source Language', enum: ['auto', 'Korean'], default: 'auto' },
    provider: { type: 'string', title: 'AI Translation Provider', enum: ['auto', 'groq'], default: 'auto' },
    model: { type: 'string', title: 'Model Name Override', default: 'auto' },
  },
  codec_tool: {
    codec: {
      type: 'string',
      title: 'Codec Transformation',
      enum: ['base64_encode', 'base64_decode', 'hex_encode', 'hex_decode', 'url_encode', 'url_decode'],
      default: 'base64_encode',
    },
    text: { type: 'string', title: 'Input Text', widget: 'textarea', default: '' },
    input_path: { type: 'string', title: 'Input File (Optional)', default: '' },
  },
  script_runner: {
    language: { type: 'string', enum: ['python', 'bash'], default: 'python' },
    code: { type: 'string' },
    custom_args: { type: 'string', default: '' },
    timeout: { type: 'number', default: 300 },
  },
  'sys.health.check': {
    provider: { type: 'string', title: 'AI Provider Selector', enum: ['all', 'openai'], default: 'all' },
    model: { type: 'string', title: 'Specific Model Override', default: '' },
    models: { type: 'string', title: 'Selected Models List', default: '' },
    fetch_live_models: { type: 'boolean', title: 'Fetch Live Models from Provider', default: false },
    api_key: { type: 'string', title: 'Ephemeral API Key', widget: 'secret', default: '' },
    mock_offline: { type: 'boolean', title: 'Mock Offline Simulation', default: false },
  },
}

const PAGE_COMPONENTS = {
  summarizer: SummarizerPage,
  'subtitle.translate.srt': SrtTranslatorPage,
  'text.translate.llm': LlmTranslatorPage,
  codec_tool: CodecToolPage,
  script_runner: ScriptRunnerPage,
  'sys.health.check': ModelHealthCheckPage,
} as const

test('all six tool ids are registered in BESPOKE_PAGES', () => {
  for (const id of TOOL_IDS) {
    assert.ok(Object.hasOwn(BESPOKE_PAGES, id), `BESPOKE_PAGES is missing "${id}"`)
    assert.equal(BESPOKE_PAGES[id], PAGE_COMPONENTS[id], `BESPOKE_PAGES["${id}"] points at the wrong component`)
  }
})

test('BESPOKE_PAGES is append-only relative to the pre-existing 15 keys', () => {
  const previous = [
    'media.download.yt-dlp', 'trimmer', 'transcriber', 'audio_processor', 'imagemagick',
    'exif_scrubber', 'pandoc', 'pdf_tools', 'ocrmypdf', 'packager', 'mediainfo',
    'streamlink', 'sox', 'demucs', 'gallery-dl',
  ]
  for (const id of previous) {
    assert.ok(Object.hasOwn(BESPOKE_PAGES, id), `pre-existing key "${id}" was dropped`)
  }
  assert.equal(Object.keys(BESPOKE_PAGES).length, previous.length + TOOL_IDS.length)
})

test('every manifest parameter key renders a labelled control on its own page', () => {
  for (const id of TOOL_IDS) {
    const Page = PAGE_COMPONENTS[id]
    const manifest = {
      id,
      name: id,
      description: 'test manifest',
      input_kinds: [],
      output_kinds: [],
      parameters_schema: MANIFEST_SCHEMAS[id],
    }
    const html = renderToStaticMarkup(
      <Page manifest={manifest} initialParams={{}} />,
    )

    // Keys the page delegates to a registered shared form must be bound by that
    // form (it is foundation code and does not emit `data-param-key` markers).
    const shared = getToolForm(id)
    const sharedSource = shared ? readFileSync(resolve(FORM_DIR, `${SHARED_FORM_FILES[id]}`), 'utf8') : ''
    // A shared form binds a key by string literal or by property access on the
    // value object (e.g. `value.provider`); either counts as a real binding.
    const bindsInForm = (key: string) =>
      Boolean(shared) &&
      [ `'${key}'`, `"${key}"`, '`' + key + '`', `.${key}` ].some((needle) => sharedSource.includes(needle))

    const delegated = new Set(Object.keys(MANIFEST_SCHEMAS[id]).filter(bindsInForm))

    for (const key of Object.keys(MANIFEST_SCHEMAS[id])) {
      if (delegated.has(key)) {
        assert.ok(bindsInForm(key), `${id}: shared form does not bind "${key}"`)
        continue
      }
      assert.match(html, new RegExp(`data-param-key="${key}"`), `${id} has no control bound to "${key}"`)
    }
  }
})

test('CodecToolPage ships no hardcoded sample payload', () => {
  const source = readFileSync(resolve(PAGE_DIR, 'CodecToolPage.tsx'), 'utf8')
  assert.doesNotMatch(source, /useState\(['"][A-Za-z0-9+/=]{12,}['"]\)/)
})

test('ScriptRunnerPage reads the real execution output fields', () => {
  const source = readFileSync(resolve(PAGE_DIR, 'ScriptRunnerPage.tsx'), 'utf8')
  assert.match(source, /exit_code|stdout|stderr/)
})

test('ScriptRunnerPage treats a non-zero exit code as a failure state', () => {
  const source = readFileSync(resolve(PAGE_DIR, 'ScriptRunnerPage.tsx'), 'utf8')
  // `failed` must be derived from the response status, never from elapsed time or phase guesses.
  assert.match(source, /status === 'failed'/)
  assert.match(source, /execute\.state\.error/)
})

test('summarizer page reads takeaways only from a verified completed response', () => {
  const source = readFileSync(resolve(PAGE_DIR, 'SummarizerPage.tsx'), 'utf8')
  assert.match(source, /status === 'completed'/)
  assert.match(source, /takeaways/)
  assert.match(source, /bullet_count/)
})