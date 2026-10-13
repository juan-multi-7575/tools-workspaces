import { useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate, useLocation } from 'react-router-dom'
import { Wrench, FolderTree, Settings, Smartphone, Terminal, Menu, X, HardDrive } from 'lucide-react'
import ToolsPage from '../pages/ToolsPage'
import ToolPageRouter from '../pages/ToolPageRouter'
import WorkspacesPage from '../pages/WorkspacesPage'
import WorkspaceDetailPage from '../pages/WorkspaceDetailPage'
import SettingsPage from '../pages/SettingsPage'
import DependencyManagerPanel from '../components/deps/DependencyManagerPanel'
import RemoteControlPage from '../pages/RemoteControlPage'
import ActivitySidebar, { ActivityProvider } from '../components/activity/ActivitySidebar'
import AudioPlayerModal, { type AudioPlayerMedia } from '../components/audio/AudioPlayerModal'
import { cn } from '../lib/utils'
import ErrorBoundary from '../components/common/ErrorBoundary'
import { useHealth } from '../hooks/useHealth'

const nav = [
  { to: '/tools', label: 'Tools', icon: Wrench },
  { to: '/workspaces', label: 'Workspaces', icon: FolderTree },
  { to: '/dependencies', label: 'Dependencies', icon: HardDrive },
  { to: '/remote', label: 'Remote', icon: Smartphone },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function AppShell() {
  return (
    <ErrorBoundary name="Application">
      <Shell />
    </ErrorBoundary>
  )
}

function Shell() {
  const [activeMedia, setActiveMedia] = useState<AudioPlayerMedia | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const navigate = useNavigate()
  const health = useHealth()
  const location = useLocation()

  const handleSendToTool = (toolId: string, inputPath: string) => {
    navigate(`/?tool=${encodeURIComponent(toolId)}&input=${encodeURIComponent(inputPath)}`)
  }

  return (
    <ActivityProvider>
      <div className="flex flex-col md:flex-row h-full w-full bg-brand-cream text-brand-espresso antialiased select-none font-sans overflow-hidden">
        {/* WCAG 2.4.1: the sidebar is ~20 tab stops deep, so the first thing a
            keyboard user reaches is a jump past all of it. It stays off-screen
            until focused, so the design is untouched. */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {/* Mobile Top Navigation Header */}
        <header className="md:hidden flex h-14 shrink-0 items-center justify-between border-b border-brand-sage bg-brand-cream-dark/90 px-4 z-sticky backdrop-blur-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-brand-caramel text-brand-cream-light shadow-sm">
              <Terminal className="size-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-brand-espresso flex items-center gap-1.5">
                Tools Garage
                <span className="h-1.5 w-1.5 rounded-full bg-brand-caramel" />
              </span>
              <span className="font-mono text-xs text-brand-caramel-text font-medium tracking-wide uppercase">
                {health.version ? `v${health.version}` : 'Version unavailable'} • Local
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileNavOpen((prev) => !prev)}
            aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="flex size-9 items-center justify-center rounded-xl border border-brand-sage bg-brand-cream text-brand-espresso hover:bg-brand-sage/30 transition-colors shadow-2xs"
          >
            {mobileNavOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </header>

        {/* Mobile Sidebar Backdrop Overlay */}
        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-overlay bg-black/40 md:hidden backdrop-blur-xs transition-opacity"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Left Navigation Sidebar */}
        <aside
          className={cn(
            'border-r border-brand-sage bg-brand-cream-dark/95 md:bg-brand-cream-dark/80 flex flex-col justify-between p-4 shadow-xs transition-all duration-200',
            'md:relative md:w-60 md:shrink-0 md:flex',
            mobileNavOpen
              ? 'fixed inset-y-0 left-0 z-drawer w-64 shadow-2xl flex'
              : 'hidden md:flex',
          )}
        >
          <div className="flex flex-col gap-6">
            {/* Brand Header */}
            <div className="flex items-center justify-between px-2 py-1 border-b border-brand-sage/60 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-xl bg-brand-caramel text-brand-cream-light shadow-sm">
                  <Terminal className="size-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold tracking-tight text-brand-espresso flex items-center gap-1.5">
                    Tools Garage
                    <span className="h-2 w-2 rounded-full bg-brand-caramel" />
                  </span>
                  <span className="font-mono text-xs text-brand-caramel-text font-medium tracking-wide uppercase">
                    {health.version ? `v${health.version}` : 'Version unavailable'} • Local
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="md:hidden flex size-8 items-center justify-center rounded-lg text-brand-caramel-text hover:bg-brand-sage/30 hover:text-brand-espresso transition-colors"
                aria-label="Close navigation"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Navigation Links */}
            <nav className="flex flex-col gap-1.5">
              <div className="px-2 pb-1">
                <span className="font-mono text-xs uppercase tracking-wider text-brand-caramel-text font-bold">
                  Platform
                </span>
              </div>
              {nav.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/tools'}
                  onClick={() => setMobileNavOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-150 active:scale-[0.98]',
                      isActive
                        ? 'bg-brand-caramel text-brand-cream-light shadow-sm font-bold'
                        : 'text-brand-espresso hover:bg-brand-sage/30 hover:text-brand-espresso border border-transparent',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={cn(
                          'size-4 transition-colors duration-150',
                          isActive ? 'text-brand-cream-light' : 'text-brand-caramel-text group-hover:text-brand-espresso',
                        )}
                      />
                      <span className="tracking-tight">{label}</span>
                      {isActive && (
                        <span className="absolute right-2.5 h-1.5 w-1.5 rounded-full bg-brand-cream-light" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* System Telemetry Footer */}
          <div className="rounded-xl border border-brand-sage bg-brand-cream p-3 shadow-2xs">
            <div className="flex items-center justify-between text-xs font-mono text-brand-caramel-text mb-1 font-semibold">
              <span>ENGINE STATUS</span>
              <span className="flex items-center gap-1 text-brand-espresso font-bold">
                <span className={cn("h-1.5 w-1.5 rounded-full", health.state === 'online' ? 'bg-success' : health.state === 'offline' ? 'bg-accent-contrast' : 'bg-brand-caramel animate-pulse')} />
                {health.state.toUpperCase()}
              </span>
            </div>
            <p className="text-xs font-mono text-brand-espresso truncate font-medium">
              {health.host}
            </p>
          </div>
        </aside>

        {/* Main Application Content Area */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 h-full min-h-0 overflow-hidden flex flex-col bg-brand-cream text-brand-espresso min-w-0 w-full"
        >
          <ErrorBoundary name="Application view" resetKey={location.pathname}>
          {/* The shell owns every surface except the standalone sites and the
              home index, which `src/App.tsx` routes before reaching here. Its
              catch-all goes to the catalog rather than to `/`, so a URL the
              shell does not recognise never bounces through the home site. */}
          <Routes>
            <Route path="/tools" element={<ToolsPage onOpenAudioPlayer={setActiveMedia} />} />
            <Route path="/tools/:toolId" element={<ToolPageRouter onOpenAudioPlayer={setActiveMedia} />} />
            <Route path="/workspaces" element={<WorkspacesPage />} />
            <Route path="/workspaces/:id" element={<WorkspaceDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/dependencies" element={<DependencyManagerPanel />} />
            <Route path="/remote" element={<RemoteControlPage />} />
            <Route path="*" element={<Navigate to="/tools" replace />} />
          </Routes>
          </ErrorBoundary>
        </main>

        {/* Universal Right Activity / Progress Tracker Sidebar */}
        <ErrorBoundary name="Activity">
          <ActivitySidebar onOpenAudioPlayer={setActiveMedia} onSendToTool={handleSendToTool} />
        </ErrorBoundary>

        {/* Standalone Audio Player Modal */}
        <ErrorBoundary name="Audio player" resetKey={activeMedia?.name}>
        <AudioPlayerModal
          media={activeMedia}
          onClose={() => setActiveMedia(null)}
          onSendToTool={handleSendToTool}
        />
        </ErrorBoundary>
      </div>
    </ActivityProvider>
  )
}
