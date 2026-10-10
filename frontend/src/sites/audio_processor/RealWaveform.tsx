import { useEffect, useRef, useState } from 'react'
import { useWavesurfer } from '@wavesurfer/react'

export interface RealWaveformProps {
  /** A real bytes URL. Nothing here draws peaks that were not decoded. */
  url: string
  /** Bars either side of the centre line. */
  barWidth?: number
  barGap?: number
  barRadius?: number
  waveColor: string
  progressColor: string
  cursorColor: string
  /** The length the decoder reports for these bytes, in seconds. */
  onDuration?: (seconds: number) => void
  onError?: (message: string) => void
  /**
   * Called when the browser refuses to start playback. Swallowing that would
   * leave a Play button that looks live and a page that never makes a sound.
   */
  onPlayError?: (message: string) => void
  /**
   * Change this value to play or pause. It is a signal rather than a callback so
   * that the page can drive playback without holding the wavesurfer instance.
   */
  playToken?: number
  onPlayingChange?: (playing: boolean) => void
}

/**
 * The real waveform.
 *
 * `wavesurfer.js` fetches the file through `resolveUrl`, decodes it and draws
 * the peaks it decoded — there is no synthetic or pre-baked peak data anywhere
 * in this component, and no path that draws bars when a decode fails; a failure
 * reports upward and the page says so in place of a waveform.
 */
export default function RealWaveform({
  url,
  barWidth = 3,
  barGap = 2,
  barRadius = 2,
  waveColor,
  progressColor,
  cursorColor,
  onDuration,
  onError,
  onPlayError,
  playToken = 0,
  onPlayingChange,
}: RealWaveformProps) {
  const container = useRef<HTMLDivElement | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  /*
   * `height: 'auto'` hands wavesurfer this element's own client height, which the
   * stylesheet already fixes with a clamp. Passing a number instead means
   * changing the option later, and re-applying options mid-load aborts the
   * fetch in flight and throws a decode that was never actually broken.
   */
  const { wavesurfer, isReady } = useWavesurfer({
    container,
    url,
    height: 'auto',
    waveColor,
    progressColor,
    cursorColor,
    cursorWidth: 2,
    barWidth,
    barGap,
    barRadius,
    // Peaks are drawn top and bottom of a centre line, which is the way a
    // waveform is read; wavesurfer's own renderer does this by default.
    normalize: true,
  })

  // The decoder's own duration is the only length shown for a file; nothing on
  // this site reports one it did not read.
  useEffect(() => {
    if (!isReady || !wavesurfer) return
    const seconds = wavesurfer.getDuration()
    if (Number.isFinite(seconds) && seconds > 0) onDuration?.(seconds)
  }, [isReady, wavesurfer, onDuration])

  useEffect(() => {
    if (!wavesurfer) return
    const handle = (error: Error) => {
      // Switching between Source and Result aborts the load that was in flight.
      // That is a cancellation, not a file that failed to decode, and saying so
      // would blame the bytes for a request this page cancelled.
      if (error?.name === 'AbortError' || /aborted/i.test(error?.message ?? '')) return
      const message = error?.message ?? String(error)
      setFailed(message)
      onError?.(message)
    }
    wavesurfer.on('error', handle)
    return () => {
      wavesurfer.un('error', handle)
    }
  }, [wavesurfer, onError])

  // A new file is a new chance to decode; a stale failure must not stick.
  useEffect(() => {
    setFailed(null)
  }, [url])

  // Playback is driven from the page through a changing token, so nothing here
  // needs to own the instance or hand a ref out of the component.
  const firstToken = useRef(playToken)
  useEffect(() => {
    if (!wavesurfer || playToken === firstToken.current) return
    if (wavesurfer.isPlaying()) wavesurfer.pause()
    else
      void wavesurfer.play().catch((cause: unknown) => {
        onPlayError?.(cause instanceof Error ? cause.message : String(cause))
      })
  }, [wavesurfer, playToken, onPlayError])

  useEffect(() => {
    if (!wavesurfer || !onPlayingChange) return
    const report = () => onPlayingChange(wavesurfer.isPlaying())
    wavesurfer.on('play', report)
    wavesurfer.on('pause', report)
    wavesurfer.on('finish', report)
    return () => {
      wavesurfer.un('play', report)
      wavesurfer.un('pause', report)
      wavesurfer.un('finish', report)
    }
  }, [wavesurfer, onPlayingChange])

  /*
   * Re-lay the waveform out when the box changes size.   *
   * wavesurfer draws its canvas once, at whatever size the container happened to
   * be when the audio finished decoding, and only re-draws on a resize signal
   * from a `ResizeObserver`. A canvas is fixed pixels, so if the signal never
   * arrives the waveform is silently clipped by the box around it, and the page
   * shows a fraction of the file as though it were all of it.
   *
   * `setOptions` is the public way to ask for that re-draw. It must not be
   * passed a different `height` from React state: `useWavesurfer` lists every
   * option as an effect dependency, so a changing option tears the instance
   * down and rebuilds it, which aborts the decode in flight.
   */
  useEffect(() => {
    const element = container.current
    if (!wavesurfer || !element) return
    let frame = 0
    const relayout = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        wavesurfer.setOptions({ height: Math.max(1, Math.round(element.clientHeight)) })
      })
    }
    window.addEventListener('resize', relayout)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', relayout)
    }
  }, [wavesurfer])

  if (failed) {
    return (
      <p className="ap-wave__failed" role="alert">
        This file could not be decoded for the waveform. {failed}
      </p>
    )
  }

  return <div className="ap-wave__canvas" ref={container} />
}