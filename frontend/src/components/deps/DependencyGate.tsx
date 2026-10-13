import { useEffect, useMemo, useState } from 'react'
import {
  Ban,
  CircleAlert,
  CircleCheck,
  Download,
  HardDrive,
  Loader2,
  Package,
  RotateCcw,
  TriangleAlert,
} from 'lucide-react'
import { deriveDepByteProgress, deriveDepProgress, type UseToolDeps } from '../../hooks/useToolDeps'
import { depDisplayBytes, formatBytes, shortDepVersion, type DepEntry, type DepStage } from '../../lib/depsApi'

export interface DependencyGateProps {
  toolId: string
  state: UseToolDeps
  /** Optional hue for the in-flight progress fill. Omit it and the gate still reads correctly. */
  accent?: string
  onReadyChange?: (ready: boolean) => void
}

const STAGE_LABEL: Record<DepStage, string> = {
  resolving: 'Resolving',
  downloading: 'Downloading',
  extracting: 'Extracting',
  installing: 'Installing',
  verifying: 'Verifying',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

const STAGE_TEXT_HUE: Record<DepStage, string> = {
  resolving: 'var(--dep-active-text)',
  downloading: 'var(--dep-active-text)',
  extracting: 'var(--dep-active-text)',
  installing: 'var(--dep-active-text)',
  verifying: 'var(--dep-active-text)',
  done: 'var(--dep-ok-text)',
  failed: 'var(--dep-bad-text)',
  cancelled: 'var(--dep-warn-text)',
}

function providesSentence(entry: DepEntry): string {
  if (entry.notes && entry.notes.trim() !== '') return entry.notes
  if (entry.provides.length === 0) return 'No commands declared by the backend for this dependency.'
  return `Provides the ${entry.provides.join(', ')} command${entry.provides.length === 1 ? '' : 's'}.`
}

function MissingDepRow({ entry }: { entry: DepEntry }) {
  const { bytes, measured } = depDisplayBytes(entry)
  const missingCommands = entry.missing_commands.length > 0 ? entry.missing_commands : []
  return (
    <li className="dep-gate__row py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold">{entry.dep_id}</span>
          <span
            className="rounded-md border px-1.5 py-0.5 font-mono text-[12px] uppercase tracking-wider text-current/70"
            style={{ borderColor: 'color-mix(in oklab, currentColor 22%, transparent)' }}
          >
            {entry.kind}
          </span>
          {entry.heavy && (
            <span
              className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[12px] font-semibold uppercase tracking-wider"
              style={{
                color: 'var(--dep-warn-text)',
                borderColor: 'color-mix(in oklab, var(--dep-warn) 45%, transparent)',
                backgroundColor: 'color-mix(in oklab, var(--dep-warn) 12%, transparent)',
              }}
            >
              <TriangleAlert className="size-3" aria-hidden="true" />
              Large download
            </span>
          )}
        </span>
        <span className="font-mono text-xs tabular-nums text-current/70">
          {bytes === null ? 'size unknown' : `${measured ? '' : 'about '}${formatBytes(bytes)}`}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-current/70">{providesSentence(entry)}</p>
      {missingCommands.length > 0 && (
        <p className="mt-1 text-xs leading-relaxed text-current/70">
          Still not found on disk: <span className="font-mono">{missingCommands.join(', ')}</span>
          {entry.reason ? <> — backend says “{entry.reason}”.</> : null}
        </p>
      )}
    </li>
  )
}

function ReadyChip({ state }: { state: UseToolDeps }) {
  const deps = state.data?.deps ?? []
  if (deps.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-current/70">
        <CircleCheck className="size-3.5 shrink-0" style={{ color: 'var(--dep-ok)' }} aria-hidden="true" />
        <span>No external dependencies — this tool runs on the Python already installed.</span>
      </p>
    )
  }
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-current/70">
      <CircleCheck className="size-3.5 shrink-0" style={{ color: 'var(--dep-ok)' }} aria-hidden="true" />
      <span>Ready —</span>
      {deps.map((entry, index) => {
        const short = shortDepVersion(entry.version)
        return (
          <span key={entry.dep_id} className="font-mono" title={entry.version ?? undefined}>
            {index > 0 ? ', ' : ''}
            {entry.dep_id}
            {short ? ` ${short}` : ''}
          </span>
        )
      })}
    </p>
  )
}

