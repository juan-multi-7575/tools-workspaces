import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { api, errorMessage, type ToolManifest } from '../../lib/api'
import { AVAILABILITY_LABEL, AVAILABILITY_LEGEND, describeSite } from '../registry'
import './home.css'

const NO_SITES: ReadonlySet<string> = new Set()

/**
 * The entry point: a strict grid of every tool the backend registers, each row
 * wearing its own site's accent. A tool with no site yet is stated as having
 * none and is not a link, because a link to a route that does not exist is a
 * lie about what this app can do.
 *
 * `built` arrives as a prop rather than an import so that this component stays
 * free of `siteModules.ts`, whose `import.meta.glob` is a Vite transform that
 * does not exist under `node:test`. `App` owns the glob and passes the result
 * in; the default keeps a bare render honest — nothing claims to be built that
 * the caller did not say was.
 */
export default function HomeSite({ built = NO_SITES }: { built?: ReadonlySet<string> } = {}) {
  const [tools, setTools] = useState<ToolManifest[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    api
      .listTools(controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setTools(response.tools)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(cause))
      })
    return () => controller.abort()
  }, [])

  const builtCount = tools?.filter((tool) => describeSite(tool.id, built).availability === 'built').length ?? 0

  return (
    <div className="hs-root">
      <div className="hs-shell">
        <header className="hs-head">
          <div className="hs-mark">
            <p className="hs-mark__title">Tool index</p>
            <p className="hs-mark__note">local · single user</p>
          </div>
          <h1 className="hs-lede">
            Every tool the backend registers, <em>in its own colours.</em>
          </h1>
          <div className="hs-links">
            <Link className="hs-link" to="/tools">
              Full catalog
            </Link>
            <Link className="hs-link" to="/dependencies">
              Dependencies
            </Link>
          </div>
        </header>

        {error && (
          <p className="hs-state hs-state--bad" role="alert">
            The tool list could not be read. The backend said:
            <pre>{error}</pre>
          </p>
        )}

        {tools === null && !error && <p className="hs-state">Reading the tool registry from the backend…</p>}

        {tools !== null && (
          <>
            <p className="hs-section">
              {tools.length} registered · {builtCount} with a standalone site
            </p>
            <ul className="hs-legend">
              {AVAILABILITY_LEGEND.map(([state, meaning]) => (
                <li key={state}>
                  <span className="hs-legend__key">{AVAILABILITY_LABEL[state]}</span>
                  {meaning}
                </li>
              ))}
            </ul>
            <ol className="hs-grid">
              {tools.map((tool, index) => {
                const site = describeSite(tool.id, built)
                const live = site.availability === 'built'
                const swatch = (
                  <span className="hs-row__accent" aria-hidden="true" />
                )
                const content = (
                  <>
                    <span className="hs-row__index hs-mono">{String(index + 1).padStart(2, '0')}</span>
                    <span className="hs-row__body">
                      <span className="hs-row__name">
                        {swatch} {tool.name}
                      </span>
                      <span className="hs-row__id">{tool.id}</span>
                    </span>
                    <span className="hs-row__end">
                      <span className="hs-row__state">{AVAILABILITY_LABEL[site.availability]}</span>
                      <span className="hs-row__cat">{tool.category ?? '—'}</span>
                    </span>
                  </>
                )

                const style = {
                  // One accent per row, applied inline: no row can repaint
                  // another, and the grid itself stays neutral.
                  '--row-accent': site.accent,
                  '--row-accent-wash': `color-mix(in oklab, ${site.accent} 9%, transparent)`,
                } as CSSProperties

                return live && site.path ? (
                  <li key={tool.id}>
                    <Link
                      className="hs-row hs-row--live"
                      to={`/t/${encodeURIComponent(site.path)}`}
                      style={style}
                    >
                      {content}
                    </Link>
                  </li>
                ) : (
                  <li key={tool.id}>
                    {/* Rendered, not linked: this tool has no site to open. */}
                    <div className="hs-row" style={style}>
                      {content}
                    </div>
                  </li>
                )
              })}
            </ol>
          </>
        )}

        <footer className="hs-foot">
          <span>
            A tool&apos;s accent comes from its own design brief, so the variety of the set is
            visible before you enter any of it.
          </span>
        </footer>
      </div>
    </div>
  )
}