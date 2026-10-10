import { useEffect, useState } from 'react'
import { api, errorMessage, resolveUrl, type ToolManifest } from '../../lib/api'

export const TRANSCRIBER_ID = 'transcriber'

/**
 * A `parameters_schema` entry. The transcriber declares five keys; the backend
 * also reads an `input_path` it never declares, so the page binds that one too.
 */
export interface FieldSpec {
  type?: string
  typeName?: string
  title?: string
  description?: string
  enum?: (string | number)[]
  enumLabels?: Record<string, string>
  default?: unknown
}

/** The tool owns its manifest; read it rather than restating it. */
export function useTranscriberManifest(): { manifest: ToolManifest | null; error: string | null } {
  const [manifest, setManifest] = useState<ToolManifest | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .getTool(TRANSCRIBER_ID)
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

/** One subtitle cue as the backend wrote it into the `.srt`. */
export interface Cue {
  /** The block number the backend printed, which is also the SRT cue index. */
  number: number
  /** Seconds from the start of the file. */
  start: number
  end: number
  /**
   * The cue's lines joined back into one string. The backend wraps subtitle
   * text to a line length, and a transcript meant to be read wants sentences,
   * not the wrapping a player wants.
   */
  text: string
}

/**
 * Parse the SubRip the backend writes.
 *
 * `format_srt_timestamp` in `backend/app/tools/subtitles.py` is what produced
 * these lines, so the shape is known rather than guessed: an index, a
 * `HH:MM:SS,mmm --> HH:MM:SS,mmm` line, then the cue's own lines. A block that
 * does not parse is dropped rather than rendered as a broken cue, because a cue
 * with no timecode cannot be played or read as one.
 */
export function parseSrt(source: string): Cue[] {
  const cues: Cue[] = []
  for (const block of source.replace(/\r\n/g, '\n').trim().split(/\n{2,}/)) {
    const lines = block.split('\n').filter((line) => line.length > 0)
    if (lines.length < 2) continue
    const arrowAt = lines.findIndex((line) => line.includes('-->'))
    if (arrowAt < 1) continue
    const index = Number(lines[arrowAt - 1])
    if (!Number.isFinite(index)) continue
    const [rawStart, rawEnd] = lines[arrowAt].split('-->').map((part) => part.trim())
    const start = parseSrtStamp(rawStart)
    const end = parseSrtStamp(rawEnd)
    if (start === null || end === null) continue
    const text = lines
      .slice(arrowAt + 1)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) continue
    cues.push({ number: index, start, end, text })
  }
  return cues
}

/** `00:01:02,500` and `00:01:02.500` both appear; the separator is the only difference. */
function parseSrtStamp(stamp: string): number | null {
  const match = /^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})$/.exec(stamp)
  if (!match) return null
  const [, hours, minutes, seconds, millis] = match
  return (
    Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis.padEnd(3, '0')) / 1000
  )
}

/** The `[HH:MM:SS] line` form the backend writes for `timestamped_text`. */
export function parseTimestampedLines(source: string): { at: string; text: string }[] {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = /^\[([^\]]+)\]\s*(.*)$/.exec(line)
      return match ? { at: match[1], text: match[2].trim() } : { at: '', text: line }
    })
}

/** What the page managed to read back out of the files a run wrote. */
export type Transcript =
  | { kind: 'cues'; cues: Cue[]; path: string }
  | { kind: 'lines'; lines: { at: string; text: string }[]; path: string }
  | { kind: 'paragraphs'; paragraphs: string[]; path: string }

/**
 * Build the view model for a run from the bytes of the files it wrote.
 *
 * A `.srt` is preferred over any text file because it is the only output that
 * carries timings, and timings are what put the marginalia in the margin.
 */
