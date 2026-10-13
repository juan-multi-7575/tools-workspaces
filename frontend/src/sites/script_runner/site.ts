import { lazy } from 'react'
import type { SiteModule } from '../types'

const ScriptRunnerSite: SiteModule = {
  toolId: 'script_runner',
  path: 'script_runner',
  accent: '#171717',
  title: 'Script Runner — local scripts',
  Component: lazy(() => import('./ScriptRunnerSite')),
}

export default ScriptRunnerSite
