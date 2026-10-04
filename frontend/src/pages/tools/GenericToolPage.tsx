import { useMemo, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useToolExecute } from '../../hooks/useToolExecute'
import ToolPageShell from '../../components/tools/ToolPageShell'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import { ToolForm } from '../../lib/toolForms'
import type { ToolPageProps } from '../../lib/toolPageTypes'

/**
 * Schema-driven fallback page. Guarantees full parameter coverage for any tool
 * that has no bespoke page in `BESPOKE_PAGES`. Bespoke pages must look nothing
 * like this arrangement.
 */
export default function GenericToolPage({
  manifest,
  initialParams,
  initialInputPath,
  onComplete,
  onSendToTool,
  onOpenAudioPlayer,
}: ToolPageProps) {
  const execute = useToolExecute(manifest.id)
  const [params, setParams] = useState<Record<string, unknown>>(() =>
    initialInputPath ? { ...initialParams, input_path: initialInputPath } : initialParams,
  )
  const schemaKeys = useMemo(() => Object.keys(manifest.parameters_schema ?? {}), [manifest])

  const submit = async () => {
    const result = await execute.run(params)
    if (result && result.status === 'completed') onComplete?.(result, params)
  }

  return (
    <ToolPageShell
      manifest={manifest}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-xs text-brand-caramel-text">
            {schemaKeys.length} parameter{schemaKeys.length === 1 ? '' : 's'} sent to the backend
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={execute.reset}
              disabled={execute.busy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-brand-sage bg-surface-white px-3 py-2 text-xs font-bold text-brand-espresso disabled:opacity-40"
            >
              <RotateCcw className="size-3.5" /> Clear results
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={execute.busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-caramel px-4 py-2 text-xs font-bold text-brand-cream-light disabled:opacity-50"
            >
              <Play className="size-3.5 fill-current" />
              {execute.busy ? `Running… ${execute.state.elapsedSeconds.toFixed(1)}s` : `Run ${manifest.name}`}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <ToolForm
          toolId={manifest.id}
          schema={manifest.parameters_schema}
          value={params}
          onChange={setParams}
          disabled={execute.busy}
        />
        {execute.state.phase !== 'idle' && (
          <ToolResultPanel
            state={execute.state}
            toolId={manifest.id}
            toolName={manifest.name}
            onRerun={() => execute.reset()}
            onSendToTool={onSendToTool}
            onOpenAudioPlayer={onOpenAudioPlayer}
          />
        )}
      </div>
    </ToolPageShell>
  )
}