import { useMemo, useState } from 'react'

export interface DownloadOptions {
  format_preset?: string
  extract_audio?: boolean
  audio_format?: string
  audio_quality?: string
  merge_output_format?: string
  writesubtitles?: boolean
  subtitleslangs?: string
  writeautomaticsub?: boolean
  playlist_items?: string
  limit_rate?: string
  output_template?: string
  raw_args?: string
}

type Field = {
  key: keyof DownloadOptions
  label: string
  group: string
  kind: 'select' | 'text' | 'bool' | 'textarea'
  options?: string[]
}

const FIELDS: Field[] = [
  { key: 'format_preset', label: 'Format preset', group: 'Format', kind: 'select', options: ['best', '1080p', '720p', '480p', 'audio', 'h264', 'vp9', 'av1'] },
  { key: 'extract_audio', label: 'Extract audio', group: 'Format', kind: 'bool' },
  { key: 'audio_format', label: 'Audio format', group: 'Format', kind: 'select', options: ['best', 'mp3', 'm4a', 'ogg', 'wav', 'flac'] },
  { key: 'audio_quality', label: 'Audio quality', group: 'Format', kind: 'select', options: ['best', '128', '192', '256', '320'] },
  { key: 'merge_output_format', label: 'Merge output format', group: 'Format', kind: 'select', options: ['mp4', 'mkv', 'webm', 'ogg'] },
  { key: 'writesubtitles', label: 'Write subtitles', group: 'Subtitles', kind: 'bool' },
  { key: 'subtitleslangs', label: 'Subtitle languages', group: 'Subtitles', kind: 'text' },
  { key: 'writeautomaticsub', label: 'Write auto-subtitles', group: 'Subtitles', kind: 'bool' },
  { key: 'playlist_items', label: 'Playlist items', group: 'Limits', kind: 'text' },
  { key: 'limit_rate', label: 'Rate limit', group: 'Limits', kind: 'text' },
  { key: 'output_template', label: 'Output template', group: 'Limits', kind: 'text' },
  { key: 'raw_args', label: 'Raw yt-dlp args', group: 'Advanced', kind: 'textarea' },
]

const PRESETS = ['best', 'audio', '1080p', '720p', '480p']

export default function DownloadOptionsForm({
  value,
  onChange,
}: {
  value: DownloadOptions
  onChange: (next: DownloadOptions) => void
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return FIELDS
    return FIELDS.filter((f) => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q))
  }, [search])

  const groups = useMemo(() => {
    const out: Record<string, Field[]> = {}
    for (const f of filtered) (out[f.group] ??= []).push(f)
    return out
  }, [filtered])

  const set = (key: keyof DownloadOptions, v: unknown) =>
    onChange({ ...value, [key]: v } as DownloadOptions)

  const clearField = (key: keyof DownloadOptions) => {
    const next = { ...value }
    delete next[key]
    onChange(next)
  }

  return (
    <div className="border-t border-garage-800 px-5 py-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="mb-3 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400"
      >
        <span>Options</span>
        <span className="text-cyan-400">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => set('format_preset', p)}
                className={
                  'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ' +
                  (value.format_preset === p
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-garage-800 text-slate-300 hover:bg-garage-700')
                }
              >
                {p}
              </button>
            ))}
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search options…"
            className="w-full rounded-lg border border-garage-800 bg-garage-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-port-in"
          />

          {Object.entries(groups).map(([group, fields]) => (
            <div key={group}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{group}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {fields.map((f) => (
                  <label key={f.key} className="text-xs text-slate-300">
                    <span className="mb-1 flex items-center justify-between">
                      <span className="font-medium text-slate-400">{f.label}</span>
                      {value[f.key] !== undefined && value[f.key] !== '' && (
                        <button
                          onClick={() => clearField(f.key)}
                          className="text-[10px] text-slate-500 hover:text-red-400"
                        >
                          clear
                        </button>
                      )}
                    </span>
                    {f.kind === 'select' ? (
                      <select
                        value={String(value[f.key] ?? '')}
                        onChange={(e) => set(f.key, e.target.value || undefined)}
                        className="w-full rounded-lg border border-garage-800 bg-garage-950 px-3 py-2 text-slate-100 outline-none focus:border-port-in"
                      >
                        <option value="">default</option>
                        {f.options!.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : f.kind === 'bool' ? (
                      <input
                        type="checkbox"
                        checked={Boolean(value[f.key])}
                        onChange={(e) => set(f.key, e.target.checked || undefined)}
                        className="h-4 w-4 accent-cyan-500"
                      />
                    ) : f.kind === 'textarea' ? (
                      <textarea
                        value={String(value[f.key] ?? '')}
                        onChange={(e) => set(f.key, e.target.value || undefined)}
                        rows={2}
                        placeholder="--no-mtime --embed-thumbnail"
                        className="w-full rounded-lg border border-garage-800 bg-garage-950 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-port-in"
                      />
                    ) : (
                      <input
                        type="text"
                        value={String(value[f.key] ?? '')}
                        onChange={(e) => set(f.key, e.target.value || undefined)}
                        className="w-full rounded-lg border border-garage-800 bg-garage-950 px-3 py-2 text-slate-100 outline-none focus:border-port-in"
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function cleanOptions(o: DownloadOptions): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === '' || v === false) continue
    out[k] = v
  }
  return out
}
