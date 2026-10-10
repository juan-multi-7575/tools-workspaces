import type { ComponentType, LazyExoticComponent } from 'react'

/** The two states every standalone tool site has (D2). */
export type SiteState = 'hero' | 'workspace'

export interface SiteProps {
  siteState: SiteState
  /** A path the hero already uploaded, carried across in the router state. */
  initialInputPath?: string
}

/**
 * What a site directory must export from its own `site.ts`.
 *
 * This shape exists so that adding a tool site is a *single-directory* change.
 * The loader discovers `src/sites/*\/site.ts` with `import.meta.glob`, so a new
 * tool never edits a shared registry — which is what lets several agents work
 * in parallel worktrees without colliding on one file.
 */
export interface SiteModule {
  /** Backend tool id. Must match `manifest.id` exactly. */
  toolId: string
  /** Path segment under `/t/`. Conventionally the tool id. */
  path: string
  /**
   * The site's own accent, declared here so the home index can show the variety
   * of the set before you enter any of it. Read from the brief.
   */
  accent: string
  Component: ComponentType<SiteProps> | LazyExoticComponent<ComponentType<SiteProps>>
}