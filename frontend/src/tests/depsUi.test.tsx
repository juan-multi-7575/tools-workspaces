import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  depEventReducer,
  deriveDepByteProgress,
  deriveDepProgress,
  EMPTY_PROGRESS,
  type UseToolDeps,
} from '../hooks/useToolDeps'
import { formatBytes, type DepEntry, type DepEvent } from '../lib/depsApi'
import DependencyGate from '../components/deps/DependencyGate'
import DependencyManagerPanel from '../components/deps/DependencyManagerPanel'
import ToolPageShell from '../components/tools/ToolPageShell'
import type { ToolManifest } from '../lib/api'

const SHELL_MANIFEST: ToolManifest = {
  id: 'demo.tool',
  name: 'Demo Tool',
  description: 'A tool used to prove where the gate is hosted.',
  category: 'Testing',
  tags: [],
  input_kinds: ['any'],
  output_kinds: ['json'],
  parameters_schema: {},
}

function entry(overrides: Partial<DepEntry> & { dep_id: string }): DepEntry {
  return {
    kind: 'conda',
    status: 'missing',
    version: null,
    approx_bytes: 1000,
    measured_bytes: null,
    provides: [],
    paths: {},
    missing_commands: [],
    prefix: null,
    installed_at: null,
    heavy: false,
    notes: null,
    reason: null,
    packages: [],
    dependents: [],
    ...overrides,
  }
}

function state(overrides: Partial<UseToolDeps> = {}): UseToolDeps {
  return {
    status: 'missing',
    ready: false,
    data: null,
    missingBytes: 0,
    events: [],
    error: null,
    install: () => {},
    cancel: () => {},
    reload: () => {},
    ...overrides,
  }
}

// ── the pure SSE reducer ──────────────────────────────────────────────────────

test('a started frame resets the job and records its dep order', () => {
  const next = depEventReducer(EMPTY_PROGRESS, {
    type: 'started',
    job_id: 'depinstall-abc',
    dep_ids: ['conda.media', 'conda.ytdlp'],
  })
  assert.equal(next.jobId, 'depinstall-abc')
  assert.deepEqual(next.order, ['conda.media', 'conda.ytdlp'])
  assert.equal(next.status, null)
  assert.equal(next.error, null)
})

test('a per-dep done frame never claims the job succeeded', () => {
  let next = depEventReducer(EMPTY_PROGRESS, { type: 'started', job_id: 'j1', dep_ids: ['conda.sox'] })
  next = depEventReducer(next, { type: 'done', dep_id: 'conda.sox', message: 'installed' })
  assert.deepEqual(next.done, ['conda.sox'])
  // This is the whole point: success only ever arrives on the terminal frame.
  assert.equal(next.status, null)
  assert.equal(next.error, null)
})

test('stages are recorded per dep with the backend message kept verbatim', () => {
  let next = depEventReducer(EMPTY_PROGRESS, { type: 'started', job_id: 'j1', dep_ids: ['pip.demucs'] })
  next = depEventReducer(next, { type: 'downloading', dep_id: 'pip.demucs', message: 'Collecting torch==2.4.0' })
  assert.equal(next.stageByDep['pip.demucs'], 'downloading')
  assert.equal(next.messageByDep['pip.demucs'], 'Collecting torch==2.4.0')
})

test('a failed frame surfaces the backend message unchanged and names the dep', () => {
  let next = depEventReducer(EMPTY_PROGRESS, { type: 'started', job_id: 'j1', dep_ids: ['conda.ocrmypdf'] })
  next = depEventReducer(next, {
    type: 'failed',
    dep_id: 'conda.ocrmypdf',
    message: 'micromamba exited with 1: PackagesNotFoundError',
  })
  assert.equal(next.failedDepId, 'conda.ocrmypdf')
  assert.equal(next.error, 'micromamba exited with 1: PackagesNotFoundError')
})

test('the terminal frame wins over a noisy last progress line when reporting failure', () => {
  let next = depEventReducer(EMPTY_PROGRESS, { type: 'started', job_id: 'j1', dep_ids: ['conda.media'] })
  next = depEventReducer(next, { type: 'installing', dep_id: 'conda.media', message: 'some unrelated subprocess line' })
  next = depEventReducer(next, {
    type: 'finished',
    status: 'failed',
    job_id: 'j1',
    result: {
      ok: false,
      failures: [{ dep_id: 'conda.media', error: 'install finished but ffmpeg still not found', code: 'DEPENDENCY_VERIFY_FAILED' }],
    },
  })
  assert.equal(next.status, 'failed')
  assert.equal(next.error, 'install finished but ffmpeg still not found')
})

