import type { ToolPageComponent } from './toolPageTypes'

/**
 * Bespoke per-tool pages. Append-only: each batch adds its own keys.
 * The four atomic media helpers (`media.download.resolve`,
 * `media.download.format_select`, `media.subtitle.fetch`,
 * `media.thumbnail.get`) are intentionally absent — they are rendered as
 * sections inside the downloader page, per the approved design.
 */
export const BESPOKE_PAGES: Record<string, ToolPageComponent> = {}