import { errorMessage } from '../../lib/api'

export function healthRowError(value: unknown) {
  if (!value) return ''
  return errorMessage(value) || (typeof value === 'object' && value !== null && 'message' in value ? String((value as { message: unknown }).message ?? '') : String(value))
}

export function healthStatusClass(status: unknown) {
  const normalized = String(status ?? '').toLowerCase()
  if (['healthy', 'ok', 'passed', 'success'].includes(normalized)) return 'mh-status-good'
  if (['unconfigured', 'skipped', 'unknown'].includes(normalized)) return 'mh-status-muted'
  if (['failed', 'error', 'auth_error', 'unhealthy', 'timeout'].includes(normalized)) return 'mh-status-bad'
  return 'mh-status-neutral'
}

export function healthRowDetail(row: { error?: unknown; tests_passed?: unknown; tests_failed?: unknown }) {
  const passed = Array.isArray(row.tests_passed) ? row.tests_passed : []
  const failed = Array.isArray(row.tests_failed) ? row.tests_failed : []
  const error = healthRowError(row.error)
  return [
    error ? `error: ${error}` : '',
    passed.length ? `passed: ${passed.join(', ')}` : '',
    failed.length ? `failed: ${failed.join(', ')}` : '',
  ].filter(Boolean).join(' · ')
}