export function transcriptFromFiles(
  files: { name: string; path: string; body: string }[],
): { transcript: Transcript | null; problem: string | null } {
  const srt = files.find((file) => file.name.endsWith('.srt'))
  if (srt) {
    const cues = parseSrt(srt.body)
    if (cues.length === 0) {
      return { transcript: null, problem: `${srt.name} held no cue this page could read.` }
    }
    return { transcript: { kind: 'cues', cues, path: srt.path }, problem: null }
  }

  const timestamped = files.find((file) => file.name.endsWith('_timestamped.txt'))
  if (timestamped) {
    const lines = parseTimestampedLines(timestamped.body)
    return {
      transcript: { kind: 'lines', lines, path: timestamped.path },
      problem: lines.length === 0 ? `${timestamped.name} was empty.` : null,
    }
  }

  const text = files.find((file) => file.name.endsWith('.txt'))
  if (text) {
    const paragraphs = text.body
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0)
    return {
      transcript: paragraphs.length > 0 ? { kind: 'paragraphs', paragraphs, path: text.path } : null,
      problem: paragraphs.length === 0 ? `${text.name} was empty.` : null,
    }
  }

  return { transcript: null, problem: null }
}

/** `10.380` -> `00:10.380`, for the left margin beside each cue. */
export function marginalTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--.--'
  const whole = Math.floor(seconds)
  const millis = Math.round((seconds - whole) * 1000)
  const minutes = Math.floor(whole / 60)
  const secs = whole % 60
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

/** A local file's bytes, through the endpoint that serves artifacts. */
export function artifactContentUrl(path: string): string {
  return resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(path)}`)
}

/**
 * Read an artifact's bytes as text.
 *
 * `/api/artifacts/content` answers in two shapes. A `.srt` or `.vtt` comes back
 * as the file itself; a `.txt` comes back wrapped in a `{ content, name, size,
 * kind }` envelope, because the route returns JSON for those extensions and a
 * `FileResponse` for the rest. Both are read here — a reader that assumed one
 * shape would set a JSON document's braces as if they were the transcription.
 */
export async function readArtifactText(path: string): Promise<string> {
  const response = await fetch(artifactContentUrl(path))
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  const body = await response.text()
  try {
    const envelope: unknown = JSON.parse(body)
    if (
      envelope !== null &&
      typeof envelope === 'object' &&
      typeof (envelope as { content?: unknown }).content === 'string'
    ) {
      return (envelope as { content: string }).content
    }
  } catch {
    // Not an envelope; the body is the file, which is the point.
  }
  return body
}

/**
 * The output file each mode writes, read off the backend rather than assumed.
 *
 * `output_mode` decides the suffix in `AudioToTextTool.execute`: `both` writes
 * subtitles *and* `{stem}_clean.txt`, `clean_text` writes `{stem}.txt`, and
 * `timestamped_text` writes `{stem}_timestamped.txt`. `task=translate` inserts
 * `.en` before the extension.
 */
export const MODE_OUTPUTS: Record<string, { label: string; extensions: string[] }> = {
  both: { label: 'subtitles and clean text', extensions: ['.srt', '.vtt', '_clean.txt'] },
  subtitles: { label: 'subtitles only', extensions: ['.srt', '.vtt'] },
  clean_text: { label: 'clean text only', extensions: ['.txt'] },
  timestamped_text: { label: 'timestamped text only', extensions: ['_timestamped.txt'] },
}

/** Whether a mode writes any subtitle file at all, and so has cues to set. */
export function modeWritesSubtitles(mode: string): boolean {
  return (MODE_OUTPUTS[mode]?.extensions ?? []).some((extension) => extension === '.srt')
}

/**
 * Whether `subtitle_style` can change anything for this mode.
 *
 * `build_smart_subtitles` uses the style only to wrap subtitle lines. The clean
 * and timestamped outputs are joined paragraphs and `[HH:MM:SS]` lines, which
 * the style never touches, so on those modes the setting is real but inert.
 */
export function styleAffectsOutput(mode: string): boolean {
  return modeWritesSubtitles(mode)
}

/**
 * What `provider: auto` actually does, read off the execute path: it tries
 * NVIDIA NIM when that key is present, then Groq, then a local faster-whisper,
 * and returns only a failure string naming all three. No run response carries
 * which provider answered, so the page cannot claim one did.
 */
export const AUTO_PROVIDER_ORDER = ['NVIDIA NIM', 'Groq', 'a local faster-whisper'] as const

export const READABLE_KINDS = new Set(['audio', 'video', 'document', 'text', 'any'])
