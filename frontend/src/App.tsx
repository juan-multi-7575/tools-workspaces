import { NavLink, Route, Routes } from 'react-router-dom'
import { Wrench, FolderTree, Settings } from 'lucide-react'
import ToolsPage from './pages/ToolsPage'
import WorkspacesPage from './pages/WorkspacesPage'
import WorkspaceDetailPage from './pages/WorkspaceDetailPage'
import SettingsPage from './pages/SettingsPage'
import { cn } from './lib/utils'

const nav = [
  { to: '/', label: 'Tools', icon: Wrench },
  { to: '/workspaces', label: 'Workspaces', icon: FolderTree },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function App() {
  return (
    <div className="flex h-full bg-garage-950 text-slate-100">
      <aside className="w-56 shrink-0 border-r border-garage-800 bg-garage-900/60 p-4 flex flex-col gap-1">
        <div className="flex items-center gap-2 px-2 pb-6 pt-2">
          <img src="/src/assets/icon-garage.png" alt="Tools Garage" className="h-8 w-8" />
          <span className="text-lg font-black tracking-tight text-slate-50">
            Tools <span className="text-port-in">Garage</span>
          </span>
        </div>
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-garage-800 text-white'
                  : 'text-slate-400 hover:bg-garage-800/60 hover:text-slate-100',
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        <Routes>
          <Route path="/" element={<ToolsPage />} />
          <Route path="/workspaces" element={<WorkspacesPage />} />
          <Route path="/workspaces/:id" element={<WorkspaceDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
