import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { BUILT_SITE_IDS, SITE_COMPONENTS, SITE_TITLES } from './siteModules'
import type { SiteState } from './types'
import ErrorBoundary from '../components/common/ErrorBoundary'
import AppShell from './AppShell'
import { DEFAULT_DOCUMENT_TITLE, useDocumentTitle } from '../hooks/useDocumentTitle'

const HomeSite = lazy(() => import('./home/HomeSite'))

interface CarriedState {
  inputPath?: string
}

function ToolSiteRoute({ siteState }: { siteState: SiteState }) {
  const { toolId = '' } = useParams()
  const location = useLocation()
  const Site = SITE_COMPONENTS[toolId]
  const carried = (location.state as CarriedState | null)?.inputPath

  // WCAG 2.4.2: every tool route names itself. The registration is what
  // carries the wording, so a site cannot keep the shell's title.
  useDocumentTitle(SITE_TITLES[toolId] ?? DEFAULT_DOCUMENT_TITLE)

  // An unregistered id is a dead route, so it goes to the index rather than
  // rendering an empty page.
  if (!Site) return <Navigate to="/" replace />

  return <Site siteState={siteState} initialInputPath={carried} />
}

/**
 * The app's two surfaces. A standalone site is rendered with nothing around it;
 * everything else keeps the Tools Garage shell it always had.
 */
export default function App() {
  return (
    <ErrorBoundary name="Application">
      <Routes>
        <Route
          path="/"
          element={
            <Suspense fallback={<SiteLoading label="Loading the tool index…" />}>
              <HomeSite built={BUILT_SITE_IDS} />
            </Suspense>
          }
        />
        <Route
          path="/t/:toolId"
          element={
            <Suspense fallback={<SiteLoading label="Loading this tool…" />}>
              <ToolSiteRoute siteState="hero" />
            </Suspense>
          }
        />
        <Route
          path="/t/:toolId/workspace"
          element={
            <Suspense fallback={<SiteLoading label="Loading this workspace…" />}>
              <ToolSiteRoute siteState="workspace" />
            </Suspense>
          }
        />
        <Route path="*" element={<AppShell />} />
      </Routes>
    </ErrorBoundary>
  )
}

/**
 * A deliberately neutral, chrome-free holding state. A tool's own palette has
 * not loaded yet, so this invents none: it is the app's background and nothing
 * more.
 */
function SiteLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 12,
        color: 'rgba(23, 23, 23, 0.42)',
      }}
    >
      {label}
    </div>
  )
}