test('only a completed terminal frame sets completed status', () => {
  const next = depEventReducer(EMPTY_PROGRESS, {
    type: 'finished',
    status: 'completed',
    job_id: 'j1',
    result: { ok: true },
  })
  assert.equal(next.status, 'completed')
  assert.equal(next.error, null)
  assert.equal(next.finished?.status, 'completed')
})

test('a cancelled terminal frame is not an error and not a success', () => {
  let next = depEventReducer(EMPTY_PROGRESS, { type: 'started', job_id: 'j1', dep_ids: ['conda.media'] })
  next = depEventReducer(next, { type: 'cancelled', dep_id: 'conda.media', message: 'cancelled' })
  next = depEventReducer(next, { type: 'finished', status: 'cancelled', job_id: 'j1', result: { cancelled: true } })
  assert.equal(next.status, 'cancelled')
  assert.equal(next.error, null)
  assert.equal(next.cancelledDepId, 'conda.media')
})

test('unknown frames and events without a dep_id are ignored rather than guessed at', () => {
  const withStage = depEventReducer(EMPTY_PROGRESS, { type: 'started', job_id: 'j1', dep_ids: ['conda.sox'] })
  assert.equal(depEventReducer(withStage, { type: 'heartbeat' }), withStage)
  assert.equal(depEventReducer(withStage, { type: 'installing' }), withStage)
  assert.equal(depEventReducer(withStage, { type: 'made_up_stage', dep_id: 'conda.sox' }), withStage)
})

test('deriveDepProgress replays a whole stream to the same state as a fold', () => {
  const events: DepEvent[] = [
    { type: 'started', job_id: 'j9', dep_ids: ['conda.media'] },
    { type: 'resolving', dep_id: 'conda.media', message: 'notes' },
    { type: 'installing', dep_id: 'conda.media', message: 'micromamba create ffmpeg' },
    { type: 'done', dep_id: 'conda.media', message: 'installed' },
    { type: 'finished', status: 'completed', job_id: 'j9', result: { ok: true } },
  ]
  assert.deepEqual(deriveDepProgress(events), events.reduce(depEventReducer, EMPTY_PROGRESS))
})

test('byte progress counts a dep only once it is done, and never invents a ratio', () => {
  const deps = [
    entry({ dep_id: 'conda.media', approx_bytes: 660_000_000 }),
    entry({ dep_id: 'conda.ytdlp', approx_bytes: 25_000_000 }),
  ]
  const events: DepEvent[] = [
    { type: 'started', job_id: 'j1', dep_ids: ['conda.media', 'conda.ytdlp'] },
    { type: 'done', dep_id: 'conda.media' },
    { type: 'downloading', dep_id: 'conda.ytdlp' },
  ]
  const progress = deriveDepByteProgress(deriveDepProgress(events), deps)
  assert.equal(progress.totalBytes, 685_000_000)
  assert.equal(progress.completedBytes, 660_000_000)
  assert.equal(progress.activeDepId, 'conda.ytdlp')
  assert.ok(Math.abs((progress.ratio ?? 0) - 660 / 685) < 1e-9)

  // No dep in the job has a reported size: no ratio at all, rather than 0%.
  const sizeless = deriveDepByteProgress(deriveDepProgress(events), [
    entry({ dep_id: 'conda.media', approx_bytes: null }),
    entry({ dep_id: 'conda.ytdlp', approx_bytes: null }),
  ])
  assert.equal(sizeless.ratio, null)
})

test('formatBytes reports unknown rather than zero for absent sizes', () => {
  assert.equal(formatBytes(null), 'unknown')
  assert.equal(formatBytes(undefined), 'unknown')
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(660_000_000), '660 MB')
})

// ── the gate, rendered ─────────────────────────────────────────────────────────

const MEDIA = entry({
  dep_id: 'conda.media',
  kind: 'conda',
  approx_bytes: 660_000_000,
  provides: ['ffmpeg', 'ffprobe'],
  missing_commands: ['ffmpeg'],
  notes: 'ffmpeg/ffprobe decode, trim, convert and probe every media file.',
  reason: 'prefix does not exist',
})
const YTDLP = entry({
  dep_id: 'conda.ytdlp',
  kind: 'conda',
  approx_bytes: 25_000_000,
  provides: ['yt-dlp'],
  notes: 'yt-dlp fetches video and audio from a URL.',
})
const DEMUCS = entry({
  dep_id: 'pip.demucs',
  kind: 'pip',
  approx_bytes: 2_500_000_000,
  heavy: true,
  provides: ['demucs'],
  notes: 'demucs separates vocals from music.',
})

