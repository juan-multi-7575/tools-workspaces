import type { SiteModule } from './types'

/**
 * Discovers every built tool site from `src/sites/<tool>/site.ts`.
 *
 * BROWSER-ONLY. This uses `import.meta.glob`, which is a Vite transform that does
 * not exist under `node:test` — importing it from a test throws. Tests read the
 * site directories off the filesystem instead; see `src/tests/siteParity.test.ts`.
 *
 * Because discovery is a glob, adding a tool site is a change confined to one
 * directory. Nothing shared is edited, which is what lets several agents build
 * sites in parallel worktrees without colliding on a registry.
 */
const modules = import.meta.glob<{ default: SiteModule }>('./*/site.ts', { eager: true })

const sites: SiteModule[] = []
for (const namespace of Object.values(modules)) {
  const mod = namespace.default
  if (mod?.toolId && mod.Component) sites.push(mod)
}

if (import.meta.env?.DEV) {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const site of sites) {
    if (seen.has(site.toolId)) dupes.add(site.toolId)
    seen.add(site.toolId)
  }
  if (dupes.size) {
    // Loud on purpose: two site.ts files claiming one tool id is a merge
    // accident, and silently letting the last one win hides it.
    console.error(`[sites] duplicate site toolIds: ${[...dupes].join(', ')}`)
  }
}

/** Route path segment under `/t/` -> its lazily-loaded site. */
export const SITE_COMPONENTS: Record<string, SiteModule['Component']> = Object.fromEntries(
  sites.map((site) => [site.path, site.Component]),
)

/** Tool ids that have a built site. The home index reads this for availability. */
export const BUILT_SITE_IDS: ReadonlySet<string> = new Set(sites.map((site) => site.toolId))
