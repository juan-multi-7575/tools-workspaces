import { errorMessage } from '../../lib/api'

export function healthRowError(value: unknown) {
  if (!value) return ''
  return errorMessage(value) || (typeof value === 'object' && value !== null && 'message' in value ? String((value as { message: unknown }).message ?? '') : String(value))
}
