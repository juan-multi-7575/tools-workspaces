import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { canonicalId, getToolForm, ToolForm } from '../lib/toolForms'
import DownloaderForm from '../components/tools/DownloaderForm'
import TranslatorForm from '../components/tools/TranslatorForm'
import ModelHealthCheckForm from '../components/tools/ModelHealthCheckForm'

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
