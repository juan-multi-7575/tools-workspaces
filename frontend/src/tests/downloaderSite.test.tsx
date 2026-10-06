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
const SITE_STYLES = readFileSync(new URL('../sites/downloader/downloader.css', import.meta.url), 'utf8')
const flowModule = await import('../sites/downloader/DownloaderSite')

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
  assert.match(SITE_SOURCE, /flowStep === 'review'[\s\S]*DownloaderReviewStage/, 'the metadata review is its own screen')
  assert.match(SITE_SOURCE, /Continue to output/, 'the review step has a deliberate continue action')
  assert.match(SITE_SOURCE, /flowStep === 'output'[\s\S]*DownloaderOutputStage/, 'output controls wait for the continue action')
  assert.match(SITE_SOURCE, /DownloaderOutputStage[\s\S]*dl-submit-bar/, 'the enqueue action appears only in the output step')
  assert.match(SITE_SOURCE, /What should the saved file contain\?/, 'probe results lead into a plain-language output intent')
})

test('downloader stage transitions move through inspect, review, output, and back without skipping identity review', () => {
  assert.equal(typeof flowModule.nextDownloaderFlowStep, 'function', 'the staged flow transition is explicit and testable')
  const next = flowModule.nextDownloaderFlowStep as (step: 'source' | 'review' | 'output', event: string) => string
  assert.equal(next('source', 'probe-succeeded'), 'review')
  assert.equal(next('review', 'continue'), 'output')
  assert.equal(next('review', 'edit-url'), 'source')
  assert.equal(next('output', 'back-to-review'), 'review')
  assert.equal(next('output', 'edit-url'), 'source')
  assert.deepEqual(flowModule.paramsAfterOutputMode({ download_mode: 'audio_only', extract_audio: true, format_preset: 'audio' }, 'video_audio'), {
    download_mode: 'video_audio', extract_audio: false, format_preset: 'best',
  })
  assert.deepEqual(flowModule.paramsAfterOutputMode({ download_mode: 'video_audio', extract_audio: false, format_preset: 'best' }, 'audio_only'), {
    download_mode: 'audio_only', extract_audio: true, format_preset: 'audio',
  })
  assert.match(SITE_SOURCE, /moveFlow\('probe-succeeded'\)/)
  assert.match(SITE_SOURCE, /moveFlow\('continue'\)/)
  assert.match(SITE_SOURCE, /moveFlow\('edit-url'\)/)
})

test('source, review, and output are separate screens with only their stage actions visible', () => {
  const Source = flowModule.DownloaderSourceStage as React.ComponentType<Record<string, unknown>> | undefined
  const Review = flowModule.DownloaderReviewStage as React.ComponentType<Record<string, unknown>> | undefined
  const Output = flowModule.DownloaderOutputStage as React.ComponentType<Record<string, unknown>> | undefined
  assert.ok(Source && Review && Output, 'each flow stage has its own renderable component')
  if (!Source || !Review || !Output) return
  const props = { url: 'https://media.example/item', schema: MANIFEST.parameters_schema, commonSchema: { format_preset: MANIFEST.parameters_schema.format_preset, merge_output_format: MANIFEST.parameters_schema.merge_output_format }, params: { url: 'https://media.example/item', download_mode: 'video_audio', format_preset: 'best', merge_output_format: 'mp4' }, onUrlChange: () => {}, onProbe: () => {}, probing: false, probeError: null, probe: { title: 'Returned title', author_name: 'Publisher', duration: 22, provider_name: 'Site' }, onEditUrl: () => {}, onContinue: () => {}, onBackToReview: () => {}, onParamsChange: () => {}, onEnqueue: () => {}, enqueuePending: false, advancedSearch: '', onAdvancedSearch: () => {} }
  const source = renderToStaticMarkup(<Source {...props}/>)
  const review = renderToStaticMarkup(<Review {...props}/>)
  const output = renderToStaticMarkup(<Output {...props}/>)
  assert.match(source, /Inspect media/)
  assert.match(source, /Paste a media link/)
  assert.doesNotMatch(source, /Returned title|Add to downloads|Advanced options/)
  assert.match(review, /Returned title/)
  assert.match(review, /Back to URL/)
  assert.match(review, /Continue to output/)
  assert.doesNotMatch(review, /Paste a media link|Advanced options|Add to downloads/)
  assert.match(output, /What should the saved file contain\?/)
  assert.match(output, /Advanced settings/)
  assert.match(output, /Add to downloads/)
  assert.doesNotMatch(output, /Paste a media link|Returned title/)
})

test('advanced downloader controls can be searched and remain purpose-grouped', () => {
  assert.equal(typeof flowModule.groupAdvancedSchema, 'function', 'advanced controls have a searchable grouping helper')
  const group = flowModule.groupAdvancedSchema as (schema: Record<string, unknown>, query: string) => Array<{ title: string; schema: Record<string, unknown> }>
  const groups = group(MANIFEST.parameters_schema, '')
  const groupedKeys = Object.keys(Object.assign({}, ...groups.map((item) => item.schema))).sort()
  const expectedAdvancedKeys = Object.keys(MANIFEST.parameters_schema).filter((key) => key !== 'url' && key !== 'download_mode').sort()
  assert.deepEqual(groupedKeys, expectedAdvancedKeys, 'every non-primary manifest field remains reachable in Advanced settings')
  assert.ok(groups.some((item) => item.title === 'Captions and metadata'))
  assert.ok(groups.some((item) => item.title === 'Playlist and batching'))
  assert.ok(groups.some((item) => item.title === 'Network and session'))
  const filtered = group(MANIFEST.parameters_schema, 'cookie')
  assert.ok(filtered.length > 0)
  assert.deepEqual(Object.keys(Object.assign({}, ...filtered.map((item) => item.schema))), ['cookies_from_browser', 'cookies_file'])
  const css = readFileSync(new URL('../sites/downloader/downloader.css', import.meta.url), 'utf8')
  assert.doesNotMatch(css, /font:\s*12px inherit/, 'advanced search uses a valid font declaration')
  assert.match(css, /\.dl-advanced-search input\s*\{[^}]*font-size:\s*12px/)
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
  assert.match(SITE_SOURCE, /disabled=\{!url\.trim\(\) \|\| enqueuePending\}/)
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
  assert.match(SITE_SOURCE, /Object\.fromEntries\(Object\.entries\(schema\)\.filter\(\(\[key\]\) => key !== 'url' && key !== 'download_mode' && !Object\.hasOwn\(commonSchema, key\)\)\)/)
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

test('shared manifest controls inherit the downloader palette instead of the legacy cream wells', () => {
  assert.match(SITE_STYLES, /--tool-accent:\s*var\(--dl-accent\)/)
  assert.match(SITE_STYLES, /\.dl-root \.tool-form\s*\{[^}]*--tool-well:\s*#f3f8f8/)
  assert.match(SITE_STYLES, /\.dl-root \.tool-form\s*\{[^}]*--tool-edge:\s*var\(--dl-line\)/)
  assert.doesNotMatch(SITE_STYLES, /--tool-well:\s*#F2EBD9/)
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
