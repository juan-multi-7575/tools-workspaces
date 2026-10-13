import { useEffect, useState, useRef, type CSSProperties } from 'react'
import {
  Video,
  Music,
  ChevronDown,
  ChevronUp,
  Loader2,
  Subtitles,
  Image,
  Globe,
  Film,
  Sliders,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useHostSkin } from '../../lib/hostSkin'

interface DownloaderFormProps {
  value: Record<string, unknown>
  onChange: (val: Record<string, unknown>) => void
}

interface VideoMetadata {
  title?: string | null
  author_name?: string | null
  thumbnail_url?: string | null
  duration?: number | null
  provider_name?: string | null
}

export default function DownloaderForm({ value, onChange }: DownloaderFormProps) {
  const [url, setUrl] = useState<string>((value.url as string) || '')
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mounted by the downloader console (slate) and by the cream shell alike, so
  // it reads the board it landed on rather than carrying the cream palette it
  // was written in.
  const rootRef = useRef<HTMLDivElement>(null)
  const skin = useHostSkin(rootRef)

  // Canonical parameters with fallback to defaults
  const downloadMode: 'video_audio' | 'audio_only' | 'video_only' =
    (value.download_mode as any) || (value.extract_audio ? 'audio_only' : 'video_audio')
  const isAudioOnly = downloadMode === 'audio_only'

  const formatPreset = (value.format_preset as string) || (isAudioOnly ? 'audio' : 'best')
  const audioFormat = (value.audio_format as string) || 'best'
  const writeSubs = Boolean(value.writesubtitles)
  const embedSubs = Boolean(value.embed_subs)
  const embedThumbnail = Boolean(value.embed_thumbnail)
  const cookiesFromBrowser = (value.cookies_from_browser as string) || 'none'
  const outputTemplate = (value.output_template as string) || ''
  const limitRate = (value.limit_rate as string) || ''
  const rawArgs = (value.raw_args as string) || ''

  // Sync external value.url changes
  useEffect(() => {
    if (value.url && typeof value.url === 'string') {
      setUrl((prev) => (value.url !== prev ? (value.url as string) : prev))
    }
  }, [value.url])

  // Fetch metadata when URL changes with debounce
  useEffect(() => {
    const trimmed = url.trim()
    if (!trimmed || (!trimmed.startsWith('http://') && !trimmed.startsWith('https://'))) {
      setMetadata(null)
      setLoadingMeta(false)
      return
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    setLoadingMeta(true)

    searchTimeoutRef.current = setTimeout(() => {
      api.getVideoInfo(trimmed)
        .then((info) => {
          if (info && info.title) {
            setMetadata(info)
          } else {
            setMetadata(null)
          }
        })
        .catch(() => {
          setMetadata(null)
        })
        .finally(() => {
          setLoadingMeta(false)
        })
    }, 400)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [url])

  const updateParam = (key: string, val: unknown) => {
    onChange({
      download_mode: downloadMode,
      format_preset: formatPreset,
      audio_format: audioFormat,
      extract_audio: isAudioOnly,
      ...value,
      [key]: val,
    })
  }

  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl)
    updateParam('url', newUrl)
  }

  const handleModeChange = (mode: 'video_audio' | 'audio_only' | 'video_only') => {
    const isAudio = mode === 'audio_only'
    const nextPreset = isAudio
      ? 'audio'
      : (formatPreset === 'audio' ? 'best' : formatPreset)

    onChange({
      ...value,
      download_mode: mode,
      extract_audio: isAudio,
      format_preset: nextPreset,
      audio_format: audioFormat,
    })
  }

  const handleFormatPresetChange = (preset: string) => {
    onChange({
      ...value,
      download_mode: downloadMode,
      extract_audio: isAudioOnly,
      format_preset: preset,
    })
  }

  const handleAudioFormatChange = (fmt: string) => {
    onChange({
      ...value,
      download_mode: downloadMode,
      extract_audio: isAudioOnly,
      format_preset: 'audio',
      audio_format: fmt,
    })
  }

  const handleWriteSubsChange = (checked: boolean) => {
    onChange({
      ...value,
      writesubtitles: checked,
      embed_subs: checked ? embedSubs : false,
    })
  }

  return (
    <div ref={rootRef} className="tool-form space-y-4" data-tone={skin.tone} style={{ '--tool-ink': skin.ink, '--tool-on-accent': skin.onAccent } as CSSProperties}>
      {/* 1. Primary URL Input Box */}
      <div className="tool-panel rounded-2xl border-2 p-4 space-y-3">
        <label className="block text-xs font-bold uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Globe className="size-3.5 tool-accent-text" />
            Video or Media URL <span className="tool-alert-ink">*</span>
          </span>
          {loadingMeta && (
            <span className="inline-flex items-center gap-1 text-xs font-mono tool-accent-text lowercase font-normal">
              <Loader2 className="size-3 animate-spin" /> fetching title...
            </span>
          )}
        </label>

        <div className="relative">
          <input
            type="url"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="Paste a YouTube, Vimeo or Twitch link"
            title="Paste a YouTube, Vimeo, Twitch, or other direct video link"
            className="tool-well w-full rounded-xl px-3.5 py-2.5 text-xs pr-8 font-medium transition-all"
            autoFocus
          />
          {url && (
            <button
              type="button"
              onClick={() => handleUrlChange('')}
              className="tool-quiet-action absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold px-1"
              title="Clear URL"
            >
              ×
            </button>
          )}
          {/* The full wording lives here, where it can wrap, rather than in a
              placeholder that an input can only ever cut off mid-word. */}
          <p className="text-[12px] tool-muted">
            YouTube, Vimeo, Twitch, or any other direct video link.
          </p>
        </div>

        {/* Instant Live Video Preview Card */}
        {metadata?.title && (
          <div className="tool-panel-quiet flex items-center gap-3.5 rounded-xl border p-3">
            {metadata.thumbnail_url ? (
              <img
                src={metadata.thumbnail_url}
                alt={metadata.title}
                className="h-14 w-24 rounded-lg object-cover border tool-rule shrink-0"
              />
            ) : (
              <div className="tool-on-accent flex h-14 w-24 items-center justify-center rounded-lg shrink-0">
                <Film className="size-6 opacity-70" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="tool-on-accent font-mono text-xs font-bold uppercase tracking-wider px-1.5 py-0.2 rounded">
                  {metadata.provider_name || 'YouTube'}
                </span>
                {metadata.author_name && (
                  <span className="text-xs font-semibold tool-muted truncate">
                    {metadata.author_name}
                  </span>
                )}
              </div>
              <p className="text-xs font-bold line-clamp-2 leading-snug">
                {metadata.title}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. Download Format & Quality Presets (Compact) */}
      <div className="tool-panel rounded-2xl border p-4 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Mode Switcher: Video+Audio vs Audio Only vs Video Only */}
          <div className="space-y-1">
            <span className="font-mono text-xs font-bold uppercase tracking-wider tool-muted block">
              Download Mode
            </span>
            <div className="tool-panel-quiet inline-flex flex-wrap rounded-xl border p-1 gap-1">
              <button
                type="button"
                onClick={() => handleModeChange('video_audio')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  downloadMode === 'video_audio' ? 'tool-on-accent' : 'tool-pill'
                }`}
              >
                <Video className="size-3.5" />
                Video + Audio
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('audio_only')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  downloadMode === 'audio_only' ? 'tool-on-accent' : 'tool-pill'
                }`}
              >
                <Music className="size-3.5" />
                Audio Only
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('video_only')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  downloadMode === 'video_only' ? 'tool-on-accent' : 'tool-pill'
                }`}
              >
                <Film className="size-3.5" />
                Video Only
              </button>
            </div>
          </div>

          {/* Quality or Audio Format Selector */}
          <div className="space-y-1">
            <span className="font-mono text-xs font-bold uppercase tracking-wider tool-muted block">
              {isAudioOnly ? 'Audio Format' : 'Resolution / Quality'}
            </span>
            {isAudioOnly ? (
              <select
                value={audioFormat}
                onChange={(e) => handleAudioFormatChange(e.target.value)}
                className="tool-well rounded-xl px-3 py-1.5 text-xs font-semibold"
              >
                <option value="best">Best Native Audio</option>
                <option value="mp3">MP3 (Most Compatible)</option>
                <option value="wav">WAV (Uncompressed PCM)</option>
                <option value="flac">FLAC (Lossless Quality)</option>
                <option value="m4a">M4A (Apple / AAC)</option>
              </select>
            ) : (
              <select
                value={formatPreset}
                onChange={(e) => handleFormatPresetChange(e.target.value)}
                className="tool-well rounded-xl px-3 py-1.5 text-xs font-semibold"
              >
                <option value="best">Best Available (Highest)</option>
                <option value="1080p">1080p (Full HD)</option>
                <option value="720p">720p (HD)</option>
                <option value="480p">480p (Standard)</option>
              </select>
            )}
          </div>
        </div>

        {/* Fast Feature Checkboxes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t tool-rule">
          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={writeSubs}
              onChange={(e) => handleWriteSubsChange(e.target.checked)}
              className="tool-checkbox rounded focus:ring-0"
            />
            <span className="flex items-center gap-1">
              <Subtitles className="size-3.5 tool-accent-text" /> Subtitles
            </span>
          </label>

          <label
            className={`flex items-center gap-2 text-xs font-semibold transition-opacity ${
              writeSubs ? 'cursor-pointer' : 'tool-faint cursor-not-allowed'
            }`}
          >
            <input
              type="checkbox"
              disabled={!writeSubs}
              checked={embedSubs && writeSubs}
              onChange={(e) => updateParam('embed_subs', e.target.checked)}
              className="tool-checkbox rounded focus:ring-0"
            />
            <span>Embed Subtitles</span>
          </label>

          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={embedThumbnail}
              onChange={(e) => updateParam('embed_thumbnail', e.target.checked)}
              className="tool-checkbox rounded focus:ring-0"
            />
            <span className="flex items-center gap-1">
              <Image className="size-3.5 tool-accent-text" /> Cover Art
            </span>
          </label>
        </div>
      </div>

      {/* 3. Collapsible Advanced Technical Options Accordion */}
      <div className="tool-panel rounded-2xl border overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="tool-panel-quiet w-full flex items-center justify-between px-4 py-3 border-b text-left font-mono text-xs font-bold"
        >
          <span className="flex items-center gap-2">
            <Sliders className="size-3.5 tool-accent-text" />
            Advanced &amp; Technical Options
            <span className="text-xs font-normal tool-muted">
              (Cookies, Rate Limits, Filenames)
            </span>
          </span>
          {showAdvanced ? (
            <ChevronUp className="size-4 tool-muted" />
          ) : (
            <ChevronDown className="size-4 tool-muted" />
          )}
        </button>

        {showAdvanced && (
          <div className="p-4 space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Browser Cookies (Anti-403) */}
              <div className="space-y-1">
                <label className="font-mono text-xs uppercase font-bold tool-muted block">
                  Browser Cookies (Anti-403 / Bot Bypass)
                </label>
                <select
                  value={cookiesFromBrowser}
                  onChange={(e) => updateParam('cookies_from_browser', e.target.value)}
                  className="tool-well w-full rounded-xl px-3 py-1.5 text-xs"
                >
                  <option value="none">None (Direct download)</option>
                  <option value="chrome">Google Chrome</option>
                  <option value="firefox">Mozilla Firefox</option>
                  <option value="edge">Microsoft Edge</option>
                  <option value="brave">Brave Browser</option>
                  <option value="safari">Apple Safari</option>
                  <option value="opera">Opera</option>
                </select>
              </div>

              {/* Download Speed Limit */}
              <div className="space-y-1">
                <label className="font-mono text-xs uppercase font-bold tool-muted block">
                  Speed Throttling (Rate Limit)
                </label>
                <input
                  type="text"
                  value={limitRate}
                  onChange={(e) => updateParam('limit_rate', e.target.value)}
                  placeholder="e.g. 5M, 500K"
                  className="tool-well w-full rounded-xl px-3 py-1.5 text-xs"
                />
              </div>

              {/* Custom Filename Template */}
              <div className="space-y-1 sm:col-span-2">
                <label className="font-mono text-xs uppercase font-bold tool-muted block">
                  Custom Filename Template
                </label>
                <input
                  type="text"
                  value={outputTemplate}
                  onChange={(e) => updateParam('output_template', e.target.value)}
                  placeholder="%(title)s.%(ext)s"
                  className="tool-well w-full rounded-xl px-3 py-1.5 text-xs font-mono"
                />
              </div>

              {/* Raw CLI Flags */}
              <div className="space-y-1 sm:col-span-2">
                <label className="font-mono text-xs uppercase font-bold tool-muted block">
                  Raw yt-dlp Flags
                </label>
                <input
                  type="text"
                  value={rawArgs}
                  onChange={(e) => updateParam('raw_args', e.target.value)}
                  placeholder="--no-mtime --geo-bypass"
                  className="tool-well w-full rounded-xl px-3 py-1.5 text-xs font-mono"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
