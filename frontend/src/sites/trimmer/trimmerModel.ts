import { useEffect, useState } from 'react'
import { api, errorMessage, type ToolManifest } from '../../lib/api'

export const TRIMMER_ID = 'trimmer'

/**
 * A `parameters_schema` entry. The trimmer's own schema declares exactly one
 * key — `regions`, an array — and the array's *shape* (`{start, end}`, both in
 * seconds) is what the backend actually reads; see `TrimmerTool.execute` in
 * `backend/app/tools/downloader.py`.
 */
export interface FieldSpec {
  type?: string
  title?: string
  description?: string
  placeholder?: string
  enum?: (string | number)[]
  default?: unknown
}

/** One region of a file, in seconds. Both ends are inclusive-exclusive. */
export interface Region {
  start: number
  end: number
}

/** The tool owns its manifest; read it rather than restating it. */
export function useTrimmerManifest(): { manifest: ToolManifest | null; error: string | null } {
  const [manifest, setManifest] = useState<ToolManifest | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .getTool(TRIMMER_ID)
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

/** `12.5` -> `00:12.500`. Timecodes are read against the source, not the region. */
export function timecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--.---'
  const whole = Math.floor(seconds)
  const millis = Math.round((seconds - whole) * 1000)
  const minutes = Math.floor(whole / 60)
  const secs = whole % 60
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

export function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low
  return Math.min(high, Math.max(low, value))
}

/**
 * The word the timeline is set in. `C`, `U`, `T` cycled: the tool in one word,
 * at a size where the letterforms are the interface rather than a label for it.
 */
export const STRIP_WORD = ['C', 'U', 'T']

/**
 * Letters per second of a *dense* (unselected) stretch. A selected stretch gets
 * this times `SELECTED_DENSITY`, which is the whole design: the same glyphs at
 * the same size, and the selection reads purely as the space between them.
 */
export const LETTERS_PER_SECOND = 2.2
export const SELECTED_DENSITY = 0.38

export interface StripSegment {
  key: string
  start: number
  end: number
  inside: boolean
  letters: string[]
}

/**
 * Split `duration` into alternating unselected / selected stretches, ordered by
 * time. Each stretch carries exactly the number of glyphs its own length earns,
 * so a boundary in the type is a boundary in seconds.
 */
export function buildSegments(duration: number, regions: Region[]): StripSegment[] {
  const ordered = [...regions]
    .map((region) => ({
      start: clamp(Number(region.start), 0, duration),
      end: clamp(Number(region.end), 0, duration),
    }))
    .filter((region) => Number.isFinite(region.start) && Number.isFinite(region.end) && region.end > region.start)
    .sort((a, b) => a.start - b.start)

  const segments: StripSegment[] = []
  let cursor = 0
  ordered.forEach((region, index) => {
    if (region.start > cursor) {
      segments.push(segment(`out-${index}`, cursor, region.start, false))
    }
    segments.push(segment(`in-${index}`, region.start, region.end, true))
    cursor = Math.max(cursor, region.end)
  })
  if (cursor < duration) segments.push(segment('out-end', cursor, duration, false))
  return segments
}

function segment(key: string, start: number, end: number, inside: boolean): StripSegment {
  const seconds = end - start
  const density = LETTERS_PER_SECOND * (inside ? SELECTED_DENSITY : 1)
  const count = Math.max(inside ? 2 : 1, Math.round(seconds * density))
  const letters = Array.from({ length: count }, (_, index) => STRIP_WORD[index % STRIP_WORD.length])
  return { key, start, end, inside, letters }
}

/**
 * How many glyphs a stretch of the band can actually hold at the rendered size.
 *
 * `count` is what the stretch asks for; this is what the width allows. The
 * glyph is measured off the DOM rather than derived from the font size, because
 * the real system fallback is wider than Archivo Black and an overhanging
 * letterform is the one thing this design cannot have — the selection is read
 * from the space between letters, and a letter that overruns its slot takes
 * that space away.
 */
export function fitLetters(count: number, shareWidth: number, glyphWidth: number): number {
  if (shareWidth <= 0 || glyphWidth <= 0) return count
  return Math.max(2, Math.min(count, Math.floor(shareWidth / (glyphWidth * 1.02))))
}

/**
 * Drop glyphs a strip is too narrow to set without them colliding.
 *
 * `buildSegments` answers "how many glyphs does this stretch of time earn";
 * this answers "how many of those can this width actually hold". The letter is
 * measured from the rendered strip rather than assumed from the font size,
 * because the fallback face is wider than Archivo Black and a glyph that
 * overruns its slot is the one thing the whole design cannot allow — the
 * selection is read from the space, and space that has been eaten by a
 * neighbouring letterform is not space.
 *
 * A stretch always keeps at least one glyph, so a selected region never
 * disappears on a narrow screen; it simply stops being able to say much.
 */
export function fitSegments(
  segments: StripSegment[],
  duration: number,
  stripWidth: number,
  glyphWidth: number,
): StripSegment[] {
  if (duration <= 0 || stripWidth <= 0 || glyphWidth <= 0) return segments
  const slot = glyphWidth * 1.06
  return segments.map((entry) => {
    const seconds = entry.end - entry.start
    const share = (stripWidth * seconds) / duration
    const room = Math.floor(share / slot)
    const count = Math.max(1, Math.min(entry.letters.length, room))
    if (count === entry.letters.length) return entry
    return {
      ...entry,
      letters: Array.from({ length: count }, (_, index) => STRIP_WORD[index % STRIP_WORD.length]),
    }
  })
}