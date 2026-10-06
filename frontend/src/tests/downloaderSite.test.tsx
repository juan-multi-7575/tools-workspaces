import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { DownloaderHero, DownloaderParameterControls, DownloaderUrlProbe, DownloaderTaskRow } from '../sites/downloader/DownloaderSite'
import type { DownloadTask, ToolManifest } from '../lib/api'

const MANIFEST = JSON.parse(
  readFileSync(new URL('./fixtures/downloaderManifest.json', import.meta.url), 'utf8'),
) as ToolManifest

test('the hero offers the workspace and a live URL probe without platform chrome', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter><DownloaderHero manifest={MANIFEST}/></MemoryRouter>,
  )
  assert.match(html, /Open downloader/)
  assert.match(html, />Probe</)
  assert.doesNotMatch(html, /Tools Garage|Workspaces|ENGINE STATUS/)
})

test('the downloader controls cover every live manifest key exactly through URL and ToolForm', () => {
  const url = Object.keys(MANIFEST.parameters_schema).find((key) => key === 'url')
  assert.ok(url, 'the backend manifest must declare url')
  const complement = Object.fromEntries(Object.entries(MANIFEST.parameters_schema).filter(([key]) => key !== url))
  const html = renderToStaticMarkup(
    <div className="dl-root">
      <DownloaderUrlProbe value="" onChange={() => {}} onProbe={() => {}} error={null} result={null}/>
      <DownloaderParameterControls schema={complement} value={{}} onChange={() => {}}/>
    </div>,
  )
  assert.equal(Object.keys(MANIFEST.parameters_schema).length, 26)
  assert.equal(Object.keys(complement).length, 25)
  for (const key of Object.keys(MANIFEST.parameters_schema)) {
    assert.ok(html.includes(`data-param-key="${key}"`), `manifest key "${key}" has no labelled control`)
  }
  assert.match(html, /Download Mode/i, 'the manifest-declared special download_mode control is rendered')
})

function renderTask(progress: Record<string, unknown>) {
  const task: DownloadTask = { id: 'download-1', status: 'running', progress, params: { url: 'https://example.com/video' } }
  return renderToStaticMarkup(<DownloaderTaskRow task={task} onCancel={() => {}} onRemove={() => {}}/>)
}

test('download progress renders actual byte counts without deriving a percentage', () => {
  const html = renderTask({ downloaded_bytes: 1_572_864, total_bytes: 10_485_760 })
  assert.match(html, /1\.5 MiB \/ 10\.0 MiB/)
  assert.match(html, /class="dl-progress"[^>]*data-indeterminate="true"/)
  assert.match(html, /dl-progress__indeterminate/)
  assert.doesNotMatch(html, />15%<|width:15%/)
})

test('download progress renders downloaded bytes when total size is unknown', () => {
  const html = renderTask({ downloaded_bytes: 2048 })
  assert.match(html, /2\.0 KiB \/ —/)
  assert.match(html, /class="dl-progress"[^>]*data-indeterminate="true"/)
  assert.match(html, /dl-progress__indeterminate/)
})

test('download progress renders backend percentage when present, with supplied bytes', () => {
  const html = renderTask({ percent: 37, downloaded_bytes: 3_145_728, total_bytes: 8_388_608 })
  assert.match(html, /width:37%/)
  assert.match(html, />37%<\/span>/)
  assert.match(html, />3\.0 MiB \/ 8\.0 MiB<\/span>/)
})
