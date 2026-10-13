import { lazy } from 'react'
import type { SiteModule } from '../types'

const HealthCheckSite: SiteModule = {
  toolId: 'sys.health.check',
  path: 'sys.health.check',
  accent: '#5E6AD2',
  title: 'System Health Check — model probe',
  Component: lazy(() => import('./HealthCheckSite')),
}

export default HealthCheckSite
