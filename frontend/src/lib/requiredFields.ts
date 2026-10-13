import { canonicalId } from './toolIds'

/**
 * The client-side half of required-field validation.
 *
 * Backend rejections are already announced (`ToolResultPanel`), but an empty
 * required parameter should never cost a round-trip in the first place. This
 * module is the decision half of that gate: what counts as missing, which
 * parameters are missing, and how the resulting message reads. The rendering
 * half is `RequiredFieldError`, so a page that hand-rolls its own required
 * field (the downloader's URL, the SoX rack's input path) uses the same
 * wording and the same announcement as the schema-driven form instead of
 * writing prose about what the backend will say.
 */

export interface SchemaFieldLike {
  type?: string
  title?: string
  default?: unknown
  required?: boolean
}

export interface MissingRequiredField {
  key: string
  /** The field's `title` when it has one, otherwise the schema key. */
  label: string
}

/**
 * Parameters the backend answers `<key> is required` for, per tool id.
 *
 * Today's manifests declare no `required` at all, so a gate that read only the
 * schema would never fire. These are the ones the backend is known to reject
 * when empty — each entry is a behaviour the tool page already documented in
 * prose, moved here so the client can say it first.
 */
const BACKEND_REQUIRED_PARAMS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'media.download.yt-dlp': ['url'],
  sox: ['input_path'],
})

/** An empty string, nothing at all, or a blank-only string is not a value. */
export function isRequiredValueMissing(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  return false
}

/**
 * Whether one parameter is required for this tool.
 *
 * The manifest's own `required` flag wins; `BACKEND_REQUIRED_PARAMS` covers the
 * keys the backend rejects but the schema does not declare. Nothing is inferred
 * from a type or a key name, because a guessed constraint the backend never had
 * is a worse bug than no gate at all.
 */
export function isRequiredKey(toolId: string, key: string, field?: SchemaFieldLike): boolean {
  if (field?.required) return true
  return BACKEND_REQUIRED_PARAMS[canonicalId(toolId)]?.includes(key) ?? false
}

/** Required parameters of `schema` that `value` leaves empty. */
export function missingRequiredFields(
  schema: Record<string, unknown>,
  value: Record<string, unknown>,
  toolId: string,
): MissingRequiredField[] {
  const missing: MissingRequiredField[] = []
  for (const [key, rawField] of Object.entries(schema ?? {})) {
    const field = (rawField ?? {}) as SchemaFieldLike
    if (!isRequiredKey(toolId, key, field)) continue
    if (!isRequiredValueMissing(value?.[key])) continue
    missing.push({ key, label: field.title || key })
  }
  return missing
}

/** The one sentence a required-field error always says. */
export function missingRequiredMessage(missing: MissingRequiredField[]): string {
  if (missing.length === 0) return ''
  const labels = missing.map((field) => field.label)
  const names =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
  return `${names} ${labels.length === 1 ? 'is' : 'are'} required before this tool can run.`
}
