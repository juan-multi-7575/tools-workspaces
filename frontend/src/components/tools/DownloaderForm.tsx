import { useEffect, useState, useRef } from 'react'
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

  // Current parameter values with defaults
  const extractAudio = Boolean(value.extract_audio)
  const format = (value.format as string) || 'best'
  const writeSubs = Boolean(value.writesubtitles)
  const embedSubs = Boolean(value.embed_subs)
  const embedThumbnail = Boolean(value.embed_thumbnail)
  const cookiesFromBrowser = (value.cookies_from_browser as string) || 'none'
  const outputTemplate = (value.output_template as string) || ''
  const limitRate = (value.limit_rate as string) || ''
  const rawArgs = (value.raw_args as string) || ''

  // Sync external value.url changes
  useEffect(() => {
    if (value.url && value.url !== url) {
      setUrl(value.url as string)
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
    onChange({ ...value, [key]: val })
  }

  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl)
    updateParam('url', newUrl)
  }

  const setDownloadMode = (mode: 'video' | 'audio') => {
    if (mode === 'audio') {
      onChange({
        ...value,
        extract_audio: true,
        format: 'bestaudio/best',
      })
    } else {
      onChange({
        ...value,
        extract_audio: false,
        format: 'bestvideo+bestaudio/best',
      })
    }
  }

  return (
    <div className="space-y-4 text-[#4E220F]">
      {/* 1. Primary URL Input Box */}
      <div className="rounded-2xl border-2 border-[#B0BA99] bg-[#FFFFFF] p-4 shadow-xs space-y-3">
        <label className="block text-xs font-bold uppercase tracking-wider text-[#4E220F] flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Globe className="size-3.5 text-[#9D6638]" />
            Video or Media URL <span className="text-[#A83232]">*</span>
          </span>
          {loadingMeta && (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[#9D6638] lowercase font-normal">
              <Loader2 className="size-3 animate-spin" /> fetching title...
            </span>
          )}
        </label>

        <div className="relative">
          <input
            type="url"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="Paste YouTube, Vimeo, Twitch, or video link here..."
            className="w-full rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/60 px-3.5 py-2.5 text-xs text-[#4E220F] placeholder-[#7C5339]/50 focus:border-[#9D6638] focus:bg-[#FFFFFF] focus:outline-none font-medium shadow-2xs transition-all pr-8"
            autoFocus
          />
          {url && (
            <button
              type="button"
              onClick={() => handleUrlChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#7C5339] hover:text-[#A83232] px-1"
              title="Clear URL"
            >
              ×
            </button>
          )}
        </div>

        {/* Instant Live Video Preview Card */}
        {metadata?.title && (
          <div className="flex items-center gap-3.5 rounded-xl border border-[#9D6638]/40 bg-[#EDE5CD]/70 p-3 shadow-xs animate-in fade-in duration-200">
            {metadata.thumbnail_url ? (
              <img
                src={metadata.thumbnail_url}
                alt={metadata.title}
                className="h-14 w-24 rounded-lg object-cover border border-[#B0BA99] shadow-2xs shrink-0"
              />
            ) : (
              <div className="flex h-14 w-24 items-center justify-center rounded-lg bg-[#9D6638] text-[#FDFBF7] shrink-0">
                <Film className="size-6 opacity-70" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-mono text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-[#9D6638] text-[#FDFBF7]">
                  {metadata.provider_name || 'YouTube'}
                </span>
                {metadata.author_name && (
                  <span className="text-[11px] font-semibold text-[#7C5339] truncate">
                    {metadata.author_name}
                  </span>
                )}
              </div>
              <p className="text-xs font-bold text-[#4E220F] line-clamp-2 leading-snug">
                {metadata.title}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. Download Format & Quality Presets (Compact) */}
      <div className="rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] p-4 shadow-xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Mode Switcher: Video vs Audio */}
          <div className="space-y-1">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7C5339] block">
              Download Mode
            </span>
            <div className="inline-flex rounded-xl border border-[#B0BA99] bg-[#EDE5CD]/70 p-1">
              <button
                type="button"
                onClick={() => setDownloadMode('video')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                  !extractAudio
                    ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs'
                    : 'text-[#4E220F] hover:bg-[#EDE5CD]'
                }`}
              >
                <Video className="size-3.5" />
                Video (MP4)
              </button>
              <button
                type="button"
                onClick={() => setDownloadMode('audio')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                  extractAudio
                    ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs'
                    : 'text-[#4E220F] hover:bg-[#EDE5CD]'
                }`}
              >
                <Music className="size-3.5" />
                Audio Only (MP3)
              </button>
            </div>
          </div>

          {/* Quality Selector */}
          <div className="space-y-1">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7C5339] block">
              Resolution / Quality
            </span>
            <select
              value={format}
              onChange={(e) => updateParam('format', e.target.value)}
              className="rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/70 px-3 py-1.5 text-xs font-semibold text-[#4E220F] focus:border-[#9D6638] focus:outline-none"
            >
              {!extractAudio ? (
                <>
                  <option value="bestvideo+bestaudio/best">Best Available (Highest)</option>
                  <option value="bestvideo[height<=1080]+bestaudio/best[height<=1080]">1080p (Full HD)</option>
                  <option value="bestvideo[height<=720]+bestaudio/best[height<=720]">720p (HD)</option>
                  <option value="bestvideo[height<=480]+bestaudio/best[height<=480]">480p (Standard)</option>
                </>
              ) : (
                <>
                  <option value="bestaudio/best">Highest Quality (Original Bitrate)</option>
                  <option value="bestaudio[abr<=320]/best">320 kbps (High Quality MP3)</option>
                  <option value="bestaudio[abr<=192]/best">192 kbps (Standard Audio)</option>
                  <option value="bestaudio[abr<=128]/best">128 kbps (Compact Audio)</option>
                </>
              )}
            </select>
          </div>
        </div>

        {/* Fast Feature Checkboxes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-[#B0BA99]/40">
          <label className="flex items-center gap-2 text-xs font-semibold text-[#4E220F] cursor-pointer">
            <input
              type="checkbox"
              checked={writeSubs}
              onChange={(e) => updateParam('writesubtitles', e.target.checked)}
              className="rounded border-[#B0BA99] text-[#9D6638] focus:ring-0"
            />
            <span className="flex items-center gap-1">
              <Subtitles className="size-3.5 text-[#9D6638]" /> Subtitles
            </span>
          </label>

          <label
            className={`flex items-center gap-2 text-xs font-semibold transition-opacity ${
              writeSubs ? 'text-[#4E220F] cursor-pointer' : 'text-[#7C5339]/50 cursor-not-allowed'
            }`}
          >
            <input
              type="checkbox"
              disabled={!writeSubs}
              checked={embedSubs && writeSubs}
              onChange={(e) => updateParam('embed_subs', e.target.checked)}
              className="rounded border-[#B0BA99] text-[#9D6638] focus:ring-0"
            />
            <span>Embed Subtitles</span>
          </label>

          <label className="flex items-center gap-2 text-xs font-semibold text-[#4E220F] cursor-pointer">
            <input
              type="checkbox"
              checked={embedThumbnail}
              onChange={(e) => updateParam('embed_thumbnail', e.target.checked)}
              className="rounded border-[#B0BA99] text-[#9D6638] focus:ring-0"
            />
            <span className="flex items-center gap-1">
              <Image className="size-3.5 text-[#9D6638]" /> Cover Art
            </span>
          </label>
        </div>
      </div>

      {/* 3. Collapsible Advanced Technical Options Accordion */}
      <div className="rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] overflow-hidden shadow-xs">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between px-4 py-3 bg-[#EDE5CD]/50 hover:bg-[#EDE5CD]/80 transition-colors text-left font-mono text-xs font-bold text-[#4E220F]"
        >
          <span className="flex items-center gap-2">
            <Sliders className="size-3.5 text-[#9D6638]" />
            Advanced & Technical Options
            <span className="text-[10px] font-normal text-[#7C5339]">
              (Cookies, Rate Limits, Filenames)
            </span>
          </span>
          {showAdvanced ? (
            <ChevronUp className="size-4 text-[#7C5339]" />
          ) : (
            <ChevronDown className="size-4 text-[#7C5339]" />
          )}
        </button>

        {showAdvanced && (
          <div className="p-4 space-y-3.5 bg-[#FFFFFF] border-t border-[#B0BA99]/50 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Browser Cookies (Anti-403) */}
              <div className="space-y-1">
                <label className="font-mono text-[10px] uppercase font-bold text-[#7C5339] block">
                  Browser Cookies (Anti-403 / Bot Bypass)
                </label>
                <select
                  value={cookiesFromBrowser}
                  onChange={(e) => updateParam('cookies_from_browser', e.target.value)}
                  className="w-full rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/70 px-3 py-1.5 text-xs text-[#4E220F]"
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
                <label className="font-mono text-[10px] uppercase font-bold text-[#7C5339] block">
                  Speed Throttling (Rate Limit)
                </label>
                <input
                  type="text"
                  value={limitRate}
                  onChange={(e) => updateParam('limit_rate', e.target.value)}
                  placeholder="e.g. 5M, 500K"
                  className="w-full rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/70 px-3 py-1.5 text-xs text-[#4E220F] placeholder-[#7C5339]/50"
                />
              </div>

              {/* Custom Filename Template */}
              <div className="space-y-1 sm:col-span-2">
                <label className="font-mono text-[10px] uppercase font-bold text-[#7C5339] block">
                  Custom Filename Template
                </label>
                <input
                  type="text"
                  value={outputTemplate}
                  onChange={(e) => updateParam('output_template', e.target.value)}
                  placeholder="%(title)s.%(ext)s"
                  className="w-full rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/70 px-3 py-1.5 text-xs text-[#4E220F] font-mono placeholder-[#7C5339]/50"
                />
              </div>

              {/* Raw CLI Flags */}
              <div className="space-y-1 sm:col-span-2">
                <label className="font-mono text-[10px] uppercase font-bold text-[#7C5339] block">
                  Raw yt-dlp Flags
                </label>
                <input
                  type="text"
                  value={rawArgs}
                  onChange={(e) => updateParam('raw_args', e.target.value)}
                  placeholder="--no-mtime --geo-bypass"
                  className="w-full rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/70 px-3 py-1.5 text-xs text-[#4E220F] font-mono placeholder-[#7C5339]/50"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
