import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { canonicalId, getToolForm, ToolForm } from '../lib/toolForms'
import DownloaderForm from '../components/tools/DownloaderForm'
import TranslatorForm from '../components/tools/TranslatorForm'
import ModelHealthCheckForm from '../components/tools/ModelHealthCheckForm'

/** The cream tokens the shared forms used to hardcode, before they inherited
 *  their surfaces from whatever board they were mounted in. */
const HARDCODED_CREAM =
  /bg-brand-cream|bg-surface-white|text-brand-espresso|border-brand-sage|placeholder-brand-caramel-text/

const SHARED_FORM_SOURCES = [
  '../components/tools/DownloaderForm.tsx',
  '../components/tools/TranslatorForm.tsx',
  '../components/tools/ModelHealthCheckForm.tsx',
  '../components/common/DynamicForm.tsx',
  '../components/common/UniversalFileInput.tsx',
]

test('no shared form hardcodes the cream palette it used to be built in', () => {
  for (const path of SHARED_FORM_SOURCES) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    assert.doesNotMatch(
      source,
      HARDCODED_CREAM,
      `${path} must inherit its surface from the host, not pin a cream token`,
    )
  }
})

test('every shared form roots inside the scope that inherits the host surface', () => {
  for (const [toolId, schema] of [
    ['media.download.yt-dlp', { url: { type: 'string', title: 'URL' } }],
    ['subtitle.translate.srt', { target_lang: { type: 'string', title: 'Target' } }],
    ['sys.health.check', { model: { type: 'string', title: 'Model' } }],
    ['unknown.tool', { threshold: { type: 'number', title: 'Threshold' } }],
  ] as const) {
    const html = renderToStaticMarkup(
      <ToolForm toolId={toolId} schema={schema} value={{}} onChange={() => {}} />,
    )
    assert.match(html, /class="[^"]*\btool-form\b/, `${toolId} must render inside .tool-form`)
  }
})

test('canonical and legacy IDs resolve to each custom form, including health', () => {
  for (const [canonical, alias, form] of [
    ['media.download.yt-dlp', 'downloader', DownloaderForm],
    ['subtitle.translate.srt', 'subtitle_translator', TranslatorForm],
    ['sys.health.check', 'ai_model_health_check', ModelHealthCheckForm],
  ] as const) {
    assert.equal(canonicalId(alias), canonical)
    assert.equal(getToolForm(canonical), form)
    assert.equal(getToolForm(alias), form)
  }
  assert.equal(canonicalId('unknown.tool'), 'unknown.tool')
})

test('unknown tools render their manifest schema and retain parameter values', () => {
  const html = renderToStaticMarkup(<ToolForm toolId="unknown.tool" schema={{ threshold: { type: 'number', title: 'Threshold' } }} value={{ threshold: 7 }} onChange={() => {}} />)
  assert.match(html, /Threshold/)
  assert.match(html, /value="7"/)
})