export default function DependencyGate({ toolId, state, accent, onReadyChange }: DependencyGateProps) {
  const [heavyConfirmed, setHeavyConfirmed] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const progress = useMemo(() => deriveDepProgress(state.events), [state.events])
  const byteProgress = useMemo(() => deriveDepByteProgress(progress, state.data?.deps), [progress, state.data])

  const missingEntries = useMemo(() => {
    const deps = state.data?.deps ?? []
    const missing = new Set(state.data?.missing ?? [])
    return deps.filter((entry) => missing.has(entry.dep_id))
  }, [state.data])

  const heavyMissing = useMemo(() => missingEntries.filter((entry) => entry.heavy), [missingEntries])

  // A changed dep set invalidates an earlier large-download consent.
  const missingKey = missingEntries.map((entry) => entry.dep_id).join('|')
  useEffect(() => {
    setHeavyConfirmed(false)
  }, [missingKey])

  useEffect(() => {
    setCancelling(false)
  }, [progress.status])

  useEffect(() => {
    onReadyChange?.(state.ready)
  }, [onReadyChange, state.ready])

  const jobError = state.error
  const failedDepId = progress.failedDepId
  const installing = state.status === 'installing'
  const activeDepId = installing ? byteProgress.activeDepId : null

  const installButton = () => {
    if (installing) {
      return (
        <button
          type="button"
          onClick={state.cancel}
          disabled={!progress.jobId || cancelling}
          className="inline-flex items-center gap-2 rounded-xl border border-current/25 px-3 py-2 text-xs font-semibold transition-colors hover:bg-current/10 disabled:opacity-45"
        >
          <Ban className="size-3.5" aria-hidden="true" />
          {cancelling || !progress.jobId ? 'Cancelling…' : 'Cancel install'}
        </button>
      )
    }
    const needsHeavyConfirm = heavyMissing.length > 0 && !heavyConfirmed
    const heavyBytes = heavyMissing.reduce((sum, entry) => sum + (depDisplayBytes(entry).bytes ?? 0), 0)
    return (
      <button
        type="button"
        onClick={() => {
          if (needsHeavyConfirm) {
            setHeavyConfirmed(true)
            return
          }
          state.install()
        }}
        disabled={missingEntries.length === 0}
        className="inline-flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-xs font-semibold transition-transform active:scale-[0.98] disabled:opacity-45"
        style={
          accent
            ? { borderColor: accent, backgroundColor: `color-mix(in oklab, ${accent} 16%, transparent)` }
            : {
                borderColor: 'currentColor',
                backgroundColor: 'color-mix(in oklab, currentColor 12%, transparent)',
              }
        }
      >
        {needsHeavyConfirm ? <TriangleAlert className="size-3.5" aria-hidden="true" /> : <Download className="size-3.5" aria-hidden="true" />}
        {needsHeavyConfirm
          ? `Confirm ${formatBytes(heavyBytes)} download`
          : jobError
            ? 'Try install again'
            : `Install ${missingEntries.length} ${missingEntries.length === 1 ? 'dependency' : 'dependencies'}`}
      </button>
    )
  }

  if (state.status === 'checking') {
    return (
      <div className="dep-gate dep-gate__panel px-3 py-2.5" data-dep-gate={toolId} data-dep-state="checking">
        <p className="flex items-center gap-2 text-xs text-current/70">
          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
          <span>Checking what this tool needs before you run it…</span>
        </p>
      </div>
    )
  }

  if (state.status === 'ready') {
    return (
      <div className="dep-gate" data-dep-gate={toolId} data-dep-state="ready">
        <ReadyChip state={state} />
      </div>
    )
  }

  // `status === 'error'` is only ever set by a failed dependency *check*, so
  // this branch cannot be confused with a failed install below.
  if (state.status === 'error') {
    return (
      <div className="dep-gate dep-gate__panel p-3" data-dep-gate={toolId} data-dep-state="check-failed">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CircleAlert className="size-4 shrink-0" style={{ color: 'var(--dep-bad)' }} aria-hidden="true" />
          Could not check dependencies
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-current/70">
          Run stays disabled because the backend never confirmed this tool&apos;s dependencies.
        </p>
        <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-current/70">
          {state.error ?? 'The dependency check returned no error message.'}
        </pre>
        <div className="mt-3">
          <button
            type="button"
            onClick={state.reload}
            className="inline-flex items-center gap-2 rounded-xl border border-current/25 px-3 py-2 text-xs font-semibold transition-colors hover:bg-current/10"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Retry the check
          </button>
        </div>
      </div>
    )
  }

  const percent = byteProgress.ratio === null ? null : Math.round(byteProgress.ratio * 100)

  return (
    <div className="dep-gate dep-gate__panel p-3" data-dep-gate={toolId} data-dep-state={installing ? 'installing' : 'missing'}>
      {installing ? (
        <>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Loader2 className="size-4 shrink-0 animate-spin" style={accent ? { color: accent } : { color: 'var(--dep-active)' }} aria-hidden="true" />
            Installing dependencies
          </h3>

          <div
            className="dep-gate__track mt-3 h-1.5 w-full rounded-full"
            style={{ backgroundColor: 'color-mix(in oklab, currentColor 12%, transparent)' }}
            role="progressbar"
            aria-label="Installed bytes"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
            aria-valuetext={
              byteProgress.totalBytes === 0
                ? 'Download size not reported by the backend'
                : `${formatBytes(byteProgress.completedBytes)} of ${formatBytes(byteProgress.totalBytes)} installed`
            }
          >
            <div
              className="dep-progress-bar h-full rounded-full"
              style={{
                width: `${percent ?? 0}%`,
                backgroundColor: accent ?? 'var(--dep-active)',
              }}
            />
            {activeDepId && (
              // Indeterminate: the backend streams stages, not byte offsets, so
              // a running dep gets a sweep rather than a fabricated percentage.
              <span className="dep-progress-sheen pointer-events-none absolute inset-0" aria-hidden="true" />
            )}
          </div>

          <p className="mt-2 font-mono text-[12px] tabular-nums text-current/70">
            {byteProgress.totalBytes === 0 ? (
              'byte totals not reported for this job'
            ) : (
              <>
                {formatBytes(byteProgress.completedBytes)} of {formatBytes(byteProgress.totalBytes)} installed
                {percent !== null ? ` · ${percent}%` : ''}
              </>
            )}
          </p>

          <ul className="dep-gate__scroll mt-2">
            {(progress.order.length > 0 ? progress.order : missingEntries.map((entry) => entry.dep_id)).map((depId) => {
              const entry = state.data?.deps.find((candidate) => candidate.dep_id === depId)
              const stage = progress.stageByDep[depId]
              const message = progress.messageByDep[depId]
              const { bytes, measured } = entry ? depDisplayBytes(entry) : { bytes: null, measured: false }
              const showMessage = stage === 'failed' || (stage !== 'done' && depId === activeDepId && message)
              return (
                <li key={depId} className="dep-gate__row flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-xs">{depId}</span>
                    <span className="text-xs font-semibold" style={{ color: stage ? STAGE_TEXT_HUE[stage] : undefined }}>
                      {stage ? STAGE_LABEL[stage] : 'Queued'}
                    </span>
                  </span>
                  <span className="font-mono text-[12px] tabular-nums text-current/70">
                    {bytes === null ? 'size unknown' : `${measured ? '' : 'about '}${formatBytes(bytes)}`}
                  </span>
                  {showMessage && (
                    <pre className="w-full break-words whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-current/70">
                      {message}
                    </pre>
                  )}
                </li>
              )
            })}
          </ul>

          {progress.status === 'cancelled' && (
            <p className="mt-2 text-xs leading-relaxed text-current/70" role="status">
              You cancelled the install. Nothing was reported as installed, so Run stays disabled until the check says otherwise.
            </p>
          )}
        </>
      ) : (
        <>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <HardDrive className="size-4 shrink-0" style={{ color: 'var(--dep-warn)' }} aria-hidden="true" />
            {missingEntries.length === 1 ? 'This tool needs 1 dependency' : `This tool needs ${missingEntries.length} dependencies`}
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-current/70">
            Run is disabled until they are installed — the backend would fail with “{'command not found'}” otherwise.
          </p>
        </>
      )}

      {jobError && (
        <div
          className="mt-3 rounded-xl border p-2.5"
          role="alert"
          style={{
            borderColor: 'color-mix(in oklab, var(--dep-bad) 45%, transparent)',
            backgroundColor: 'color-mix(in oklab, var(--dep-bad) 10%, transparent)',
          }}
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <CircleAlert className="size-3.5 shrink-0" style={{ color: 'var(--dep-bad)' }} aria-hidden="true" />
            {failedDepId ? `Install failed for ${failedDepId}` : 'The install did not complete'}
          </p>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-current/70">
            {jobError}
          </pre>
        </div>
      )}

      {missingEntries.length > 0 && !installing && (
        <>
          <div className="dep-gate__scroll mt-3">
            <ul>
              {missingEntries.map((entry) => (
                <MissingDepRow key={entry.dep_id} entry={entry} />
              ))}
            </ul>
          </div>
          <p className="mt-2 font-mono text-[12px] tabular-nums text-current/70">
            {state.missingBytes === 0
              ? 'the backend reported no download size for these'
              : `about ${formatBytes(state.missingBytes)} to download`}
          </p>
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {installButton()}
        {installing && (
          <span className="text-xs text-current/70">
            <Package className="mr-1 inline size-3.5 align-text-bottom" aria-hidden="true" />
            Nothing is claimed ready until the backend re-checks.
          </span>
        )}
        {!installing && missingEntries.length === 0 && (
          <button
            type="button"
            onClick={state.reload}
            className="inline-flex items-center gap-2 rounded-xl border border-current/25 px-3 py-2 text-xs font-semibold transition-colors hover:bg-current/10"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Re-check
          </button>
        )}
      </div>
    </div>
  )
}
