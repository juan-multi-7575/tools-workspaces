import { useEffect, useRef, useState } from 'react'
import {
  X,
  Download,
  Captions,
  Layers,
  Sparkles,
  FileText,
  Clock,
  Play,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { api, type MediaItem } from '../../lib/api'

interface SubtitleCue {
  id: number
  start: number
  end: number
  startFormatted: string
  text: string
}

function parseTimeToSeconds(timeStr: string): number {
  const parts = timeStr.trim().replace(',', '.').split(':')
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])
  }
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1])
  }
  return parseFloat(timeStr) || 0
}

function parseSrtOrVtt(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  const blocks = normalized.split(/\n\s*\n/)

  let idCounter = 1
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!lines.length) continue

    let timingLine = ''
    let textLines: string[] = []

    if (lines[0].includes('-->')) {
      timingLine = lines[0]
      textLines = lines.slice(1)
    } else if (lines.length > 1 && lines[1].includes('-->')) {
      timingLine = lines[1]
      textLines = lines.slice(2)
    }

    if (!timingLine) continue

    const [startStr, endStr] = timingLine.split('-->').map((s) => s.trim())
    const startSec = parseTimeToSeconds(startStr)
    const endSec = parseTimeToSeconds(endStr.split(' ')[0])

    cues.push({
      id: idCounter++,
      start: startSec,
      end: endSec,
      startFormatted: startStr.split('.')[0].split(',')[0],
      text: textLines.join(' '),
    })
  }
  return cues
}

