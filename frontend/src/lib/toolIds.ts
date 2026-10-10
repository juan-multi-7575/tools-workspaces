/** Backend aliases belong here so graph code does not import form components. */
export const ALIASES: Readonly<Record<string, string>> = Object.freeze({
  downloader: 'media.download.yt-dlp',
  subtitle_translator: 'subtitle.translate.srt',
  ai_model_health_check: 'sys.health.check',
})

export function canonicalId(id: string): string {
  return Object.hasOwn(ALIASES, id) ? ALIASES[id] : id
}
