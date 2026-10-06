import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import {
  createProbeWorkspaceEntry,
  DOWNLOADER_HELPERS,
  DownloaderHero,
  DownloaderHeroEntryPaths,
  DownloaderParameterControls,
  DownloaderUrlProbe,
  DownloaderTaskRow,
  paramsAfterEnqueue,
  paramsAfterAcceptedSource,
  taskIsStale,
  hydrateSubmittedParams,
  persistSubmittedParams,
  deleteSubmittedParams,
  shouldResetDraftAfterEnqueue,
} from '../sites/downloader/DownloaderSite'
import type { DownloadTask, ToolManifest } from '../lib/api'

const MANIFEST = JSON.parse(
  readFileSync(new URL('./fixtures/downloaderManifest.json', import.meta.url), 'utf8'),
) as ToolManifest
const SITE_SOURCE = readFileSync(new URL('../sites/downloader/DownloaderSite.tsx', import.meta.url), 'utf8')

test('the hero has two entry paths after probe and links home without platform chrome', () => {
  const hero = renderToStaticMarkup(<MemoryRouter><DownloaderHero manifest={MANIFEST}/></MemoryRouter>)
  const paths = renderToStaticMarkup(<MemoryRouter><DownloaderHeroEntryPaths hasProbe onEmpty={() => {}} onContinue={() => {}}/></MemoryRouter>)
  assert.match(hero, /Inspect a media URL/)
  assert.match(hero, />Probe</)
  assert.match(hero, /Open an empty workspace/)
  assert.match(hero, /href="\/"/)
  assert.doesNotMatch(hero, /Continue to workspace/)
  assert.equal((paths.match(/<button\b/g) ?? []).length, 2, 'a successful probe exposes the probe-and-continue path plus the empty-workspace path')
  assert.match(paths, /Continue to workspace with this item/)
  assert.match(paths, /Open an empty workspace/)
  assert.doesNotMatch(hero, /Tools Garage|Workspaces|ENGINE STATUS/)
})

test('a successful hero probe carries its exact URL and real result to the workspace', () => {
  const probe = { title: 'Real title', author_name: 'Real publisher', duration: 21, provider_name: 'Fixture' }
  assert.deepEqual(createProbeWorkspaceEntry('  https://media.example/item  ', probe), {
    url: 'https://media.example/item',
    probe,
  })
  assert.match(SITE_SOURCE, /state: createProbeWorkspaceEntry\(heroUrl, heroProbe\)/)
  assert.match(SITE_SOURCE, /const entry = \(location\.state \?\? \{\}\) as WorkspaceEntry/)
})

test('workspace retains probe facts and continues from the probed URL into options', () => {
  const html = renderToStaticMarkup(<MemoryRouter><DownloaderUrlProbe
    value="https://media.example/item" onChange={() => {}} onProbe={() => {}} onContinue={() => {}}
    error={null} result={{ title: 'Live result title', author_name: 'Publisher', duration: 34 }}
  /></MemoryRouter>)
  assert.match(html, /Live result title/)
  assert.match(html, /Publisher/)
  assert.match(html, /34 sec/)
  assert.match(html, /Continue with this item/)
  assert.match(SITE_SOURCE, /enqueueDownload\(submittedParams\)/, 'the options form is sent to the real queue API')
  assert.match(SITE_SOURCE, /probe && flowStep === 'review'/, 'the metadata review is its own step')
  assert.match(SITE_SOURCE, /Continue to output/, 'the review step has a deliberate continue action')
  assert.match(SITE_SOURCE, /probe && flowStep === 'output'/, 'output controls wait for the continue action')
  assert.match(SITE_SOURCE, /flowStep === 'output'[\s\S]*?dl-submit-bar/, 'the enqueue action appears only in the output step')
  assert.match(SITE_SOURCE, /What should the saved file contain\?/, 'probe results lead into a plain-language output intent')
})

