/**
 * Which tools have a standalone site, and what each one looks like.
 *
 * This is design metadata, not backend data: the tool list itself always comes
 * from `api.listTools()`. This table answers the questions the API cannot — what
 * should this entry's accent be, and is it an old id or a hosted helper.
 *
 * **This module is pure and imports nothing.** Site discovery lives in
 * `siteModules.ts` because `import.meta.glob` is a Vite transform that does not
 * exist under `node:test`; keeping it out of here is what lets the parity tests
 * import this table directly. Whether a site is *built* is passed in by the
 * caller from `siteModules.ts` — so building a tool is still a single-directory
 * change that this table picks up automatically, and parallel agents still
 * never edit a shared registry.
 */

export interface SiteDescriptor {
  /** Route under `/t/`. Only present when the site is actually built. */
  path?: string
  /**
   * The site's own accent. Read by the home index and applied as an inline
   * custom property, so one entry cannot repaint another.
   */
  accent: string
  /** What the home index says about this entry. Never a lie about availability. */
  availability: 'built' | 'planned' | 'alias' | 'hosted'
  /** For `alias` and `hosted`: the tool that really owns this id. */
  owner?: string
}

/**
 * Every tool with a brief in `docs/research/design-briefs.md`, in brief order.
 *
 * `path` is present only where a site actually exists. A planned tool has no
 * route, so it must not be able to advertise one — that is the difference
 * between "not yet built" and "a link to nowhere".
 */
const CANONICAL: Record<string, SiteDescriptor> = {
  'media.download.yt-dlp': { accent: '#0A7C7C', availability: 'planned' },
  trimmer: { accent: '#3B82F6', availability: 'planned' },
  transcriber: { accent: '#8A5A2B', availability: 'planned' },
  audio_processor: { accent: '#B4763A', availability: 'planned' },
  mediainfo: { accent: '#2563EB', availability: 'planned' },
  streamlink: { accent: '#FF4D00', availability: 'planned' },
  sox: { accent: '#E8A33D', availability: 'planned' },
  demucs: { accent: '#7A6A53', availability: 'planned' },
  'gallery-dl': { accent: '#8A8A8A', availability: 'planned' },
  imagemagick: { path: 'imagemagick', accent: '#0D99FF', availability: 'built' },
  exif_scrubber: { accent: '#0000EE', availability: 'planned' },
  pandoc: { accent: '#E4572E', availability: 'planned' },
  pdf_tools: { accent: '#C8102E', availability: 'planned' },
  ocrmypdf: { accent: '#00A0E9', availability: 'planned' },
  packager: { accent: '#C2703D', availability: 'planned' },
  summarizer: { accent: '#8A5A2B', availability: 'planned' },
  'subtitle.translate.srt': { accent: '#1F6FEB', availability: 'planned' },
  'text.translate.llm': { accent: '#B03A2E', availability: 'planned' },
  codec_tool: { accent: '#D9A400', availability: 'planned' },
  script_runner: { accent: '#171717', availability: 'planned' },
  'sys.health.check': { accent: '#5E6AD2', availability: 'planned' },
}

/**
 * Legacy ids the backend still registers. They are the same tools under old
 * names, so they inherit that tool's accent and say so rather than pretending
 * to be a twenty-second tool.
 */
const ALIASES: Record<string, string> = {
  downloader: 'media.download.yt-dlp',
  subtitle_translator: 'subtitle.translate.srt',
  ai_model_health_check: 'sys.health.check',
}

/**
 * Helper tools the backend registers but deliberately does not give a page of
 * its own — each one lives inside the downloader page it belongs to.
 */
const HOSTED: Record<string, string> = {
  'media.download.resolve': 'media.download.yt-dlp',
  'media.download.format_select': 'media.download.yt-dlp',
  'media.subtitle.fetch': 'media.download.yt-dlp',
  'media.thumbnail.get': 'media.download.yt-dlp',
}

const NEUTRAL: SiteDescriptor = { accent: '#A3A3A3', availability: 'planned' }

export function describeSite(toolId: string, built: ReadonlySet<string> = EMPTY): SiteDescriptor {
  const canonical = CANONICAL[toolId]
  const isBuilt = built.has(toolId)
  if (canonical) {
    return { ...canonical, availability: isBuilt ? 'built' : canonical.availability }
  }
  const aliasOwner = ALIASES[toolId]
  if (aliasOwner) {
    return { accent: CANONICAL[aliasOwner].accent, availability: 'alias', owner: aliasOwner }
  }
  const hostOwner = HOSTED[toolId]
  if (hostOwner) {
    return { accent: CANONICAL[hostOwner].accent, availability: 'hosted', owner: hostOwner }
  }
  // A tool the backend registers that no brief covers. It is real, so it is
  // listed; it just has no site and does not borrow somebody else's identity.
  return NEUTRAL
}

const EMPTY: ReadonlySet<string> = new Set()

/**
 * Short, because this text sits on all 28 rows. The index carries one legend
 * above the grid; repeating the full sentence per row turned a strict index
 * into a column of identical disclaimers.
 */
export const AVAILABILITY_LABEL: Record<SiteDescriptor['availability'], string> = {
  built: 'Open site',
  planned: 'Site not built',
  alias: 'Legacy id',
  hosted: 'Hosted in its parent',
}

/** The same four states, said once, where there is room to say them. */
export const AVAILABILITY_LEGEND: [SiteDescriptor['availability'], string][] = [
  ['built', 'has its own standalone site'],
  ['planned', 'briefed, site not built yet — not a link, because there is nowhere to go'],
  ['alias', 'an older id for a tool that is listed above it'],
  ['hosted', 'a helper the backend registers with no page of its own'],
]