function toolState(entries: DepEntry[], overrides: Partial<UseToolDeps> = {}): UseToolDeps {
  const missing = entries.map((item) => item.dep_id)
  return state({
    data: { tool_id: 'trimmer', ready: missing.length === 0, missing, deps: entries, environ: {} },
    missingBytes: entries.reduce((sum, item) => sum + (item.approx_bytes ?? 0), 0),
    ...overrides,
  })
}

test('the gate reports a tool with no external dependencies honestly', () => {
  const html = renderToStaticMarkup(
    <DependencyGate toolId="packager" state={state({ status: 'ready', ready: true, data: { tool_id: 'packager', ready: true, missing: [], deps: [], environ: {} } })} />,
  )
  assert.match(html, /No external dependencies/)
  assert.match(html, /data-dep-state="ready"/)
})

test('the ready chip lists the real dep ids and probed versions', () => {
  const installed = entry({ dep_id: 'conda.sox', status: 'installed', version: '14.4.2', provides: ['sox'] })
  const html = renderToStaticMarkup(
    <DependencyGate toolId="sox" state={state({ status: 'ready', ready: true, data: { tool_id: 'sox', ready: true, missing: [], deps: [installed], environ: {} } })} />,
  )
  assert.match(html, /conda\.sox/)
  assert.match(html, /14\.4\.2/)
  assert.doesNotMatch(html, /Install/)
})

test('the missing panel names each dep, its plain-language purpose, its real size and the install control', () => {
  const html = renderToStaticMarkup(<DependencyGate toolId="trimmer" state={toolState([MEDIA, YTDLP])} />)
  assert.match(html, /data-dep-state="missing"/)
  assert.match(html, /conda\.media/)
  assert.match(html, /conda\.ytdlp/)
  // Sizes come from the API payload, formatted through the shared formatter.
  assert.match(html, /about 660 MB/)
  assert.match(html, /about 25\.0 MB/)
  assert.match(html, /about 685 MB to download/)
  // Plain-language purpose is the backend's own note.
  assert.match(html, /ffmpeg\/ffprobe decode, trim, convert and probe every media file\./)
  assert.match(html, /Still not found on disk:.*ffmpeg/s)
  assert.match(html, /prefix does not exist/)
  assert.match(html, /Install 2 dependencies/)
  assert.match(html, /Run is disabled/)
})

test('a heavy dep is never one careless click: the control asks for confirmation first', () => {
  const html = renderToStaticMarkup(<DependencyGate toolId="demucs" state={toolState([DEMUCS])} />)
  assert.match(html, /Large download/)
  assert.match(html, /Confirm 2\.50 GB download/)
  assert.doesNotMatch(html, />Install 1 dependency</)
})

test('a failed install shows the backend message verbatim next to a retry', () => {
  // The shape a real failure takes: a `failed` progress frame, then the
  // terminal `finished` frame carrying the authoritative result error.
  const message = 'install finished but ocrmypdf still not found in /envs/conda.ocrmypdf'
  const events: DepEvent[] = [
    { type: 'started', job_id: 'depinstall-5', dep_ids: ['conda.ocrmypdf'] },
    { type: 'resolving', dep_id: 'conda.ocrmypdf', message: 'ocrmypdf adds an OCR text layer.' },
    { type: 'failed', dep_id: 'conda.ocrmypdf', message },
    {
      type: 'finished',
      status: 'failed',
      job_id: 'depinstall-5',
      result: { ok: false, failures: [{ dep_id: 'conda.ocrmypdf', error: message, code: 'DEPENDENCY_VERIFY_FAILED' }] },
    },
  ]
  const html = renderToStaticMarkup(
    <DependencyGate
      toolId="ocrmypdf"
      state={toolState([entry({ dep_id: 'conda.ocrmypdf', provides: ['ocrmypdf'], notes: 'ocrmypdf adds a text layer.' })], {
        events,
        error: message,
      })}
    />,
  )
  assert.match(html, /Install failed for conda\.ocrmypdf/)
  assert.ok(html.includes(message), 'backend failure text must be rendered verbatim')
  assert.match(html, /Try install again/)
  assert.doesNotMatch(html, />Ready/)
})

