import { useEffect, useMemo, useRef, useState } from 'react'
import WaveSurferReact from '@wavesurfer/react'
import type WaveSurfer from 'wavesurfer.js'
import {
  AlertTriangle,
  AudioWaveform,
  Download,
  Gauge,
  Layers,
  Loader2,
  Pause,
  Play,
  Radio,
  Sparkles,
} from 'lucide-react'
import ToolPageShell from '../../components/tools/ToolPageShell'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import UniversalFileInput from '../../components/common/UniversalFileInput'
import { ToolForm } from '../../lib/toolForms'
import { errorMessage, resolveUrl } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import DependencyGate from '../../components/deps/DependencyGate'
import { useToolDeps } from '../../hooks/useToolDeps'
import type { ToolPageProps } from '../../lib/toolPageTypes'
import type { AudioPlayerMedia } from '../../components/audio/AudioPlayerModal'

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00.00'
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${(seconds - minutes * 60).toFixed(2).padStart(5, '0')}`
}

function contentUrl(path: string): string {
  return resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(path)}`)
}

export default function AudioProcessorPage({
  manifest,
  initialParams,
  initialInputPath,
  onComplete,
  onOpenAudioPlayer,
}: ToolPageProps) {
  const execute = useToolExecute('audio_processor')
  const deps = useToolDeps('audio_processor')
  const [params, setParams] = useState<Record<string, unknown>>(() => ({
    ...initialParams,
    ...(initialInputPath ? { input_path: initialInputPath } : {}),
  }))
  const [waveError, setWaveError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const waveRef = useRef<WaveSurfer | null>(null)
  const handedOff = useRef<unknown>(null)

  const inputPath = typeof params.input_path === 'string' ? params.input_path : ''
  const result = execute.state.result
  const artifacts = useMemo(() => result?.artifacts ?? [], [result])

  // The waveform always decodes a real file: the produced artifact once the run
  // completed, otherwise the selected source. No peaks are synthesised.
  const waveSource = useMemo(() => {
    if (result?.status === 'completed' && artifacts[0]) {
      return { label: `${artifacts[0].name} (output)`, url: contentUrl(artifacts[0].path) }
    }
    if (inputPath) return { label: inputPath.split('/').filter(Boolean).pop() ?? inputPath, url: contentUrl(inputPath) }
    return null
  }, [result?.status, artifacts, inputPath])

  useEffect(() => {
    setWaveError(null)
    setReady(false)
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }, [waveSource?.url])

  // Hand the real output artifact to the app-level audio player exactly once per run.
  useEffect(() => {
    if (!onOpenAudioPlayer || !result || result.status !== 'completed' || artifacts.length === 0) return
    if (handedOff.current === result) return
    handedOff.current = result
    const artifact = artifacts[0]
    const media: AudioPlayerMedia = { name: artifact.name, path: artifact.path, url: contentUrl(artifact.path) }
    onOpenAudioPlayer(media)
  }, [result, artifacts, onOpenAudioPlayer])

  const uncoveredSchema = useMemo(() => {
    const handled = new Set(['format', 'sample_rate'])
    const out: Record<string, unknown> = {}
    for (const [key, spec] of Object.entries(manifest.parameters_schema ?? {})) {
      if (!handled.has(key)) out[key] = spec
    }
    return out
  }, [manifest])

  const enumValues = (key: string): (string | number)[] => {
    const spec = manifest.parameters_schema?.[key] as { enum?: unknown[] } | undefined
    return Array.isArray(spec?.enum) ? (spec.enum as (string | number)[]) : []
  }

  const setParam = (key: string, value: unknown) => setParams((prev) => ({ ...prev, [key]: value }))

  const runConversion = async () => {
    const result = await execute.run(params)
    if (result?.status === 'completed') onComplete?.(result, params)
  }

  const problems = inputPath ? [] : ['input_path is empty — the backend rejects the run without a source file.']

  return (
    <ToolPageShell
      manifest={manifest}
      gate={<DependencyGate toolId="audio_processor" state={deps} />}
      headerActions={
        <span className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-700 bg-fuchsia-950/60 px-3 py-1 font-mono text-xs text-fuchsia-200">
          <AudioWaveform className="size-3.5" />
          {waveSource ? (ready ? `${clock(duration)} decoded` : 'decoding…') : 'no source'}
        </span>
      }
    >
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-[#06080c] text-slate-200">
        {/* ── FULL-BLEED WAVEFORM ────────────────────────────────────────────── */}
        <div className="relative px-4 pt-4 pb-28 xl:pb-4 xl:pr-[21rem]">
          <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">
            <span className="flex items-center gap-1.5">
              <Radio className="size-3.5 text-fuchsia-400" /> Waveform workbench
            </span>
            <span className="truncate">{waveSource?.label ?? 'Pick an audio file to decode its real peaks'}</span>
          </div>

          <div className="mt-3">
            {waveSource ? (
              <WaveSurferReact
                key={waveSource.url}
                height={200}
                url={waveSource.url}
                waveColor="#334155"
                progressColor="#e879f9"
                cursorColor="#f8fafc"
                barWidth={2}
                barGap={1}
                onError={(_ws, error: Error) => setWaveError(error.message || String(error))}
                onReady={(ws: WaveSurfer) => {
                  waveRef.current = ws
                  setReady(true)
                  setDuration(ws.getDuration())
                  setWaveError(null)
                  ws.on('timeupdate', setCurrentTime)
                  ws.on('finish', () => setPlaying(false))
                }}
              />
            ) : (
              <div className="flex h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-800 font-mono text-xs text-slate-600">
                No media selected
              </div>
            )}
          </div>

          {waveError && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-700 bg-amber-950/40 px-2.5 py-1.5 font-mono text-xs break-words text-amber-200">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>The browser decoder reported: {waveError}</span>
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-xs text-slate-400">
            <button
              type="button"
              onClick={() => {
                const ws = waveRef.current
                if (!ws) return
                if (playing) {
                  ws.pause()
                  setPlaying(false)
                } else {
                  void ws.play()
                  setPlaying(true)
                }
              }}
              disabled={!ready}
              className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-500 px-3 py-1.5 font-bold text-[#06080c] hover:bg-fuchsia-400 disabled:opacity-40"
            >
              {playing ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}
              {playing ? 'Pause' : 'Play'}
            </button>
            <span>
              {clock(currentTime)} / {clock(duration)}
            </span>
            {ready && <span className="text-slate-600">duration read from the decoded file, not estimated</span>}
          </div>
        </div>

        {/* ── FLOATING CONTROL RAIL ──────────────────────────────────────────── */}
        <div className="absolute inset-x-4 bottom-4 z-10 space-y-3 rounded-2xl border border-slate-700 bg-slate-950/90 p-3 backdrop-blur xl:inset-y-4 xl:left-auto xl:right-4 xl:w-[19rem] xl:overflow-y-auto">
          <section className="space-y-1.5" data-param-key="input_path">
            <label htmlFor="audio-processor-source" className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
              <Layers className="size-3.5" /> Source
            </label>
            <UniversalFileInput
              value={inputPath}
              onChange={(path) => setParam('input_path', path ?? '')}
              placeholder="/absolute/path/to/audio.wav"
              accept="audio/*,video/*"
            />
          </section>

          {enumValues('format').length > 0 && (
            <section className="space-y-1.5" data-param-key="format">
              <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">format</span>
              <div className="flex flex-wrap gap-1.5">
                {enumValues('format').map((option) => (
                  <button
                    key={String(option)}
                    type="button"
                    disabled={execute.busy}
                    onClick={() => setParam('format', option)}
                    className={`rounded-full border px-2.5 py-1 font-mono text-xs uppercase ${
                      String(params.format) === String(option)
                        ? 'border-fuchsia-400 bg-fuchsia-500 text-[#06080c]'
                        : 'border-slate-700 text-slate-300 hover:border-fuchsia-400'
                    } disabled:opacity-40`}
                  >
                    {String(option)}
                  </button>
                ))}
              </div>
            </section>
          )}

          {enumValues('sample_rate').length > 0 && (
            <section className="space-y-1.5" data-param-key="sample_rate">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                <Gauge className="size-3.5" /> sample_rate
              </span>
              <div className="flex flex-wrap gap-1.5">
                {enumValues('sample_rate').map((option) => (
                  <button
                    key={String(option)}
                    type="button"
                    disabled={execute.busy}
                    onClick={() => setParam('sample_rate', option)}
                    className={`rounded-full border px-2.5 py-1 font-mono text-xs ${
                      String(params.sample_rate) === String(option)
                        ? 'border-fuchsia-400 bg-fuchsia-500 text-[#06080c]'
                        : 'border-slate-700 text-slate-300 hover:border-fuchsia-400'
                    } disabled:opacity-40`}
                  >
                    {String(option)} Hz
                    <span className="ml-1 opacity-60">{Number(option) / 1000}k</span>
                  </button>
                ))}
              </div>
              <p className="font-mono text-[11px] leading-snug text-slate-500">
                Sends sample_rate exactly as the manifest enum declares it. The backend additionally forces{' '}
                <span className="text-slate-300">-vn</span> (video stripped) and{' '}
                <span className="text-slate-300">-ac 2</span> (stereo).
              </p>
            </section>
          )}

          {Object.keys(uncoveredSchema).length > 0 && (
            <section className="space-y-1.5">
              <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                Other manifest parameters
              </span>
              <ToolForm
                toolId={manifest.id}
                schema={uncoveredSchema}
                value={params}
                onChange={setParams}
                disabled={execute.busy}
              />
            </section>
          )}

          {problems.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-amber-800 bg-amber-950/40 px-2.5 py-1.5">
              {problems.map((problem) => (
                <li key={problem} className="font-mono text-xs text-amber-200">
                  {problem}
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => void runConversion()}
            disabled={execute.busy || problems.length > 0 || !deps.ready}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-fuchsia-500 px-3 py-2.5 text-sm font-bold text-[#06080c] hover:bg-fuchsia-400 disabled:opacity-40"
          >
            {execute.busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {execute.busy ? `Converting… ${execute.state.elapsedSeconds.toFixed(1)}s` : 'Extract / convert with FFmpeg'}
          </button>

          {execute.state.phase !== 'idle' && (
            <div className="rounded-xl bg-white/95 p-2.5 text-slate-900">
              <ToolResultPanel
                state={execute.state}
                toolId={manifest.id}
                toolName={manifest.name}
                onRerun={execute.reset}
              />
            </div>
          )}

          {artifacts.length > 0 && (
            <section className="space-y-1.5">
              <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Produced</span>
              {artifacts.map((artifact) => (
                <div key={artifact.path} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 px-2 py-1">
                  <span className="truncate font-mono text-xs text-slate-200">{artifact.name}</span>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const media: AudioPlayerMedia = {
                          name: artifact.name,
                          path: artifact.path,
                          url: contentUrl(artifact.path),
                        }
                        onOpenAudioPlayer?.(media)
                      }}
                      className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[11px] text-slate-200 hover:border-fuchsia-400"
                    >
                      <Play className="size-3" />
                    </button>
                    <a
                      href={contentUrl(artifact.path)}
                      download={artifact.name}
                      className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[11px] text-slate-200 hover:border-fuchsia-400"
                    >
                      <Download className="size-3" />
                    </a>
                  </span>
                </div>
              ))}
            </section>
          )}

          {execute.state.error && (
            <p className="rounded-lg border border-rose-800 bg-rose-950/60 px-2.5 py-1.5 font-mono text-xs break-words text-rose-200">
              {errorMessage(execute.state.error) || execute.state.error}
            </p>
          )}
        </div>
      </div>
    </ToolPageShell>
  )
}
