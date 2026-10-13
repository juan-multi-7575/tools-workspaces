import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Search, Video, Music, Film, Sparkles, X } from 'lucide-react'

export interface DownloadOptions {
  download_mode?: 'video_audio' | 'audio_only' | 'video_only'
  format_preset?: string
  format?: string
  extract_audio?: boolean
  audio_format?: string
  audio_quality?: string
  keep_video?: boolean
  merge_output_format?: string
  writesubtitles?: boolean
  writeautomaticsub?: boolean
  subtitleslangs?: string
  embed_subs?: boolean
  embed_thumbnail?: boolean
  write_thumbnail?: boolean
  embed_metadata?: boolean
  embed_chapters?: boolean
  playlist_items?: string
  no_playlist?: boolean
  max_downloads?: string | number
  limit_rate?: string
  concurrent_fragments?: string | number
  retries?: string | number
  socket_timeout?: string | number
  output_template?: string
  restrict_filenames?: boolean
  windows_filenames?: boolean
  force_overwrites?: boolean
  cookies_from_browser?: string
  cookies_file?: string
  extractor_args?: string
  raw_args?: string
}

type Field = {
  key: keyof DownloadOptions
  label: string
  group: string
  kind: 'select' | 'text' | 'bool' | 'textarea'
  options?: { value: string; label: string }[]
  placeholder?: string
}

const FIELDS: Field[] = [
  // Anti-403 & Cookies
  {
    key: 'cookies_from_browser',
    label: 'Browser Cookies (Anti-403)',
    group: 'Anti-403 & Cookies',
    kind: 'select',
    options: [
      { value: 'chrome', label: 'Google Chrome' },
      { value: 'firefox', label: 'Mozilla Firefox' },
      { value: 'edge', label: 'Microsoft Edge' },
      { value: 'brave', label: 'Brave Browser' },
      { value: 'safari', label: 'Apple Safari' },
      { value: 'opera', label: 'Opera Browser' },
    ],
  },
  {
    key: 'extractor_args',
    label: 'Player Client Presets',
    group: 'Anti-403 & Cookies',
    kind: 'select',
    options: [
      { value: 'youtube:player_client=ios,web', label: 'iOS + Web' },
      { value: 'youtube:player_client=mweb', label: 'Mobile Web (mweb)' },
      { value: 'youtube:player_client=tv', label: 'TV Embedded Client (tv)' },
      { value: 'youtube:player_client=android', label: 'Android' },
    ],
  },
  {
    key: 'cookies_file',
    label: 'Cookies File Path',
    group: 'Anti-403 & Cookies',
    kind: 'text',
    placeholder: '/path/to/cookies.txt',
  },
  // Format & Video
  {
    key: 'format_preset',
    label: 'Resolution Preset',
    group: 'Video & Format',
    kind: 'select',
    options: [
      { value: 'best', label: 'Best Available (Default)' },
      { value: '4k', label: '4K Ultra HD (2160p)' },
      { value: '1440p', label: '2K Quad HD (1440p)' },
      { value: '1080p', label: 'Full HD (1080p)' },
      { value: '720p', label: 'HD (720p)' },
      { value: '480p', label: 'SD (480p)' },
      { value: '360p', label: 'Low Res (360p)' },
      { value: 'h264', label: 'H.264 / MP4 (Max Compatibility)' },
      { value: 'vp9', label: 'VP9' },
      { value: 'av1', label: 'AV1' },
    ],
  },
  {
    key: 'merge_output_format',
    label: 'Container Format',
    group: 'Video & Format',
    kind: 'select',
    options: [
      { value: 'mp4', label: 'MP4 (Universal)' },
      { value: 'mkv', label: 'MKV (Matroska)' },
      { value: 'webm', label: 'WebM' },
      { value: 'ogg', label: 'OGG' },
    ],
  },
  // Audio Extraction
  {
    key: 'audio_format',
    label: 'Audio Format',
    group: 'Audio Extraction',
    kind: 'select',
    options: [
      { value: 'best', label: 'Best Native Audio' },
      { value: 'mp3', label: 'MP3 (Most Compatible)' },
      { value: 'm4a', label: 'M4A / AAC' },
      { value: 'flac', label: 'FLAC (Lossless Studio)' },
      { value: 'wav', label: 'WAV (Uncompressed PCM)' },
      { value: 'opus', label: 'Opus (High Efficiency)' },
      { value: 'ogg', label: 'OGG Vorbis' },
      { value: 'aac', label: 'AAC' },
    ],
  },
  {
    key: 'audio_quality',
    label: 'Audio Bitrate / Quality',
    group: 'Audio Extraction',
    kind: 'select',
    options: [
      { value: 'best', label: 'Best (VBR 0 / High Bitrate)' },
      { value: '320', label: '320 kbps (Studio Quality)' },
      { value: '256', label: '256 kbps (Very High)' },
      { value: '192', label: '192 kbps (Standard High)' },
      { value: '128', label: '128 kbps (Standard)' },
      { value: '96', label: '96 kbps (Voice / Small Size)' },
    ],
  },
  { key: 'keep_video', label: 'Keep Original Video', group: 'Audio Extraction', kind: 'bool' },
  // Subtitles & Metadata
  { key: 'writesubtitles', label: 'Download Subtitles', group: 'Subtitles & Metadata', kind: 'bool' },
  { key: 'writeautomaticsub', label: 'Download Auto Captions', group: 'Subtitles & Metadata', kind: 'bool' },
  { key: 'subtitleslangs', label: 'Subtitle Languages (e.g. en,es,all)', group: 'Subtitles & Metadata', kind: 'text', placeholder: 'en,es,ja,all' },
  { key: 'embed_subs', label: 'Embed Subtitles into Video', group: 'Subtitles & Metadata', kind: 'bool' },
  { key: 'embed_thumbnail', label: 'Embed Thumbnail Cover Art', group: 'Subtitles & Metadata', kind: 'bool' },
  { key: 'embed_metadata', label: 'Embed Metadata & Chapters', group: 'Subtitles & Metadata', kind: 'bool' },
  // Playlists & Limits
  { key: 'playlist_items', label: 'Playlist Items Selection', group: 'Playlists & Limits', kind: 'text', placeholder: '1,2,5-10 or 1:5' },
  { key: 'no_playlist', label: 'Single Video Only (Ignore Playlist)', group: 'Playlists & Limits', kind: 'bool' },
  { key: 'max_downloads', label: 'Max Downloads Limit', group: 'Playlists & Limits', kind: 'text', placeholder: '10' },
  { key: 'limit_rate', label: 'Bandwidth Rate Limit', group: 'Playlists & Limits', kind: 'text', placeholder: '5M, 500K' },
  { key: 'concurrent_fragments', label: 'Concurrent Fragments', group: 'Playlists & Limits', kind: 'text', placeholder: '4' },
  // Advanced & Output
  { key: 'output_template', label: 'Custom Filename Template', group: 'Output & Advanced', kind: 'text', placeholder: '%(title)s.%(ext)s' },
  { key: 'restrict_filenames', label: 'Sanitize Filenames (ASCII Only)', group: 'Output & Advanced', kind: 'bool' },
  { key: 'raw_args', label: 'Raw yt-dlp CLI Flags', group: 'Output & Advanced', kind: 'textarea', placeholder: '--no-mtime --geo-bypass' },
]

