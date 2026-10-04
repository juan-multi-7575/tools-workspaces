import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Download,
  FileText,
  Loader2,
  Mic,
  PenLine,
  Play,
  SkipBack,
  Subtitles,
} from 'lucide-react'
import ToolPageShell from '../../components/tools/ToolPageShell'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import UniversalFileInput from '../../components/common/UniversalFileInput'
import { ToolForm } from '../../lib/toolForms'
import { api, errorMessage, resolveUrl } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import type { ToolPageProps } from '../../lib/toolPageTypes'

interface Cue {
  index: number
  start: number
  end: number
  text: string
}

interface LoadedText {
  path: string
  name: string
  content: string
}

interface ArtifactTextRecord {
  path: string
  content: string | null
  error: string | null
}

const TIMECODE = /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})|(\d{1,2}):(\d{2})[.,](\d{1,3})/

function toSeconds(stamp: string): number {
  const match = TIMECODE.exec(stamp)
  if (!match) return 0
  const hours = match[1] ? Number(match[1]) : 0
  const minutes = Number(match[2] ?? match[5] ?? 0)
  const seconds = Number(match[3] ?? match[6] ?? 0)
  const millis = Number((match[4] ?? match[7] ?? '0').padEnd(3, '0').slice(0, 3))
  return hours * 3600 + minutes * 60 + seconds + millis / 1000
}

