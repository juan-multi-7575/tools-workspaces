import { lazy } from 'react'
import type { SiteModule } from '../types'

/**
 * The ImageMagick site's registration. This is the file a new tool site copies.
 *
 * It exists as its own module so that building a tool site is a change confined
 * to `src/sites/<tool>/` — `sites.ts` discovers this with `import.meta.glob`, so
 * nothing shared needs editing and parallel agents cannot collide on a registry.
 *
 * `lazy()` keeps the route bundle split (D7): a tool's code and CSS only ship
 * when someone opens that tool. It is declared synchronously so this module is
 * safe to import from the node:test SSR renderer.
 */
const ImageMagickSite: SiteModule = {
  toolId: 'imagemagick',
  path: 'imagemagick',
  // Brief #10, reference `figma`. Blue accent on a near-white ground.
  accent: '#0D99FF',
  title: 'ImageMagick — image bench',
  Component: lazy(() => import('./ImageMagickSite')),
}

export default ImageMagickSite