export function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const LANG_NAMES: Record<string, string> = {
  en: 'English', ko: 'Korean', es: 'Spanish', fr: 'French', de: 'German',
  ja: 'Japanese', zh: 'Chinese', pt: 'Portuguese', ru: 'Russian', hi: 'Hindi',
  ar: 'Arabic', it: 'Italian', nl: 'Dutch', pl: 'Polish', tr: 'Turkish', vi: 'Vietnamese',
}

/** "video.en.srt" -> English; "…_translated.srt" -> English · translated. Role is only claimed when the name says so. */
export function describeSubtitleTrack(name: string): { language: string | null; role: 'translated' | 'original' | null } {
  const lower = name.toLowerCase()
  const role = lower.includes('translat')
    ? 'translated'
    : lower.includes('.orig.') || lower.includes('original')
    ? 'original'
    : null
  for (const [code, label] of Object.entries(LANG_NAMES)) {
    const re = new RegExp(`[._\\-]${code}[._\\-]`)
    if (re.test(lower) || lower.includes(label.toLowerCase())) {
      return { language: label, role }
    }
  }
  return { language: null, role: null }
}

export function subtitleTrackLabel(name: string, size: number): string {
  const { language, role } = describeSubtitleTrack(name)
  if (!language) return `${name} · ${formatSize(size)}`
  return role ? `${language} · ${role} · ${formatSize(size)}` : `${language} · ${formatSize(size)}`
}

/** Prefer the human bundle/video title over a bare run hash. */
export function runDisplayName(group: { pipeline_name: string; bundle_name?: string; pipeline_run_id: string }): string {
  if (group.bundle_name) return group.bundle_name
  if (group.pipeline_name && group.pipeline_name !== group.pipeline_run_id) return group.pipeline_name
  return `Run ${group.pipeline_run_id.slice(0, 8)}`
}
