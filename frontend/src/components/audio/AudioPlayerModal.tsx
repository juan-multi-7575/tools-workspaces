import { useEffect, useRef, useState } from 'react'
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  Scissors,
  FileText,
  Sliders,
  Music,
  Sparkles,
} from 'lucide-react'

export interface AudioPlayerMedia {
  name: string
  path: string
  url?: string
  kind?: string
}

export default function AudioPlayerModal({
  media,
  onClose,
  onSendToTool,
}: {
  media: AudioPlayerMedia | null
  onClose: () => void
  onSendToTool?: (toolId: string, inputPath: string) => void
}) {
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const [muted, setMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1.0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!media) return
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }, [media])

  if (!media) return null

  // Generate stream URL or preview URL
  const audioSrc =
    media.url ||
    (media.path.startsWith('http')
      ? media.path
      : `/api/tools/stream?path=${encodeURIComponent(media.path)}`)

  const togglePlay = () => {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      audioRef.current.play().catch(() => {})
      setPlaying(true)
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    setCurrentTime(val)
    if (audioRef.current) {
      audioRef.current.currentTime = val
    }
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    setVolume(val)
    setMuted(val === 0)
    if (audioRef.current) {
      audioRef.current.volume = val
      audioRef.current.muted = val === 0
    }
  }

  const toggleMute = () => {
    if (!audioRef.current) return
    const next = !muted
    setMuted(next)
    audioRef.current.muted = next
  }

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate)
    if (audioRef.current) {
      audioRef.current.playbackRate = rate
    }
  }

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === 0) return '00:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#4E220F]/30 backdrop-blur-[3px]">
      <div className="relative w-full max-w-xl rounded-2xl border-2 border-[#B0BA99] bg-[#F7F1DE] shadow-2xl p-6 text-[#4E220F]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#B0BA99]/60 pb-3.5 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-[#9D6638] text-[#FDFBF7] shadow-xs">
              <Music className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#4E220F] truncate max-w-sm">
                {media.name}
              </h3>
              <p className="font-mono text-[10px] text-[#7C5339]">
                STANDALONE AUDIO PLAYER TOOL
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#7C5339] hover:bg-[#B0BA99]/30 hover:text-[#4E220F] transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Audio Element */}
        <audio
          ref={audioRef}
          src={audioSrc}
          onTimeUpdate={() => {
            if (audioRef.current) setCurrentTime(audioRef.current.currentTime)
          }}
          onLoadedMetadata={() => {
            if (audioRef.current) setDuration(audioRef.current.duration)
          }}
          onEnded={() => setPlaying(false)}
        />

        {/* Waveform Visualization Canvas Simulation */}
        <div className="relative rounded-xl border border-[#B0BA99] bg-[#EDE5CD]/70 p-4 mb-4 flex flex-col items-center justify-center min-h-[110px] shadow-inner">
          <div className="flex items-center gap-1 w-full justify-center h-16 px-4">
            {Array.from({ length: 48 }).map((_, i) => {
              const progressRatio = duration > 0 ? currentTime / duration : 0
              const isPlayed = i / 48 <= progressRatio
              const heightMultiplier = Math.sin(i * 0.3) * 0.5 + 0.5
              const heightPx = Math.max(8, Math.round(heightMultiplier * 48))
              return (
                <div
                  key={i}
                  className={`w-1.5 rounded-full transition-all duration-150 ${
                    isPlayed ? 'bg-[#9D6638]' : 'bg-[#B0BA99]'
                  }`}
                  style={{ height: `${heightPx}px` }}
                />
              )
            })}
          </div>

          <div className="flex items-center justify-between w-full mt-2 px-1 font-mono text-[11px] font-semibold text-[#7C5339]">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Scrub Bar */}
        <div className="mb-4">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-[#EDE5CD] rounded-lg appearance-none cursor-pointer accent-[#9D6638]"
          />
        </div>

        {/* Playback Controls */}
        <div className="flex items-center justify-between gap-4 mb-5 bg-[#FFFFFF] p-3 rounded-xl border border-[#B0BA99]/80 shadow-xs">
          {/* Speed selector */}
          <div className="flex items-center gap-1">
            {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
              <button
                key={rate}
                onClick={() => changeSpeed(rate)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                  playbackRate === rate
                    ? 'bg-[#9D6638] text-[#FDFBF7]'
                    : 'bg-[#EDE5CD] text-[#7C5339] hover:bg-[#B0BA99]/40'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>

          {/* Main Play/Pause Button */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.currentTime = 0
                  setCurrentTime(0)
                }
              }}
              className="p-2 rounded-full text-[#7C5339] hover:bg-[#EDE5CD] transition-colors"
              title="Restart"
            >
              <RotateCcw className="size-4" />
            </button>

            <button
              onClick={togglePlay}
              className="flex size-11 items-center justify-center rounded-full bg-[#9D6638] text-[#FDFBF7] shadow-md hover:bg-[#86542C] active:scale-95 transition-all"
            >
              {playing ? (
                <Pause className="size-5 fill-current" />
              ) : (
                <Play className="size-5 fill-current ml-0.5" />
              )}
            </button>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className="text-[#7C5339] hover:text-[#4E220F]"
            >
              {muted || volume === 0 ? (
                <VolumeX className="size-4 text-[#A83232]" />
              ) : (
                <Volume2 className="size-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-16 h-1.5 bg-[#EDE5CD] rounded-lg appearance-none cursor-pointer accent-[#9D6638]"
            />
          </div>
        </div>

        {/* Quick Action Bridges to Other Tools */}
        <div className="border-t border-[#B0BA99]/60 pt-3.5 space-y-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7C5339] flex items-center gap-1">
            <Sparkles className="size-3 text-[#9D6638]" />
            Send Audio to Platform Tools
          </span>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                onClose()
                if (onSendToTool) onSendToTool('trimmer', media.path)
              }}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-[#B0BA99] bg-[#EDE5CD]/60 py-2 px-2.5 text-xs font-semibold text-[#4E220F] hover:bg-[#9D6638] hover:text-[#FDFBF7] hover:border-[#9D6638] transition-all shadow-xs"
            >
              <Scissors className="size-3.5" />
              <span>Trim / Split</span>
            </button>

            <button
              onClick={() => {
                onClose()
                if (onSendToTool) onSendToTool('transcriber', media.path)
              }}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-[#B0BA99] bg-[#EDE5CD]/60 py-2 px-2.5 text-xs font-semibold text-[#4E220F] hover:bg-[#9D6638] hover:text-[#FDFBF7] hover:border-[#9D6638] transition-all shadow-xs"
            >
              <FileText className="size-3.5" />
              <span>Transcribe</span>
            </button>

            <button
              onClick={() => {
                onClose()
                if (onSendToTool) onSendToTool('audio_processor', media.path)
              }}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-[#B0BA99] bg-[#EDE5CD]/60 py-2 px-2.5 text-xs font-semibold text-[#4E220F] hover:bg-[#9D6638] hover:text-[#FDFBF7] hover:border-[#9D6638] transition-all shadow-xs"
            >
              <Sliders className="size-3.5" />
              <span>Convert/Resample</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
