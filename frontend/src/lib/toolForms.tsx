import type { ComponentType } from 'react'
import DynamicForm from '../components/common/DynamicForm'
import DownloaderForm from '../components/tools/DownloaderForm'
import TranslatorForm from '../components/tools/TranslatorForm'
import ModelHealthCheckForm from '../components/tools/ModelHealthCheckForm'
import { canonicalId } from './toolIds'
export { canonicalId, ALIASES } from './toolIds'

export interface FormProps {
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
  availableArtifacts?: { name: string; path: string; kind?: string }[]
}

export const TOOL_FORMS: Readonly<Record<string, ComponentType<FormProps>>> = Object.freeze({
  'media.download.yt-dlp': DownloaderForm,
  'subtitle.translate.srt': TranslatorForm,
  'sys.health.check': ModelHealthCheckForm,
})

export function getToolForm(id: string): ComponentType<FormProps> | undefined {
  const canonical = canonicalId(id)
  return Object.hasOwn(TOOL_FORMS, canonical) ? TOOL_FORMS[canonical] : undefined
}

/** The fallback needs the manifest's schema; all consumers use this adapter. */
export function ToolForm({ toolId, schema, disabled, ...props }: FormProps & {
  toolId: string
  schema: Record<string, unknown>
  disabled?: boolean
}) {
  const Form = getToolForm(toolId)
  return (
    <fieldset disabled={disabled} className="min-w-0">
      {Form ? <Form {...props} /> : <DynamicForm schema={schema} {...props} />}
    </fieldset>
  )
}
