import { BESPOKE_PAGES } from './toolPageModules'
import type { ToolPageComponent } from './toolPageTypes'

export function getToolPage(id: string): ToolPageComponent | undefined {
  return Object.hasOwn(BESPOKE_PAGES, id) ? BESPOKE_PAGES[id] : undefined
}

export const TOOL_PAGE_IDS: readonly string[] = Object.keys(BESPOKE_PAGES)

export { BESPOKE_PAGES }
export type { ToolPageComponent }