test('starting a new draft uses defaults while accepted-source clearing retains output settings', () => {
  assert.deepEqual(paramsAfterEnqueue({
    url: { type: 'string' },
    download_mode: { type: 'string', default: 'video_audio' },
    format_preset: { type: 'string', default: 'best' },
    cookies_from_browser: { type: 'string', default: 'none' },
  }), { download_mode: 'video_audio', format_preset: 'best', cookies_from_browser: 'none' })
  assert.deepEqual(paramsAfterAcceptedSource({ url: 'https://example.com/one', format_preset: '720p', raw_args: '--no-mtime' }), {
    format_preset: '720p', raw_args: '--no-mtime',
  })
  assert.match(SITE_SOURCE, /setParams\(paramsAfterEnqueue\(schema\)\)/)
  assert.match(SITE_SOURCE, /enqueueGuard\.current/)
  assert.match(SITE_SOURCE, /enqueuePending/)
  assert.match(SITE_SOURCE, /disabled=\{!String\(params\.url \?\? ''\)\.trim\(\) \|\| enqueuePending\}/)
  assert.match(SITE_SOURCE, /const submittedRevision = draftRevision\.current/)
  assert.match(SITE_SOURCE, /if \(shouldResetDraftAfterEnqueue\(draftRevision\.current, submittedRevision\)\)/)
  assert.match(SITE_SOURCE, /persistSubmittedParams\(window\.sessionStorage/)
  assert.match(SITE_SOURCE, /clearAcceptedSource\(submittedParams\)/)
  assert.match(SITE_SOURCE, /changeParams = \(next[\s\S]*?draftRevision\.current \+= 1/)
  assert.match(SITE_SOURCE, /changeUrl = \(url[\s\S]*?draftRevision\.current \+= 1/)
})

test('submitted safe settings hydrate after reload while free-form and source values stay out of session storage', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
  const saved = persistSubmittedParams(storage, {}, 'download-4', {
    url: 'https://example.com/source', format_preset: '1080p', cookies_file: '/private/cookies.txt',
    raw_args: '--no-mtime', extractor_args: 'private-token', audio_quality: '320',
  })
  assert.deepEqual(saved['download-4'], { format_preset: '1080p', audio_quality: '320' })
  assert.deepEqual(hydrateSubmittedParams(storage), saved)
  assert.deepEqual(deleteSubmittedParams(storage, saved, 'download-4'), {})
  assert.equal(shouldResetDraftAfterEnqueue(7, 7), true)
  assert.equal(shouldResetDraftAfterEnqueue(8, 7), false, 'an edited draft must remain selected after the older request succeeds')
})

test('the guided flow binds one hand-built URL and all other manifest keys through ToolForm', () => {
  const url = Object.keys(MANIFEST.parameters_schema).find((key) => key === 'url')
  assert.ok(url, 'the backend manifest must declare url')
  const schema = MANIFEST.parameters_schema
  const mode = { download_mode: schema.download_mode }
  const common = { format_preset: schema.format_preset, merge_output_format: schema.merge_output_format }
  const advanced = Object.fromEntries(Object.entries(schema).filter(([key]) => !['url', 'download_mode', ...Object.keys(common)].includes(key)))
  const html = renderToStaticMarkup(<div className="dl-root">
    <DownloaderUrlProbe value="" onChange={() => {}} onProbe={() => {}} error={null} result={null}/>
    <DownloaderParameterControls schema={mode} value={{}} onChange={() => {}}/>
    <DownloaderParameterControls schema={common} value={{}} onChange={() => {}}/>
    <details><summary>Advanced options</summary><DownloaderParameterControls schema={advanced} value={{}} onChange={() => {}}/></details>
  </div>)
  assert.equal(Object.keys(MANIFEST.parameters_schema).length, 26)
  assert.equal(Object.keys(mode).length + Object.keys(common).length + Object.keys(advanced).length, 25)
  for (const key of Object.keys(MANIFEST.parameters_schema)) {
    assert.equal((html.match(new RegExp(`data-param-key="${key}"`, 'g')) ?? []).length, 1, `manifest key "${key}" should have one labelled control`)
  }
  assert.match(html, /Download Mode/i)
  assert.match(html, /Advanced options/)
  assert.match(SITE_SOURCE, /setView\('downloads'\)/, 'enqueue success transitions to its own task tracker')
  assert.match(SITE_SOURCE, /aria-label="Downloader sections"/)
  assert.match(SITE_SOURCE, /In progress/)
  assert.match(SITE_SOURCE, /Needs attention/)
  assert.match(SITE_SOURCE, /view === 'utilities'/)
  assert.match(SITE_SOURCE, /Object\.fromEntries\(Object\.entries\(schema\).*commonKeys/)
})

test('the hosted utility catalogue contains all four independent helper manifests', () => {
  assert.equal(DOWNLOADER_HELPERS.length, 4)
  assert.deepEqual(DOWNLOADER_HELPERS.map(([id]) => id), [
    'media.download.resolve',
    'media.download.format_select',
    'media.subtitle.fetch',
    'media.thumbnail.get',
  ])
  for (const [, title] of DOWNLOADER_HELPERS) assert.ok(SITE_SOURCE.includes(title))
  assert.match(SITE_SOURCE, /useToolExecute\(id\)/)
})

function renderTask(progress: Record<string, unknown>, status: DownloadTask['status'] = 'running') {
  const task: DownloadTask = { id: 'download-1', status, progress, params: { url: 'https://example.com/video' } }
  return renderToStaticMarkup(<DownloaderTaskRow task={task} onCancel={() => {}} onRemove={() => {}}/> )
}

test('download progress renders actual byte counts without deriving a percentage', () => {
  const html = renderTask({ downloaded_bytes: 1_572_864, total_bytes: 10_485_760 })
  assert.match(html, /1\.5 MiB \/ 10\.0 MiB/)
  assert.match(html, /class="dl-progress"[^>]*data-indeterminate="true"/)
  assert.match(html, /dl-progress__indeterminate/)
  assert.doesNotMatch(html, />15%<|width:15%/)
})

test('download progress renders downloaded bytes when total size is unknown', () => {
  const html = renderTask({ downloaded_bytes: 2048 }, 'running')
  assert.match(html, /2\.0 KiB \/ —/)
  assert.match(html, /data-indeterminate="true"/)
  assert.match(html, /dl-progress__indeterminate/)
})

test('completed downloads with unknown percentage omit the indeterminate progress track', () => {
  const html = renderTask({}, 'completed')
  assert.doesNotMatch(html, /role="progressbar"/)
  assert.doesNotMatch(html, /dl-progress__indeterminate|data-indeterminate/)
  assert.match(html, /No byte progress reported/)
})

test('download progress renders backend percentage when present, with supplied bytes', () => {
  const html = renderTask({ percent: 37, downloaded_bytes: 3_145_728, total_bytes: 8_388_608 })
  assert.match(html, /width:37%/)
  assert.match(html, />37%<\/span>/)
  assert.match(html, />3\.0 MiB \/ 8\.0 MiB<\/span>/)
})

test('completed artifacts are visibly marked stale when output settings differ', () => {
  const task: DownloadTask = {
    id: 'download-2', status: 'completed', progress: {}, params: { url: 'https://example.com/video', format_preset: '720p' },
    result: { artifacts: [{ name: 'video.mp4', path: '/tmp/video.mp4' }] },
  }
  const html = renderToStaticMarkup(<DownloaderTaskRow task={task} stale onCancel={() => {}} onRemove={() => {}}/> )
  assert.match(html, /Settings changed/)
  assert.match(html, /video\.mp4/)
  assert.match(html, /download="video\.mp4"/)
})

test('missing persisted task parameters do not falsely mark completed artifacts stale', () => {
  const task: DownloadTask = {
    id: 'download-3', status: 'completed', progress: {}, params: { url: 'https://example.com/video' },
    result: { artifacts: [{ name: 'video.mp4', path: '/tmp/video.mp4' }] },
  }
  assert.equal(taskIsStale(task, { url: task.params?.url, format_preset: 'best' }, MANIFEST.parameters_schema), false)
  assert.equal(taskIsStale(task, { url: 'https://example.com/another-item', format_preset: 'best' }, MANIFEST.parameters_schema), false)
  assert.equal(taskIsStale({ ...task, params: { ...task.params, format_preset: '720p' } }, { url: task.params?.url, format_preset: 'best' }, MANIFEST.parameters_schema), true)
  assert.equal(taskIsStale(task, { url: task.params?.url, raw_args: '--no-mtime' }, MANIFEST.parameters_schema, { ...task.params, raw_args: '--extract-audio' }), true)
  const submitted = { url: 'https://example.com/video', format_preset: '720p' }
  const taskWithOutput = { ...task, params: submitted }
  assert.equal(taskIsStale(taskWithOutput, paramsAfterAcceptedSource(submitted), MANIFEST.parameters_schema, submitted), false,
    'clearing the source after enqueue leaves output settings as the non-stale baseline')
  assert.match(SITE_SOURCE, /submittedParamsByTask\[task\.id\]/)
})
