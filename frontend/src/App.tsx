import { useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Wrench, FolderTree, Settings, Smartphone, Terminal, Menu, X } from 'lucide-react'
import ToolsPage from './pages/ToolsPage'
import WorkspacesPage from './pages/WorkspacesPage'
import WorkspaceDetailPage from './pages/WorkspaceDetailPage'
import SettingsPage from './pages/SettingsPage'
import RemoteControlPage from './pages/RemoteControlPage'
import ActivitySidebar, { ActivityProvider } from './components/activity/ActivitySidebar'
import AudioPlayerModal, { type AudioPlayerMedia } from './components/audio/AudioPlayerModal'
import { cn } from './lib/utils'

const nav = [
  { to: '/', label: 'Tools', icon: Wrench },
  { to: '/workspaces', label: 'Workspaces', icon: FolderTree },
  { to: '/remote', label: 'Remote', icon: Smartphone },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function App() {
  const [activeMedia, setActiveMedia] = useState<AudioPlayerMedia | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const navigate = useNavigate()

  const handleSendToTool = (toolId: string, inputPath: string) => {
    navigate(`/?tool=${encodeURIComponent(toolId)}&input=${encodeURIComponent(inputPath)}`)
  }

  return (
    <ActivityProvider>
      <div className="flex flex-col md:flex-row h-full w-full bg-[#F7F1DE] text-[#4E220F] antialiased select-none font-sans overflow-hidden">
        {/* Mobile Top Navigation Header */}
        <header className="md:hidden flex h-14 shrink-0 items-center justify-between border-b border-[#B0BA99] bg-[#EDE5CD]/90 px-4 z-20 backdrop-blur-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-[#9D6638] text-[#FDFBF7] shadow-sm">
              <Terminal className="size-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-[#4E220F] flex items-center gap-1.5">
                Tools Garage
                <span className="h-1.5 w-1.5 rounded-full bg-[#9D6638]" />
              </span>
              <span className="font-mono text-[9px] text-[#7C5339] font-medium tracking-wide uppercase">
                v1.4.0 • Local
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileNavOpen((prev) => !prev)}
            aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="flex size-9 items-center justify-center rounded-xl border border-[#B0BA99] bg-[#F7F1DE] text-[#4E220F] hover:bg-[#B0BA99]/30 transition-colors shadow-2xs"
          >
            {mobileNavOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </header>

        {/* Mobile Sidebar Backdrop Overlay */}
        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 md:hidden backdrop-blur-xs transition-opacity"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Left Navigation Sidebar */}
        <aside
          className={cn(
            'border-r border-[#B0BA99] bg-[#EDE5CD]/95 md:bg-[#EDE5CD]/80 flex flex-col justify-between p-4 shadow-xs transition-all duration-200',
            'md:relative md:w-60 md:shrink-0 md:flex',
            mobileNavOpen
              ? 'fixed inset-y-0 left-0 z-40 w-64 shadow-2xl flex'
              : 'hidden md:flex',
          )}
        >
          <div className="flex flex-col gap-6">
            {/* Brand Header */}
            <div className="flex items-center justify-between px-2 py-1 border-b border-[#B0BA99]/60 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-xl bg-[#9D6638] text-[#FDFBF7] shadow-sm">
                  <Terminal className="size-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold tracking-tight text-[#4E220F] flex items-center gap-1.5">
                    Tools Garage
                    <span className="h-2 w-2 rounded-full bg-[#9D6638]" />
                  </span>
                  <span className="font-mono text-[10px] text-[#7C5339] font-medium tracking-wide uppercase">
                    v1.4.0 • Local
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="md:hidden flex size-8 items-center justify-center rounded-lg text-[#7C5339] hover:bg-[#B0BA99]/30 hover:text-[#4E220F] transition-colors"
                aria-label="Close navigation"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Navigation Links */}
            <nav className="flex flex-col gap-1.5">
              <div className="px-2 pb-1">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#7C5339] font-bold">
                  Platform
                </span>
              </div>
              {nav.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  onClick={() => setMobileNavOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-150 active:scale-[0.98]',
                      isActive
                        ? 'bg-[#9D6638] text-[#FDFBF7] shadow-sm font-bold'
                        : 'text-[#4E220F] hover:bg-[#B0BA99]/30 hover:text-[#4E220F] border border-transparent',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={cn(
                          'size-4 transition-colors duration-150',
                          isActive ? 'text-[#FDFBF7]' : 'text-[#7C5339] group-hover:text-[#4E220F]',
                        )}
                      />
                      <span className="tracking-tight">{label}</span>
                      {isActive && (
                        <span className="absolute right-2.5 h-1.5 w-1.5 rounded-full bg-[#FDFBF7]" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* System Telemetry Footer */}
          <div className="rounded-xl border border-[#B0BA99] bg-[#F7F1DE] p-3 shadow-2xs">
            <div className="flex items-center justify-between text-[10px] font-mono text-[#7C5339] mb-1 font-semibold">
              <span>ENGINE STATUS</span>
              <span className="flex items-center gap-1 text-[#4E220F] font-bold">
                <span className="h-1.5 w-1.5 rounded-full bg-[#9D6638] animate-pulse" />
                ONLINE
              </span>
            </div>
            <p className="text-[11px] font-mono text-[#4E220F] truncate font-medium">
              localhost:8000
            </p>
          </div>
        </aside>

        {/* Main Application Content Area */}
        <main className="flex-1 h-full min-h-0 overflow-hidden flex flex-col bg-[#F7F1DE] text-[#4E220F] min-w-0 w-full">
          <Routes>
            <Route path="/" element={<ToolsPage onOpenAudioPlayer={setActiveMedia} />} />
            <Route path="/workspaces" element={<WorkspacesPage />} />
            <Route path="/workspaces/:id" element={<WorkspaceDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/remote" element={<RemoteControlPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {/* Universal Right Activity / Progress Tracker Sidebar */}
        <ActivitySidebar onOpenAudioPlayer={setActiveMedia} onSendToTool={handleSendToTool} />

        {/* Standalone Audio Player Modal */}
        <AudioPlayerModal
          media={activeMedia}
          onClose={() => setActiveMedia(null)}
          onSendToTool={handleSendToTool}
        />
      </div>
    </ActivityProvider>
  )
}
