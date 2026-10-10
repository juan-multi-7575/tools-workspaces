import { useEffect, useState } from 'react'
import { api, errorMessage, resolveUrl, type ToolManifest } from '../../lib/api'

export const DEMUCS_ID = 'demucs'

/**
 * A `parameters_schema` entry. Demucs declares exactly one key and the backend
 * reads only that one, so this shape exists to bind the declared key rather
 * than to describe a family of settings.
 */
export interface FieldSpec {
  type?: string
  title?: string
  description?: string
  default?: unknown
}

/** The tool owns its manifest; read it rather than restating it. */
export function useDemucsManifest(): { manifest: ToolManifest | null; error: string | null } {
  const [manifest, setManifest] = useState<ToolManifest | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .getTool(DEMUCS_ID)
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
 * The file's own bytes, through the endpoint that serves artifacts.
 *
 * `/api/artifacts/content` in `backend/app/main.py` answers a `.zip` with a
 * `FileResponse` and only wraps text-ish suffixes (`.json`, `.txt`, `.md`,
 * `.log`, `.html`, `.csv`) in a JSON envelope. A `<audio src>` and a download
 * link both want the raw body, so both point here.
 */
export function artifactContentUrl(path: string): string {
  return resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(path)}`)
}

/**
 * The archive demucs actually returns.
 *
 * `DemucsTool.execute` in `backend/app/tools/mediainfo_tool.py` zips every file
 * under the destination into `stems.zip` and returns exactly one
 * `Artifact(path=<dest>/stems.zip, kind=audio, name="stems.zip")`. The kind
 * says `audio`, which is why it is worth naming the extension explicitly here:
 * the bytes behind it are a zip archive, not a sound file.
 */
export const STEMS_ARCHIVE_NAME = 'stems.zip'

/**
 * Whether a returned artifact's bytes are an audio file this page can hand to
 * an `<audio>` element.
 *
 * The backend labels the archive `kind=audio` even though the file is a zip, so
 * the decision is made on the extension rather than on the label: `stems.zip`
 * has to be downloaded and unpacked, and saying otherwise would be a play
 * button on an archive.
 */
export function isPlayableAudioName(name: string): boolean {
  return PLAYABLE_AUDIO_SUFFIXES.has(name.toLowerCase().slice(name.lastIndexOf('.') + 1))
}

const PLAYABLE_AUDIO_SUFFIXES = new Set([
  'wav', 'wave', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus', 'aif', 'aiff', 'weba', 'webm',
])

/**
 * What a returned artifact is, in the words the ledger uses for it.
 *
 * `archive` is the one case demucs produces: the stems are inside the file
 * rather than beside it. Anything else is served as bytes the page can hand
 * straight to a player.
 */
export type LedgerEntryKind = 'archive' | 'audio' | 'other'

export function ledgerEntryKind(name: string): LedgerEntryKind {
  if (name.toLowerCase().endsWith('.zip')) return 'archive'
  if (isPlayableAudioName(name)) return 'audio'
  return 'other'
}

/**
 * The catalogue caption for one ledger row.
 *
 * The archive's caption is the honest one and the reason this helper exists:
 * a completed demucs run hands back a single zip, so there is nothing here to
 * play. Every other row is playable bytes served from the artifact endpoint.
 */
export function ledgerCaption(name: string): string {
  return ledgerEntryKind(name) === 'archive'
    ? 'An archive. The separated stems are inside this file, not beside it — download and unpack it to reach them.'
    : 'Sound served from this machine. The play control reads the file itself through the artifact endpoint.'
}

/**
 * The stems this tool separates, named by the tool itself.
 *
 * `DemucsTool.manifest.description` in `backend/app/tools/mediainfo_tool.py`
 * reads "Isolate vocal, drum, bass, and instrumental stems from songs and audio
 * tracks using AI." That sentence is the backend's own account of what demucs
 * does in general — it is not a list of artifacts any run here returned, and the
 * ledger never presents it as one.
 */
export const DECLARED_STEMS = ['vocal', 'drum', 'bass', 'instrumental'] as const

/**
 * The command `DemucsTool.execute` builds, as the backend builds it:
 * `["demucs", "--out", str(dest), str(src)]`. Shown because it is the truth of
 * the tool — there is no model flag, no stem count and no format option.
 */
export const DEMUCS_COMMAND = 'demucs --out <destination> <source>'

/**
 * The wall label under the run: what a finished run gives back, in the words
 * the backend uses when it builds the single artifact.
 */
export const ARCHIVE_LEDGER_NOTE =
  'A finished run returns one file. The separated stems are inside it; the page lists what came back, not four separate artifacts.'

/**
 * The final line of a backend error, used as a short headline above the full
 * text. Python tracebacks end on the exception line, which is the part worth
 * reading first — but it is a substring of what the backend actually sent, never
 * a restatement of it.
 */
export function failureHeadline(error: string | null | undefined): string | null {
  if (!error) return null
  const lines = error
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  return lines.length > 0 ? lines[lines.length - 1] : null
}

/**
 * A playhead position for the source transport, read off the audio element's
 * own `currentTime`. A file that reports no position shows the em-dash pair
 * rather than a fabricated `00:00`.
 */
export function playhead(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
  const whole = Math.floor(seconds)
  const minutes = Math.floor(whole / 60)
  return `${String(minutes).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`
}

/** The media kinds the tool declares it takes, lowercased, for the picker. */
export const PICKABLE_SUFFIXES = new Set([
  'wav', 'wave', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus', 'aif', 'aiff',
  'mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'flv', 'mpg', 'mpeg', 'oggv', '3gp',
])