test('while installing the gate shows real stages, real bytes and a working cancel', () => {
  const events: DepEvent[] = [
    { type: 'started', job_id: 'depinstall-77', dep_ids: ['conda.media', 'conda.ytdlp'] },
    { type: 'done', dep_id: 'conda.media', message: 'installed' },
    { type: 'downloading', dep_id: 'conda.ytdlp', message: 'Collecting yt-dlp' },
  ]
  const html = renderToStaticMarkup(
    <DependencyGate toolId="trimmer" state={toolState([MEDIA, YTDLP], { status: 'installing', events })} />,
  )
  assert.match(html, /data-dep-state="installing"/)
  assert.match(html, /Installing dependencies/)
  assert.match(html, /Downloading/)
  assert.match(html, /Done/)
  assert.match(html, /660 MB of 685 MB installed/)
  assert.match(html, /Collecting yt-dlp/)
  assert.match(html, /Cancel install/)
  // Nothing is claimed ready before the backend re-checks.
  assert.doesNotMatch(html, /Ready/)
})

test('a failed dependency check is reported and offers a retry', () => {
  const html = renderToStaticMarkup(
    <DependencyGate toolId="pandoc" state={state({ status: 'error', error: 'Failed to fetch' })} />,
  )
  assert.match(html, /Could not check dependencies/)
  assert.match(html, /Failed to fetch/)
  assert.match(html, /Retry the check/)
})

test('the checking state is announced rather than silently blank', () => {
  const html = renderToStaticMarkup(<DependencyGate toolId="pandoc" state={state({ status: 'checking' })} />)
  assert.match(html, /Checking what this tool needs/)
})

// ── every tool page is actually wired ─────────────────────────────────────────

test('every tool page calls useToolDeps, renders the gate, and ORs readiness into Run', async () => {
  const dir = new URL('../pages/tools/', import.meta.url)
  const files = (await readdir(dir)).filter((name) => name.endsWith('.tsx')).sort()
  assert.ok(files.length >= 22, `expected at least 22 tool pages, found ${files.length}`)

  const missing: string[] = []
  for (const file of files) {
    const source = await readFile(new URL(file, dir), 'utf8')
    const hasHook = /const deps = useToolDeps\(/.test(source)
    const hasGate = /<DependencyGate\b/.test(source)
    // `||` must be the operator: `busy || !input && !ready` would leave Run enabled.
    const gatesRun = /disabled=\{[^}]*\|\|\s*!deps\.ready\}/.test(source)
    if (!hasHook || !hasGate || !gatesRun) {
      missing.push(`${file} (hook:${hasHook} gate:${hasGate} disablesRun:${gatesRun})`)
    }
  }
  assert.deepEqual(missing, [], `tool pages not wired to the dependency gate:\n${missing.join('\n')}`)
})

test('every tool page pins the gate in the shell instead of burying it in a rail', async () => {
  const dir = new URL('../pages/tools/', import.meta.url)
  const files = (await readdir(dir)).filter((name) => name.endsWith('.tsx')).sort()
  const unpinned: string[] = []
  for (const file of files) {
    const source = await readFile(new URL(file, dir), 'utf8')
    // The install control is the reason the gate exists, so a page that renders it
    // inline puts it wherever the page happens to be tall. It belongs in a pinned
    // region: the shell's `gate` slot, or the downloader's own dark one.
    const pinned = /gate=\{<DependencyGate\b/.test(source) || /data-tool-gate-region/.test(source)
    // One gate per page: two means a second `useToolDeps` subscription and a
    // second copy of the same consent panel on screen.
    const copies = (source.match(/<DependencyGate\b/g) ?? []).length
    if (!pinned || copies !== 1) unpinned.push(`${file} (pinned:${pinned} gates:${copies})`)
  }
  assert.deepEqual(unpinned, [], `tool pages whose gate is not pinned exactly once:\n${unpinned.join('\n')}`)
})

test('the shell hosts the gate in a sticky region, not in the trailing aside', () => {
  const html = renderToStaticMarkup(
    <ToolPageShell manifest={SHELL_MANIFEST} gate={<p>preflight</p>}>
      <p>body</p>
    </ToolPageShell>,
  )
  const region = html.match(/<div data-tool-gate-region="demo\.tool"[^>]*>/)
  assert.ok(region, 'the shell rendered no sticky gate region')
  assert.match(region[0], /sticky bottom-0/, 'the gate region is not pinned to the viewport')
  assert.ok(
    html.indexOf('preflight') > html.indexOf('data-tool-gate-region'),
    'the gate is not inside the region it was handed to',
  )
})

test('the manager console renders its own identity and re-probe control', () => {
  const html = renderToStaticMarkup(<DependencyManagerPanel />)
  assert.match(html, /Managed dependencies/)
  assert.match(html, /Re-probe/)
  // Not a tool page: it carries no tool Run action and claims no inventory yet.
  assert.doesNotMatch(html, /data-dep-gate/)
})
