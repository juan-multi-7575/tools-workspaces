import { useEffect, useState } from 'react'
import { api, errorMessage, resolveUrl, type ToolManifest } from '../../lib/api'

export const AUDIO_PROCESSOR_ID = 'audio_processor'

/** A `parameters_schema` entry, narrowed to the shapes this tool declares. */
export interface FieldSpec {
  type?: string
  title?: string
  description?: string
  placeholder?: string
  enum?: (string | number)[]
  unit?: string
  default?: unknown
}

/** Formats the artifact index lists that this tool can actually read. */
export const READABLE_KINDS = new Set([
  'wav', 'mp3', 'flac', 'ogg', 'm4a', 'aac', 'wma', 'aiff', 'aif', 'opus',
  'mp4', 'webm', 'mov', 'mkv', 'avi', 'flv', 'ogv', 'm4v',
])

export function useAudioProcessorManifest(): { manifest: ToolManifest | null; error: string | null } {
  const [manifest, setManifest] = useState<ToolManifest | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .getTool(AUDIO_PROCESSOR_ID)
      .then((value) => {
        if (active) setManifest(value)
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause))
      })
    return () => {
      active = false
    }
  }, [])

  return { manifest, error }
}

/**
 * The one URL that serves a file's bytes. `/api/artifacts/content` answers 206
 * to a Range request, which is what both the waveform decoder and the audio
 * modal need; it is used for every playable artifact on this site rather than
 * a route assumed from another tool's modal.
 */
export function artifactAudioUrl(path: string): string {
  return resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(path)}`)
}

/**
 * What the backend actually does to every file it is handed, read off
 * `backend/app/tools/audio_processor.py`: it drops the video stream with `-vn`
 * and forces `-ac 2`, so the output is always two channels whatever the source
 * was. The page says so rather than leaving someone to assume the source's
 * channel count survived.
 */
export const ALWAYS_STEREO = true