import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import CodecHero from '../sites/codec_tool/Hero'
import CodecWorkspace from '../sites/codec_tool/Workspace'
import type { ToolManifest } from '../lib/api'

const MANIFEST: ToolManifest = {
  id: 'codec_tool',
  name: 'Encoder & Decoder Utilities (Base64 / Hex / URL)',
  description: 'Encode and decode text and binary payloads with Base64, Hexadecimal, and URL encoding schemes.',
  category: 'Security',
  tags: ['security', 'codec', 'base64', 'hex', 'url'],
  input_kinds: ['any', 'text'],
  output_kinds: ['text'],
  parameters_schema: {
    codec: { type: 'string', title: 'Codec Transformation', enum: ['base64_encode', 'base64_decode', 'hex_encode', 'hex_decode', 'url_encode', 'url_decode'], default: 'base64_encode' },
    text: { type: 'string', title: 'Input Text', widget: 'textarea', description: 'Text to encode or decode (or select a file below).', default: '', placeholder: 'Enter text to encode or decode...' },
    input_path: { type: 'string', title: 'Input File (Optional)', description: 'Path to file to encode or decode.', default: '' },
  },
}

function hero() {
  return renderToStaticMarkup(<MemoryRouter><CodecHero manifest={MANIFEST} /></MemoryRouter>)
}

function workspace() {
  return renderToStaticMarkup(<MemoryRouter><CodecWorkspace manifest={MANIFEST} /></MemoryRouter>)
}

test('hero offers exactly two ways into the workspace', () => {
  const html = hero()
  assert.equal(html.match(/<button/g)?.length, 2)
  assert.match(html, /<h1/)
  assert.match(html, /ct-hero__lede/)
})

test('workspace binds every real manifest key and offers exactly six codecs', () => {
  const html = workspace()
  for (const key of Object.keys(MANIFEST.parameters_schema)) {
    assert.ok(html.includes(`data-param-key="${key}"`), `missing bound control for ${key}`)
  }
  assert.equal(html.match(/class="ct-codec-option"/g)?.length, 6)
  for (const title of ['Codec Transformation', 'Input Text', 'Input File (Optional)']) assert.ok(html.includes(title))
})

test('workspace never pre-fills payload fields or uses a long payload placeholder', () => {
  const html = workspace()
  assert.match(html, /<textarea[^>]*><\/textarea>/)
  assert.match(html, /id="ct-file-path" type="text" value=""/)
  assert.doesNotMatch(html, /placeholder=/)
  assert.doesNotMatch(html, /Enter text to encode or decode/)
})

test('site has no Tools Garage chrome', () => {
  for (const html of [hero(), workspace()]) {
    for (const phrase of ['Tools Garage', 'Workspaces', 'Remote', 'ENGINE STATUS']) assert.ok(!html.includes(phrase))
  }
})
