export interface SubtitleCue {
  id: string | null
  ordinal: number
  timestamp: string
  text: string
}

export interface ParsedSubtitles {
  format: 'srt' | 'vtt'
  cues: SubtitleCue[]
}

export interface CuePair {
  source?: SubtitleCue
  translation?: SubtitleCue
  state: 'same' | 'changed' | 'missing' | 'extra'
}

export function cueHasFailedIndex(cue: SubtitleCue, failedIndices: Set<string>, format: 'srt' | 'vtt'): boolean {
  const numericId = cue.id !== null && /^\d+$/.test(cue.id) ? cue.id : null
  if (format === 'srt' && cue.id !== null) return numericId !== null && failedIndices.has(numericId)
  const backendIndex = numericId ?? String(cue.ordinal)
  return failedIndices.has(backendIndex)
}

const TIMING = /^\s*((?:\d{2}:)?\d{2}:\d{2}[,.]\d{3})\s+-->\s+((?:\d{2}:)?\d{2}:\d{2}[,.]\d{3})(.*)$/

export function parseSubtitleCues(input: string): ParsedSubtitles {
  const normalized = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const isVtt = /^WEBVTT(?:\s|$)/.test(normalized)
  const blocks = normalized.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean)
  const cues: SubtitleCue[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    if (isVtt && (lines[0].startsWith('WEBVTT') || lines[0].startsWith('NOTE') || lines[0].startsWith('STYLE') || lines[0].startsWith('REGION'))) continue
    let timingIndex = lines.findIndex((line) => TIMING.test(line))
    if (timingIndex < 0) throw new Error('Subtitle cue is missing a valid timestamp line.')
    const match = lines[timingIndex].match(TIMING)
    if (!match) throw new Error('Subtitle cue is missing a valid timestamp line.')
    if (!isVtt && (!match[1].includes(':') || match[1].split(':').length !== 3 || !match[2].includes(':') || match[2].split(':').length !== 3)) {
      throw new Error('SubRip timestamps must use HH:MM:SS,mmm format.')
    }
    const candidateId = timingIndex > 0 ? lines[timingIndex - 1].trim() : ''
    const id = candidateId || null
    const text = lines.slice(timingIndex + 1).join('\n').replace(/\n+$/, '')
    if (!text) throw new Error('Subtitle cue is missing its text.')
    cues.push({ id: id || null, ordinal: cues.length + 1, timestamp: `${match[1]} --> ${match[2]}${match[3]}`, text })
  }
  if (!cues.length && normalized.trim()) throw new Error('No valid subtitle cues were found.')
  return { format: isVtt ? 'vtt' : 'srt', cues }
}

export function alignSubtitleCues(source: SubtitleCue[], translation: SubtitleCue[]): CuePair[] {
  const pairedCount = Math.min(source.length, translation.length)
  const rows = source.map((cue, index): CuePair => {
    const translated = translation[index]
    if (!translated) return { source: cue, state: 'missing' }
    return { source: cue, translation: translated, state: cue.text === translated.text ? 'same' : 'changed' }
  })
  translation.slice(pairedCount).forEach((cue) => rows.push({ translation: cue, state: 'extra' }))
  return rows
}