export default function VideoSubtitlePlayerModal({
  workspaceId,
  video,
  subtitles = [],
  transcripts = [],
  onClose,
  onSubtitlesMuxed,
}: {
  workspaceId: string
  video: MediaItem
  subtitles?: MediaItem[]
  transcripts?: MediaItem[]
  onClose: () => void
  onSubtitlesMuxed?: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [selectedSubId, setSelectedSubId] = useState<string>(
    subtitles.length > 0 ? subtitles[0].name : 'none'
  )
  const [trackBlobUrl, setTrackBlobUrl] = useState<string | null>(null)
  const [cues, setCues] = useState<SubtitleCue[]>([])
  const [activeCueId, setActiveCueId] = useState<number | null>(null)
  const [muxing, setMuxing] = useState(false)
  const [muxSuccess, setMuxSuccess] = useState<string | null>(null)
  const [muxError, setMuxError] = useState<string | null>(null)

  const selectedSub = subtitles.find((s) => s.name === selectedSubId)

  // Load subtitle content and generate WebVTT track
  useEffect(() => {
    if (!selectedSub || selectedSubId === 'none') {
      setTrackBlobUrl(null)
      setCues([])
      return
    }

    let isMounted = true
    fetch(selectedSub.preview_url)
      .then((res) => res.text())
      .then((text) => {
        if (!isMounted) return
        const parsed = parseSrtOrVtt(text)
        setCues(parsed)

        // Ensure WebVTT format for native HTML5 video <track>
        let vttText = text
        if (!text.trim().startsWith('WEBVTT')) {
          vttText = 'WEBVTT\n\n' + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
        }
        const blob = new Blob([vttText], { type: 'text/vtt' })
        const url = URL.createObjectURL(blob)
        setTrackBlobUrl(url)
      })
      .catch((err) => {
        console.error('Failed to load subtitle file:', err)
      })

    return () => {
      isMounted = false
      if (trackBlobUrl) URL.revokeObjectURL(trackBlobUrl)
    }
  }, [selectedSub, selectedSubId])

  // Sync active cue during video playback
  const handleTimeUpdate = () => {
    if (!videoRef.current || cues.length === 0) return
    const ct = videoRef.current.currentTime
    const curr = cues.find((c) => ct >= c.start && ct <= c.end)
    setActiveCueId(curr ? curr.id : null)
  }

  const seekTo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds
      videoRef.current.play().catch(() => {})
    }
  }

  const handleMux = async (burnIn: boolean) => {
    if (!selectedSub) return
    setMuxing(true)
    setMuxSuccess(null)
    setMuxError(null)
    try {
      const res = await api.muxSubtitles(workspaceId, video.path, selectedSub.path, burnIn)
      setMuxSuccess(`Subtitles successfully ${burnIn ? 'burned' : 'embedded'}! Created: ${res.name}`)
      if (onSubtitlesMuxed) onSubtitlesMuxed()
    } catch (err: unknown) {
      const e = err as Error
      setMuxError(e.message || 'Muxing failed')
    } finally {
      setMuxing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-3 sm:p-5 bg-brand-espresso/50 backdrop-blur-xs">
      <div className="relative flex flex-col w-full max-w-6xl max-h-[92vh] rounded-2xl border-2 border-brand-sage bg-brand-cream shadow-2xl overflow-hidden text-brand-espresso">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-brand-sage/60 px-5 py-3 bg-brand-cream-dark/90">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-8 items-center justify-center rounded-xl bg-brand-caramel text-brand-cream-light shrink-0 shadow-xs">
              <Play className="size-4 fill-current" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-brand-espresso font-mono truncate">{video.name}</h3>
              <p className="text-xs text-brand-caramel-text font-mono">
                {(video.size / (1024 * 1024)).toFixed(1)} MB • Synchronized Video & Subtitles Studio
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Subtitle Selector Dropdown */}
            {subtitles.length > 0 && (
              <div className="flex items-center gap-1.5 bg-surface-white border border-brand-sage rounded-xl px-2.5 py-1 text-xs">
                <Captions className="size-3.5 text-brand-caramel" />
                <select
                  value={selectedSubId}
                  onChange={(e) => setSelectedSubId(e.target.value)}
                  className="bg-transparent font-mono text-xs text-brand-espresso font-semibold outline-none cursor-pointer"
                >
                  {subtitles.map((sub) => (
                    <option key={sub.name} value={sub.name}>
                      {sub.name.includes('.en.')
                        ? '🌐 English Subtitles'
                        : sub.name.includes('.ko.')
                        ? '🇰🇷 Korean Subtitles'
                        : sub.name}
                    </option>
                  ))}
                  <option value="none">No Subtitles (Off)</option>
                </select>
              </div>
            )}

            <a
              href={video.download_url}
              className="inline-flex items-center gap-1 rounded-xl bg-brand-caramel px-3 py-1.5 text-xs font-bold text-brand-cream-light shadow-xs hover:bg-brand-caramel-hover transition-all"
            >
              <Download className="size-3.5" /> Download Video
            </a>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-brand-caramel-text hover:bg-brand-sage/30 hover:text-brand-espresso transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Modal Main Content: Split Player and Transcript */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] overflow-hidden min-h-0 bg-brand-cream">
          {/* Left Pane: Video Player */}
          <div className="flex flex-col p-4 space-y-3 overflow-y-auto border-b lg:border-b-0 lg:border-r border-brand-sage/50">
            <div className="relative flex items-center justify-center bg-surface-black rounded-xl overflow-hidden shadow-lg border border-brand-sage max-h-[58vh]">
              <video
                ref={videoRef}
                controls
                crossOrigin="anonymous"
                onTimeUpdate={handleTimeUpdate}
                className="w-full max-h-[58vh] object-contain"
                src={video.preview_url}
              >
                {trackBlobUrl && (
                  <track
                    key={trackBlobUrl}
                    src={trackBlobUrl}
                    kind="subtitles"
                    srcLang="en"
                    label={selectedSub?.name || 'Subtitles'}
                    default
                  />
                )}
                Your browser does not support video playback.
              </video>
            </div>

            {/* Subtitle Muxing Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-brand-sage bg-brand-cream-dark/60 text-xs">
              <div className="space-y-0.5">
                <span className="font-mono text-xs font-bold text-brand-espresso flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-brand-caramel" />
                  Embed Subtitles into Video (FFmpeg)
                </span>
                <p className="text-xs text-brand-caramel-text">
                  Permanently mux selected subtitle track directly into the MP4 file.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleMux(false)}
                  disabled={muxing || !selectedSub}
                  className="inline-flex items-center gap-1 rounded-lg border border-brand-sage bg-surface-white px-2.5 py-1 text-xs font-bold text-brand-espresso hover:bg-brand-cream-dark disabled:opacity-50 transition-all shadow-2xs"
                  title="Fast soft-mux track into MP4 container (instant, no re-encoding)"
                >
                  {muxing ? <Loader2 className="size-3 animate-spin text-brand-caramel" /> : <Layers className="size-3" />}
                  Embed Subtitle Track
                </button>
                <button
                  onClick={() => handleMux(true)}
                  disabled={muxing || !selectedSub}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand-caramel px-2.5 py-1 text-xs font-bold text-brand-cream-light hover:bg-brand-caramel-hover disabled:opacity-50 transition-all shadow-2xs"
                  title="Hard-burn subtitles directly onto the video frames"
                >
                  Burn-In Subtitles
                </button>
              </div>
            </div>

            {muxSuccess && (
              <div className="flex items-center gap-1.5 p-2.5 text-xs text-success bg-success-soft border border-brand-sage rounded-xl font-medium">
                <Check className="size-3.5 shrink-0" />
                <span>{muxSuccess}</span>
              </div>
            )}
            {muxError && (
              <div className="flex items-center gap-1.5 p-2.5 text-xs text-accent-contrast bg-error-tint border border-accent-contrast/40 rounded-xl font-medium">
                <AlertCircle className="size-3.5 shrink-0" />
                <span>{muxError}</span>
              </div>
            )}
          </div>

          {/* Right Pane: Interactive Synchronized Transcript */}
          <div className="flex flex-col h-full overflow-hidden bg-surface-white/60">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-brand-sage/50 bg-brand-cream-dark/50 shrink-0">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand-espresso flex items-center gap-1.5">
                <FileText className="size-3.5 text-brand-caramel" />
                Interactive Transcript
              </span>
              <span className="font-mono text-xs text-brand-caramel-text">
                {cues.length} cues
              </span>
            </div>

            {cues.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-brand-caramel-text">
                <Captions className="size-8 text-brand-sage mb-2" />
                <p className="text-xs font-bold text-brand-espresso">No Subtitles Active</p>
                <p className="text-xs mt-1 max-w-[200px]">
                  Select a subtitle file from the dropdown above to view and sync the transcript.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {cues.map((cue) => {
                  const isActive = activeCueId === cue.id
                  return (
                    <div
                      key={cue.id}
                      onClick={() => seekTo(cue.start)}
                      className={
                        'group flex items-start gap-2.5 p-2 rounded-xl text-xs cursor-pointer transition-all duration-150 ' +
                        (isActive
                          ? 'bg-brand-caramel text-brand-cream-light shadow-xs font-semibold scale-[1.01]'
                          : 'bg-brand-cream/60 hover:bg-brand-cream-dark text-brand-espresso')
                      }
                    >
                      <span
                        className={
                          'font-mono text-xs px-1.5 py-0.5 rounded shrink-0 flex items-center gap-0.5 ' +
                          (isActive
                            ? 'bg-brand-cream-light/25 text-brand-cream-light'
                            : 'bg-brand-sage/30 text-brand-caramel-text group-hover:text-brand-espresso')
                        }
                      >
                        <Clock className="size-2.5" />
                        {cue.startFormatted}
                      </span>
                      <p className="leading-snug break-words">{cue.text}</p>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Quick Download Subtitle & Transcript Actions Footer */}
            <div className="p-3 border-t border-brand-sage/50 bg-brand-cream-dark/40 flex flex-wrap items-center justify-between gap-2 shrink-0">
              {selectedSub && (
                <a
                  href={selectedSub.download_url}
                  className="inline-flex items-center gap-1 rounded-lg border border-brand-sage bg-surface-white px-2 py-1 text-xs font-bold text-brand-espresso hover:bg-brand-cream-dark shrink-0"
                >
                  <Download className="size-3" /> Download Subtitle
                </a>
              )}
              {transcripts && transcripts.length > 0 && (
                <a
                  href={transcripts[0].download_url}
                  className="inline-flex items-center gap-1 rounded-lg border border-brand-sage bg-surface-white px-2 py-1 text-xs font-bold text-brand-espresso hover:bg-brand-cream-dark shrink-0"
                >
                  <Download className="size-3" /> Download Text (.txt)
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
