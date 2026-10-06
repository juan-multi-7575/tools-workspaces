import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { DownloaderHero, DownloaderParameterControls, DownloaderUrlProbe } from '../sites/downloader/DownloaderSite'
import type { ToolManifest } from '../lib/api'

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
