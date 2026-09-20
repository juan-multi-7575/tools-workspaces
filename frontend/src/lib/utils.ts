export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

export function cleanOptions(o: object): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === '' || v === false) continue
    out[k] = v
  }
  return out
}

export function formatFileName(name: string, maxLen = 36): string {
  if (!name || name.length <= maxLen) return name || ''
  const lastDot = name.lastIndexOf('.')
  const ext = lastDot !== -1 ? name.slice(lastDot) : ''
  const base = lastDot !== -1 ? name.slice(0, lastDot) : name
  const keepFront = Math.floor((maxLen - ext.length - 3) * 0.55)
  const keepBack = Math.max(4, maxLen - ext.length - 3 - keepFront)
  return `${base.slice(0, keepFront)}...${base.slice(-keepBack)}${ext}`
}

export function getArtifactBadge(name: string): { label: string; color: string } {
  const lower = (name || '').toLowerCase()
  if (lower.endsWith('.en.srt')) return { label: 'EN SRT', color: 'bg-amber-100 text-amber-900 border-amber-300' }
  if (lower.endsWith('.ko.srt')) return { label: 'KO SRT', color: 'bg-indigo-100 text-indigo-900 border-indigo-300' }
  if (lower.endsWith('.srt')) return { label: 'SRT', color: 'bg-amber-100 text-amber-900 border-amber-300' }
  if (lower.endsWith('.vtt')) return { label: 'VTT', color: 'bg-sky-100 text-sky-900 border-sky-300' }
  if (lower.includes('clean.txt')) return { label: 'CLEAN TXT', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' }
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return { label: 'DOC', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' }
  if (['.mp4', '.mkv', '.webm', '.mov'].some((ext) => lower.endsWith(ext))) {
    return { label: 'VIDEO', color: 'bg-purple-100 text-purple-900 border-purple-300' }
  }
  if (['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.opus', '.aac'].some((ext) => lower.endsWith(ext))) {
    return { label: 'AUDIO', color: 'bg-orange-100 text-orange-900 border-orange-300' }
  }
  const ext = name.split('.').pop()?.toUpperCase() || 'FILE'
  return { label: ext, color: 'bg-[#EDE5CD] text-[#4E220F] border-[#B0BA99]' }
}

export function formatTimeAgo(timestamp: number): string {
  const elapsedSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (elapsedSec < 10) return 'just now'
  if (elapsedSec < 60) return `${elapsedSec}s ago`
  const elapsedMin = Math.floor(elapsedSec / 60)
  if (elapsedMin < 60) return `${elapsedMin}m ago`
  const elapsedHours = Math.floor(elapsedMin / 60)
  return `${elapsedHours}h ago`
}