export default function DownloadOptionsForm({
  value,
  onChange,
}: {
  value: DownloadOptions
  onChange: (next: DownloadOptions) => void
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const mode = value.download_mode || 'video_audio'

  const handleMode = (newMode: 'video_audio' | 'audio_only' | 'video_only') => {
    const next: DownloadOptions = { ...value, download_mode: newMode }
    if (newMode === 'audio_only') {
      next.extract_audio = true
    } else {
      delete next.extract_audio
    }
    onChange(next)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return FIELDS
    return FIELDS.filter((f) => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q))
  }, [search])

  const groups = useMemo(() => {
    const out: Record<string, Field[]> = {}
    for (const f of filtered) {
      // Conditionally prioritize group items based on mode
      (out[f.group] ??= []).push(f)
    }
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
    <div className="border-t border-brand-sage/60 px-4 py-3 bg-brand-cream/80 text-brand-espresso">
      {/* Download Mode Selector Pill Bar */}
      <div className="mb-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand-caramel-text flex items-center gap-1">
            <Sparkles className="size-3 text-brand-caramel" />
            Download Mode
          </span>
          <span className="font-mono text-xs text-brand-espresso font-semibold">
            {mode === 'audio_only' ? 'Audio Extraction' : mode === 'video_only' ? 'Video Only' : 'Video + Audio'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => handleMode('video_audio')}
            className={`flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold transition-all ${
              mode === 'video_audio'
                ? 'bg-brand-caramel text-brand-cream-light shadow-xs'
                : 'bg-brand-cream-dark/70 border border-brand-sage text-brand-espresso hover:bg-brand-cream-dark'
            }`}
          >
            <Video className="size-3" />
            <span>Video+Audio</span>
          </button>

          <button
            type="button"
            onClick={() => handleMode('audio_only')}
            className={`flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold transition-all ${
              mode === 'audio_only'
                ? 'bg-brand-caramel text-brand-cream-light shadow-xs'
                : 'bg-brand-cream-dark/70 border border-brand-sage text-brand-espresso hover:bg-brand-cream-dark'
            }`}
          >
            <Music className="size-3" />
            <span>Audio Only</span>
          </button>

          <button
            type="button"
            onClick={() => handleMode('video_only')}
            className={`flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold transition-all ${
              mode === 'video_only'
                ? 'bg-brand-caramel text-brand-cream-light shadow-xs'
                : 'bg-brand-cream-dark/70 border border-brand-sage text-brand-espresso hover:bg-brand-cream-dark'
            }`}
          >
            <Film className="size-3" />
            <span>Video Only</span>
          </button>
        </div>
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-xs font-bold uppercase tracking-wider text-brand-caramel-text hover:text-brand-espresso transition-colors py-1"
      >
        <span className="flex items-center gap-1.5 font-mono text-xs">
          Additional Parameters & Config
        </span>
        <span className="flex items-center gap-1 text-xs font-mono text-brand-caramel">
          {open ? 'COLLAPSE' : 'EXPAND'}
          {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3.5 pt-2">
          {/* Quick Presets based on mode */}
          <div className="space-y-1.5">
            <span className="font-mono text-xs text-brand-caramel-text font-bold uppercase tracking-wider">Quick Presets</span>
            <div className="flex flex-wrap gap-1.5">
              {(mode === 'audio_only'
                ? ['best', 'mp3', 'm4a', 'flac', 'wav']
                : ['best', '1080p', '720p', '480p', '4k', 'h264']
              ).map((p) => {
                const isActive =
                  mode === 'audio_only' ? value.audio_format === p : value.format_preset === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      if (mode === 'audio_only') {
                        set('audio_format', p)
                      } else {
                        set('format_preset', p)
                      }
                    }}
                    className={
                      'rounded-lg px-2.5 py-1 font-mono text-xs font-bold transition-all duration-150 active:scale-[0.99] ' +
                      (isActive
                        ? 'bg-brand-caramel text-brand-cream-light shadow-xs'
                        : 'bg-brand-cream-dark border border-brand-sage text-brand-espresso hover:bg-brand-sage/40')
                    }
                  >
                    {p}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Search bar inside options */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-brand-caramel-text" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter options…"
              className="w-full rounded-xl border border-brand-sage bg-surface-white pl-8 pr-3 py-1.5 text-xs text-brand-espresso placeholder-placeholder focus:border-brand-caramel focus:outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-2 text-brand-caramel-text hover:text-brand-espresso"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Grouped Fields */}
          {Object.entries(groups).map(([group, fields]) => (
            <div key={group} className="space-y-2 pt-1 border-t border-brand-sage/50">
              <p className="font-mono text-xs font-bold uppercase tracking-wider text-brand-caramel-text">{group}</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {fields.map((f) => (
                  <div key={f.key} className={`space-y-1 ${f.kind === 'textarea' ? 'sm:col-span-2' : ''}`}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-brand-espresso text-xs">{f.label}</span>
                      {value[f.key] !== undefined && value[f.key] !== '' && (
                        <button
                          onClick={() => clearField(f.key)}
                          className="font-mono text-xs text-brand-caramel-text hover:text-accent-contrast transition-colors"
                        >
                          clear
                        </button>
                      )}
                    </div>
                    {f.kind === 'select' ? (
                      <select
                        value={String(value[f.key] ?? '')}
                        onChange={(e) => set(f.key, e.target.value || undefined)}
                        className="w-full rounded-xl border border-brand-sage bg-surface-white px-2.5 py-1.5 text-xs text-brand-espresso font-mono focus:border-brand-caramel focus:outline-none"
                      >
                        <option value="">default</option>
                        {f.options!.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : f.kind === 'bool' ? (
                      <div className="flex items-center gap-2 pt-0.5">
                        <input
                          type="checkbox"
                          id={`opt-${f.key}`}
                          checked={Boolean(value[f.key])}
                          onChange={(e) => set(f.key, e.target.checked || undefined)}
                          className="size-3.5 rounded border-brand-sage bg-brand-cream accent-brand-caramel cursor-pointer"
                        />
                        <label htmlFor={`opt-${f.key}`} className="text-xs text-brand-espresso cursor-pointer select-none font-medium">
                          Enable
                        </label>
                      </div>
                    ) : f.kind === 'textarea' ? (
                      <textarea
                        value={String(value[f.key] ?? '')}
                        onChange={(e) => set(f.key, e.target.value || undefined)}
                        rows={2}
                        placeholder={f.placeholder || '--no-mtime --embed-thumbnail'}
                        className="w-full rounded-xl border border-brand-sage bg-surface-white px-2.5 py-1.5 font-mono text-xs text-brand-espresso placeholder-placeholder focus:border-brand-caramel focus:outline-none"
                      />
                    ) : (
                      <input
                        type="text"
                        value={String(value[f.key] ?? '')}
                        onChange={(e) => set(f.key, e.target.value || undefined)}
                        placeholder={f.placeholder || 'Value…'}
                        className="w-full rounded-xl border border-brand-sage bg-surface-white px-2.5 py-1.5 text-xs text-brand-espresso placeholder-placeholder focus:border-brand-caramel focus:outline-none font-mono"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