function toTimecode(value: number): string {
  const safe = Math.max(0, value)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = Math.floor(safe % 60)
  const millis = Math.round((safe - Math.floor(safe)) * 1000)
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`
}

/** Parse the cues out of a real .srt / .vtt payload. Nothing is invented here. */
function parseCues(content: string): Cue[] {
  const cues: Cue[] = []
  const blocks = content.replace(/\r\n/g, '\n').split(/\n{2,}/)
  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim() !== '')
    if (lines.length === 0) continue
    const first = lines[0].trim()
    if (/^WEBVTT/i.test(first) || /^NOTE/i.test(first)) continue
    let arrowIndex = lines.findIndex((line) => line.includes('-->'))
    if (arrowIndex === -1) continue
    let start = 0
    let end = 0
    const [rawStart, rawRest] = lines[arrowIndex].split('-->')
    start = toSeconds(rawStart ?? '')
    const endToken = (rawRest ?? '').trim().split(/\s+/)[0] ?? ''
    end = toSeconds(endToken)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    const text = lines
      .slice(arrowIndex + 1)
      .join('\n')
      .trim()
    const numeric = Number(first)
    cues.push({ index: Number.isFinite(numeric) && arrowIndex > 0 ? numeric : cues.length + 1, start, end, text })
  }
  return cues
}

function buildSrt(cues: Cue[]): string {
  return cues
    .map((cue, position) => `${position + 1}\n${toTimecode(cue.start)} --> ${toTimecode(cue.end)}\n${cue.text}\n`)
    .join('\n')
}

function baseName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

function isCueFile(name: string): boolean {
  return /\.(srt|vtt)$/i.test(name)
}

export default function TranscriberPage({
  manifest,
  initialParams,
  initialInputPath,
  onComplete,
  onSendToTool,
}: ToolPageProps) {
  const execute = useToolExecute('transcriber')
  const [params, setParams] = useState<Record<string, unknown>>(() => ({
    ...initialParams,
    ...(initialInputPath ? { input_path: initialInputPath } : {}),
  }))
  const [texts, setTexts] = useState<Record<string, ArtifactTextRecord>>({})
  const [loadingPaths, setLoadingPaths] = useState<string[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [cues, setCues] = useState<Cue[]>([])
  const [selectedCue, setSelectedCue] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const inputPath = typeof params.input_path === 'string' ? params.input_path : ''
  const artifacts = useMemo(() => execute.state.result?.artifacts ?? [], [execute.state.result])

  const textArtifacts = useMemo(
    () => artifacts.filter((artifact) => /\.(srt|vtt|txt|md)$/i.test(artifact.name)),
    [artifacts],
  )

  const uncoveredSchema = useMemo(() => {
    const handled = new Set(['provider', 'model', 'output_mode', 'subtitle_style', 'task'])
    const out: Record<string, unknown> = {}
    for (const [key, spec] of Object.entries(manifest.parameters_schema ?? {})) {
      if (!handled.has(key)) out[key] = spec
    }
    return out
  }, [manifest])

  useEffect(() => {
    let active = true
    if (textArtifacts.length === 0) {
      setTexts({})
      setSelectedPath(null)
      setCues([])
      setLoadError(null)
      return
    }
    const first = textArtifacts[0]
    setLoadingPaths(textArtifacts.map((artifact) => artifact.path))
    setLoadError(null)
    Promise.all(
      textArtifacts.map(async (artifact): Promise<[string, ArtifactTextRecord]> => {
        try {
          const response = await api.getArtifactContent(artifact.path)
          return [artifact.path, { path: artifact.path, content: response.content, error: null }]
        } catch (err) {
          return [artifact.path, { path: artifact.path, content: null, error: errorMessage(err) || String(err) }]
        }
      }),
    )
      .then((entries) => {
        if (!active) return
        setTexts(Object.fromEntries(entries))
        setSelectedPath(first.path)
      })
      .catch((err) => {
        if (!active) return
        setLoadError(errorMessage(err) || String(err))
      })
      .finally(() => {
        if (active) setLoadingPaths([])
      })
    return () => {
      active = false
    }
  }, [textArtifacts])

  const loaded: LoadedText[] = useMemo(
    () =>
      Object.values(texts)
        .filter((record): record is ArtifactTextRecord & { content: string } => record.content !== null)
        .map((record) => ({ path: record.path, name: baseName(record.path), content: record.content })),
    [texts],
  )

  const selectedText = useMemo(
    () => loaded.find((entry) => entry.path === selectedPath) ?? loaded[0] ?? null,
    [loaded, selectedPath],
  )

  const activeCueFile = useMemo(
    () => (selectedText && isCueFile(selectedText.name) ? selectedText : null),
    [selectedText],
  )

  // Cue edits live on top of the real parsed cues; the raw payload is never overwritten.
  useEffect(() => {
    setCues(activeCueFile ? parseCues(activeCueFile.content) : [])
    setSelectedCue(null)
  }, [activeCueFile])

  const setParam = (key: string, value: unknown) => setParams((prev) => ({ ...prev, [key]: value }))

  const enumOptions = (key: string): string[] => {
    const spec = manifest.parameters_schema?.[key] as { enum?: unknown[] } | undefined
    return Array.isArray(spec?.enum) ? spec.enum.map((option) => String(option)) : []
  }

  const enumLabels = (key: string): Record<string, string> => {
    const spec = manifest.parameters_schema?.[key] as { enumLabels?: Record<string, string> } | undefined
    return spec?.enumLabels ?? {}
  }

  const specTitle = (key: string, fallback: string): string => {
    const spec = manifest.parameters_schema?.[key] as { title?: unknown } | undefined
    return typeof spec?.title === 'string' ? spec.title : fallback
  }

  const specDescription = (key: string): string => {
    const spec = manifest.parameters_schema?.[key] as { description?: unknown } | undefined
    return typeof spec?.description === 'string' ? spec.description : ''
  }

  const runTranscription = async () => {
    const result = await execute.run(params)
    if (result?.status === 'completed') onComplete?.(result, params)
  }

  const inputSrc = inputPath ? resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(inputPath)}`) : ''
  const downloadSrt = () => {
    if (!activeCueFile || cues.length === 0) return
    const blob = new Blob([buildSrt(cues)], { type: 'application/x-subrip' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${baseName(activeCueFile.path).replace(/\.(srt|vtt)$/i, '')}.edited.srt`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const selectCue = (cue: Cue) => {
    setSelectedCue(cue.index)
    const audio = document.querySelector('audio[data-transcriber-source]') as HTMLAudioElement | null
    if (audio) audio.currentTime = cue.start
  }

  const renderSelect = (key: string) => {
    const labels = enumLabels(key)
    return (
      <div key={key} data-param-key={key} className="space-y-1">
        <label htmlFor={`transcriber-${key}`} className="block text-xs font-bold text-[#171512]">
          {specTitle(key, key)}
        </label>
        <select
          id={`transcriber-${key}`}
          value={String(params[key] ?? '')}
          onChange={(event) => setParam(key, event.target.value)}
          disabled={execute.busy}
          className="w-full rounded-lg border border-[#C9C0AC] bg-[#FBF8F1] px-2.5 py-2 font-mono text-xs text-[#171512] focus:border-[#171512] focus:outline-none"
        >
          {enumOptions(key).map((option) => (
            <option key={option} value={option}>
              {labels[option] ?? option}
            </option>
          ))}
        </select>
        {specDescription(key) && <p className="text-xs leading-snug text-[#6B6255]">{specDescription(key)}</p>}
      </div>
    )
  }

  return (
    <ToolPageShell
      manifest={manifest}
      aside={
        <div className="space-y-3 rounded-2xl border border-[#C9C0AC] bg-[#FBF8F1] p-3.5 font-mono text-xs text-[#171512]">
          <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[#6B6255]">
            <Clock className="size-3.5" /> Measured run
          </h2>
          <dl className="space-y-1.5">
            <div className="flex items-center justify-between">
              <dt className="text-[#6B6255]">phase</dt>
              <dd className="font-bold">{execute.state.phase}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[#6B6255]">wall clock</dt>
              <dd className="font-bold">{execute.state.elapsedSeconds.toFixed(1)}s</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[#6B6255]">status</dt>
              <dd className="font-bold">{execute.state.result?.status ?? '—'}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[#6B6255]">artifacts</dt>
              <dd className="font-bold">{artifacts.length}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[#6B6255]">cues parsed</dt>
              <dd className="font-bold">{cues.length}</dd>
            </div>
          </dl>
          <p className="text-xs leading-snug text-[#6B6255]">
            The only live indicator is elapsed wall-clock time measured with <span className="text-[#171512]">Date.now()</span>{' '}
            around the real request. No percentage is invented.
          </p>
          <button
            type="button"
            onClick={() => void runTranscription()}
            disabled={execute.busy || !inputPath}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#171512] px-3 py-2 text-xs font-bold text-[#FBF8F1] hover:bg-[#3A342C] disabled:opacity-40"
          >
            {execute.busy ? <Loader2 className="size-3.5 animate-spin" /> : <Mic className="size-3.5" />}
            {execute.busy ? `Transcribing… ${execute.state.elapsedSeconds.toFixed(1)}s` : 'Transcribe'}
          </button>
          <button
            type="button"
            onClick={execute.reset}
            disabled={execute.busy}
            className="w-full rounded-lg border border-[#C9C0AC] px-3 py-2 text-xs font-bold text-[#171512] hover:bg-[#F1ECDF] disabled:opacity-40"
          >
            Clear results
          </button>
        </div>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* ── SOURCE COLUMN ──────────────────────────────────────────────────── */}
        <section className="space-y-3 rounded-2xl border border-[#C9C0AC] bg-[#FBF8F1] p-3.5">
          <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[#6B6255]">
            <Play className="size-3.5" /> Source
          </h2>
          <div data-param-key="input_path">
            <label htmlFor="transcriber-source" className="mb-1 block text-xs font-bold text-[#171512]">
              Input media path
            </label>
            <UniversalFileInput
              value={inputPath}
              onChange={(path) => setParam('input_path', path ?? '')}
              placeholder="/absolute/path/to/speech.wav"
              accept="audio/*,video/*"
            />
          </div>
          {inputSrc ? (
            <audio
              data-transcriber-source
              controls
              preload="metadata"
              src={inputSrc}
              className="w-full"
              aria-label="Selected source audio"
            />
          ) : (
            <p className="rounded-lg border border-dashed border-[#C9C0AC] px-2.5 py-2 text-xs text-[#6B6255]">
              Pick a file to get an inline player for the real source.
            </p>
          )}
          {renderSelect('provider')}
          <div data-param-key="model">
            <label htmlFor="transcriber-model" className="block text-xs font-bold text-[#171512]">
              {specTitle('model', 'Model Name')}
            </label>
            <input
              id="transcriber-model"
              type="text"
              value={String(params.model ?? '')}
              onChange={(event) => setParam('model', event.target.value)}
              disabled={execute.busy}
              placeholder={String(params.model ?? 'auto')}
              className="w-full rounded-lg border border-[#C9C0AC] bg-[#FBF8F1] px-2.5 py-2 font-mono text-xs text-[#171512] focus:border-[#171512] focus:outline-none"
            />
            {specDescription('model') && <p className="text-xs leading-snug text-[#6B6255]">{specDescription('model')}</p>}
          </div>
          {renderSelect('output_mode')}
          {renderSelect('subtitle_style')}
          {renderSelect('task')}

          {Object.keys(uncoveredSchema).length > 0 && (
            <ToolForm toolId={manifest.id} schema={uncoveredSchema} value={params} onChange={setParams} disabled={execute.busy} />
          )}
        </section>

        {/* ── TRANSCRIPT COLUMN ──────────────────────────────────────────────── */}
        <section className="space-y-3 rounded-2xl border border-[#C9C0AC] bg-[#FBF8F1] p-3.5">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[#6B6255]">
              <Subtitles className="size-3.5" /> Transcript
            </h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {loaded.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => setSelectedPath(entry.path)}
                  className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${
                    selectedText?.path === entry.path
                      ? 'border-[#171512] bg-[#171512] text-[#FBF8F1]'
                      : 'border-[#C9C0AC] text-[#3A342C] hover:border-[#171512]'
                  }`}
                >
                  {entry.name}
                </button>
              ))}
              <a
                href={selectedText ? resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(selectedText.path)}`) : '#'}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!selectedText}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${
                  selectedText ? 'border-[#C9C0AC] text-[#3A342C] hover:border-[#171512]' : 'pointer-events-none opacity-40'
                }`}
              >
                <Download className="size-3" /> Open
              </a>
              <button
                type="button"
                onClick={() => {
                  if (!selectedText) return
                  void navigator.clipboard?.writeText(selectedText.content)
                  setCopied(true)
                }}
                disabled={!selectedText}
                className="inline-flex items-center gap-1 rounded-full border border-[#C9C0AC] px-2.5 py-0.5 font-mono text-[11px] text-[#3A342C] hover:border-[#171512] disabled:opacity-40"
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </header>

          {execute.state.error && (
            <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-2.5">
              <p className="flex items-center gap-1.5 text-xs font-bold text-red-800">
                <AlertTriangle className="size-3.5" /> The backend reported:
              </p>
              <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs text-red-900">
                {execute.state.error}
              </pre>
            </div>
          )}
          {loadError && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-2.5 font-mono text-xs break-words text-amber-900">
              Artifact content could not be read: {loadError}
            </p>
          )}
          {loadingPaths.length > 0 && (
            <p className="flex items-center gap-1.5 font-mono text-xs text-[#6B6255]">
              <Loader2 className="size-3.5 animate-spin" /> Reading {loadingPaths.length} artifact file(s)…
            </p>
          )}

          {execute.state.result?.status === 'completed' && textArtifacts.length === 0 && (
            <p className="rounded-xl border border-[#C9C0AC] bg-[#F1ECDF] px-3 py-2.5 font-mono text-xs text-[#3A342C]">
              The run returned status <span className="font-bold">completed</span> but produced no .srt, .vtt or .txt
              artifact, so there is no transcript to show.
            </p>
          )}

          {Object.entries(texts)
            .filter(([, record]) => record.error)
            .map(([path, record]) => (
              <p key={path} className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 font-mono text-xs break-words text-red-900">
                {baseName(path)}: {record.error}
              </p>
            ))}

          {activeCueFile && cues.length > 0 && (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <h3 className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-[#6B6255]">
                  <FileText className="size-3" /> Cues ({cues.length})
                </h3>
                <ul className="max-h-[28rem] space-y-1 overflow-y-auto pr-1">
                  {cues.map((cue) => (
                    <li key={cue.index}>
                      <button
                        type="button"
                        onClick={() => selectCue(cue)}
                        className={`flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left ${
                          selectedCue === cue.index ? 'border-[#171512] bg-[#E6DFCD]' : 'border-[#DED6C4] hover:border-[#6B6255]'
                        }`}
                      >
                        <span className="mt-0.5 font-mono text-[10px] text-[#6B6255]">{cue.index}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-[10px] text-[#6B6255]">
                            {toTimecode(cue.start)} → {toTimecode(cue.end)}
                          </span>
                          <span className="block text-xs whitespace-pre-wrap text-[#171512]">{cue.text}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <h3 className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-[#6B6255]">
                  <PenLine className="size-3" /> Cue editor
                </h3>
                {selectedCue === null ? (
                  <p className="rounded-lg border border-dashed border-[#C9C0AC] px-2.5 py-3 font-mono text-xs text-[#6B6255]">
                    Pick a cue on the left to edit its timings and text. Changes stay in the browser until you export
                    them.
                  </p>
                ) : (
                  (() => {
                    const cue = cues.find((entry) => entry.index === selectedCue)
                    if (!cue) return null
                    return (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="font-mono text-[11px] text-[#6B6255]">
                            <span className="block">start (s)</span>
                            <input
                              type="number"
                              step="0.001"
                              min={0}
                              value={cue.start}
                              onChange={(event) =>
                                setCues((prev) =>
                                  prev.map((entry) =>
                                    entry.index === cue.index ? { ...entry, start: Number(event.target.value) } : entry,
                                  ),
                                )
                              }
                              className="w-full rounded border border-[#C9C0AC] bg-[#FBF8F1] px-2 py-1 text-xs text-[#171512]"
                            />
                          </label>
                          <label className="font-mono text-[11px] text-[#6B6255]">
                            <span className="block">end (s)</span>
                            <input
                              type="number"
                              step="0.001"
                              min={0}
                              value={cue.end}
                              onChange={(event) =>
                                setCues((prev) =>
                                  prev.map((entry) =>
                                    entry.index === cue.index ? { ...entry, end: Number(event.target.value) } : entry,
                                  ),
                                )
                              }
                              className="w-full rounded border border-[#C9C0AC] bg-[#FBF8F1] px-2 py-1 text-xs text-[#171512]"
                            />
                          </label>
                        </div>
                        <label className="block font-mono text-[11px] text-[#6B6255]">
                          <span className="block">text</span>
                          <textarea
                            rows={4}
                            value={cue.text}
                            onChange={(event) =>
                              setCues((prev) =>
                                prev.map((entry) =>
                                  entry.index === cue.index ? { ...entry, text: event.target.value } : entry,
                                ),
                              )
                            }
                            className="w-full rounded border border-[#C9C0AC] bg-[#FBF8F1] px-2 py-1 text-xs text-[#171512] focus:border-[#171512] focus:outline-none"
                          />
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={downloadSrt}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#171512] px-2.5 py-1.5 text-xs font-bold text-[#FBF8F1] hover:bg-[#3A342C]"
                          >
                            <Download className="size-3" /> Export edited .srt
                          </button>
                          <button
                            type="button"
                            onClick={() => setCues(parseCues(activeCueFile.content))}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#C9C0AC] px-2.5 py-1.5 text-xs text-[#171512] hover:bg-[#E6DFCD]"
                          >
                            <SkipBack className="size-3" /> Reset to file
                          </button>
                        </div>
                        <p className="font-mono text-[11px] leading-snug text-[#6B6255]">
                          {toTimecode(cue.start)} → {toTimecode(cue.end)} · {(cue.end - cue.start).toFixed(3)}s
                        </p>
                      </div>
                    )
                  })()
                )}
              </div>
            </div>
          )}

          {selectedText && !isCueFile(selectedText.name) && (
            <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl border border-[#C9C0AC] bg-[#F1ECDF] p-3 font-mono text-xs leading-relaxed text-[#171512]">
              {selectedText.content}
            </pre>
          )}

          {selectedText && isCueFile(selectedText.name) && cues.length === 0 && (
            <>
              <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 font-mono text-xs text-amber-900">
                No timestamped cues were parsed out of {selectedText.name}. The raw file is shown below verbatim.
              </p>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-[#C9C0AC] bg-[#F1ECDF] p-3 font-mono text-xs text-[#171512]">
                {selectedText.content}
              </pre>
            </>
          )}

          {!selectedText && execute.state.phase === 'idle' && (
            <p className="rounded-xl border border-dashed border-[#C9C0AC] px-3 py-4 font-mono text-xs text-[#6B6255]">
              Nothing to show yet. Run the transcriber and the real subtitle files it returns are fetched and rendered here.
            </p>
          )}

          {execute.state.phase !== 'idle' && (
            <div className="rounded-xl border border-[#DED6C4] bg-white p-3">
              <ToolResultPanel
                state={execute.state}
                toolId={manifest.id}
                toolName={manifest.name}
                onRerun={execute.reset}
                onSendToTool={onSendToTool}
              />
            </div>
          )}
        </section>
      </div>
    </ToolPageShell>
  )
}
