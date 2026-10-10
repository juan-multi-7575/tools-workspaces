import { readdir, readFile } from 'node:fs/promises'

const SITES_DIR = new URL('../sites/', import.meta.url)

/**
 * Tool ids of the sites that exist on disk, read straight from the filesystem.
 *
 * The browser discovers sites with `import.meta.glob` in `siteModules.ts`, which
 * is a Vite transform and therefore unavailable under `node:test`. Reading the
 * directories here tests the same truth from outside the bundler, so the parity
 * assertions can run without pulling a Vite-only module into node.
 *
 * `toolId` is read out of each `site.ts` rather than taken from the directory
 * name, because the directory name is a route segment and the tool id is what
 * the backend and the briefs actually use.
 */
export async function discoverSiteIdsOnDisk(): Promise<string[]> {
  const entries = await readdir(SITES_DIR, { withFileTypes: true })
  const ids: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    let source: string
    try {
      source = await readFile(new URL(`${entry.name}/site.ts`, SITES_DIR), 'utf8')
    } catch {
      continue // a directory without site.ts is not a site
    }
    const match = source.match(/toolId:\s*'([^']+)'/)
    if (match) ids.push(match[1])
  }
  return ids.sort()
}

/** Route path segments of the sites that exist on disk. */
export async function discoverSitePathsOnDisk(): Promise<string[]> {
  const entries = await readdir(SITES_DIR, { withFileTypes: true })
  const paths: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      const source = await readFile(new URL(`${entry.name}/site.ts`, SITES_DIR), 'utf8')
      const match = source.match(/path:\s*'([^']+)'/)
      if (match) paths.push(match[1])
    } catch {
      continue
    }
  }
  return paths.sort()
}