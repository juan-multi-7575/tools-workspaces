import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Ban,
  CircleAlert,
  Download,
  HardDrive,
  Loader2,
  Package,
  RefreshCw,
  Terminal,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import {
  depsApi,
  depDisplayBytes,
  errorMessage,
  formatBytes,
  type DepEntry,
  type DepEvent,
  type DepsInventory,
} from '../../lib/depsApi'
import { deriveDepByteProgress, deriveDepProgress } from '../../hooks/useToolDeps'

/**
 * Managed dependency console.
 *
 * Visual identity: a system instrumentation board, deliberately not a tool
 * page. It reads as machine state -- graphite ground, tabular readouts, one
 * accent for the live channel -- so it never gets confused with the warm cream
 * shell or with any tool's own faceplate. Every number below comes from
 * `GET /api/deps`; measured on-disk bytes are labelled as such and the catalog
 * estimate is labelled as an estimate, because the two are not the same figure.
 */

const SURFACE = '#0A0E11'
const PANEL = '#0F1418'
const BORDER = '#223038'
const CONTROL_BORDER = '#4E6B7A'

const STATUS_STYLE: Record<DepEntry['status'], { label: string; color: string }> = {
  installed: { label: 'installed', color: '#86EFAC' },
  stale: { label: 'stale', color: '#FCD34D' },
  missing: { label: 'missing', color: '#FCA5A5' },
}

function Readout({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-[#7C8F99]">{label}</p>
      <p className="mt-0.5 truncate font-mono text-sm tabular-nums font-semibold" style={tone ? { color: tone } : { color: '#DCE7EC' }}>
        {value}
      </p>
    </div>
  )
}

export default function DependencyManagerPanel() {
  const [inventory, setInventory] = useState<DepsInventory | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [events, setEvents] = useState<DepEvent[]>([])
  const [activeIds, setActiveIds] = useState<string[] | null>(null)
  const [busyDepId, setBusyDepId] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [heavyArmed, setHeavyArmed] = useState<string[]>([])
  const [nukeStep, setNukeStep] = useState<0 | 1 | 2>(0)
  const [nuking, setNuking] = useState(false)
  const mounted = useRef(true)
  const streamAbort = useRef<AbortController | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      streamAbort.current?.abort()
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const next = await depsApi.listDeps()
      if (!mounted.current) return
      setInventory(next)
    } catch (error) {
      if (!mounted.current) return
      setLoadError(errorMessage(error))
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const progress = useMemo(() => deriveDepProgress(events), [events])
  const byteProgress = useMemo(
    () => deriveDepByteProgress(progress, inventory?.deps ?? []),
    [progress, inventory],
  )
  const installing = activeIds !== null

  const startInstall = useCallback(
    async (ids: string[]) => {
      if (streamAbort.current || ids.length === 0) return
      const controller = new AbortController()
      streamAbort.current = controller
      setEvents([])
      setActionError(null)
      setActiveIds(ids)
      setConfirmRemove(null)
      setHeavyArmed([])
      try {
        await depsApi.install(
          ids,
          (event) => {
            if (!mounted.current) return
            setEvents((previous) => [...previous.slice(-499), event])
          },
          { signal: controller.signal },
        )
      } catch (error) {
        if (!mounted.current || controller.signal.aborted) return
        setActionError(errorMessage(error))
      } finally {
        if (mounted.current) {
          streamAbort.current = null
          setActiveIds(null)
          await refresh()
        }
      }
    },
    [refresh],
  )

  const removeOne = useCallback(
    async (entry: DepEntry) => {
      setBusyDepId(entry.dep_id)
      setActionError(null)
      try {
        await depsApi.remove(entry.dep_id)
        setConfirmRemove(null)
      } catch (error) {
        if (mounted.current) setActionError(errorMessage(error))
      } finally {
        if (mounted.current) {
          setBusyDepId(null)
          await refresh()
        }
      }
    },
    [refresh],
  )

  const nuke = useCallback(async () => {
    setNuking(true)
    setActionError(null)
    try {
      await depsApi.nuke()
      setNukeStep(0)
    } catch (error) {
      if (mounted.current) setActionError(errorMessage(error))
    } finally {
      if (mounted.current) {
        setNuking(false)
        await refresh()
      }
    }
  }, [refresh])

  const deps = inventory?.deps ?? []
  const totals = inventory?.totals
  const percent = byteProgress.ratio === null ? null : Math.round(byteProgress.ratio * 100)

  const installControl = (entry: DepEntry) => {
    const armed = heavyArmed.includes(entry.dep_id)
    const needsConsent = entry.heavy && !armed
    const label = installing
      ? 'installing…'
      : needsConsent
        ? `Confirm ${formatBytes(depDisplayBytes(entry).bytes)} download`
        : entry.status === 'installed'
          ? 'Re-install'
          : 'Install'
    return (
      <button
        key={entry.dep_id}
        type="button"
        disabled={installing}
        onClick={() => {
          if (needsConsent) {
            setHeavyArmed((previous) => [...previous, entry.dep_id])
            return
          }
          void startInstall([entry.dep_id])
        }}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono text-[12px] font-bold uppercase tracking-wider transition-colors hover:bg-white/10 disabled:opacity-40"
        style={{ border: `1px solid ${CONTROL_BORDER}`, color: needsConsent ? '#FCD34D' : '#5EEAD4' }}
      >
        {needsConsent ? <TriangleAlert className="size-3.5" aria-hidden="true" /> : <Download className="size-3.5" aria-hidden="true" />}
        {label}
      </button>
    )
  }

  return (
    <div className="dep-instrument h-full overflow-y-auto" style={{ backgroundColor: SURFACE, color: '#DCE7EC' }}>
      <div className="mx-auto w-full max-w-[1400px] space-y-4 px-4 py-5 sm:px-8">
        {/* ── board header ─────────────────────────────────────────────── */}
        <header className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between" style={{ borderColor: BORDER }}>
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2.5">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: '#5EEAD4', color: '#062B28' }}
              >
                <HardDrive className="size-4" />
              </span>
              <h1 className="text-xl font-bold tracking-tight">Managed dependencies</h1>
              {loading && <Loader2 className="size-4 animate-spin text-[#5EEAD4]" aria-label="Refreshing inventory" />}
            </div>
            <p className="max-w-3xl text-sm leading-relaxed text-[#93A7B1]">
              Every external tool the fleet shells out to, installed into an app-owned prefix. Removing a dependency
              breaks the tools listed against it, so this board always shows the blast radius before anything is deleted.
            </p>
            {inventory && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px] text-[#7C8F99]">
                <span className="flex items-center gap-1.5">
                  <Terminal className="size-3" aria-hidden="true" />
                  deps_root <span className="text-[#93A7B1]">{inventory.deps_root}</span>
                </span>
                <span>
                  micromamba{' '}
                  <span style={{ color: inventory.micromamba.installed ? '#86EFAC' : '#FCA5A5' }}>
                    {inventory.micromamba.installed ? 'installed' : 'not installed'}
                  </span>
                  {inventory.micromamba.version ? ` · ${inventory.micromamba.version}` : ''}
                </span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading || installing}
              className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 font-mono text-[12px] font-bold uppercase tracking-wider transition-colors hover:bg-white/10 disabled:opacity-40"
              style={{ border: `1px solid ${CONTROL_BORDER}`, color: '#DCE7EC' }}
            >
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Re-probe
            </button>
          </div>
        </header>

        {loadError && (
          <div
            role="alert"
            className="rounded-2xl p-3"
            style={{ border: '1px solid #7F3A3A', backgroundColor: 'rgba(252,165,165,0.08)' }}
          >
            <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#FCA5A5' }}>
              <CircleAlert className="size-4" aria-hidden="true" />
              The dependency inventory could not be read
            </p>
            <pre className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-[#93A7B1]">
              {loadError}
            </pre>
          </div>
        )}

        {actionError && (
          <div
            role="alert"
            className="rounded-2xl p-3"
            style={{ border: '1px solid #7F3A3A', backgroundColor: 'rgba(252,165,165,0.08)' }}
          >
            <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#FCA5A5' }}>
              <CircleAlert className="size-4" aria-hidden="true" />
              The backend refused the last action
            </p>
            <pre className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-[#93A7B1]">
              {actionError}
            </pre>
          </div>
        )}

        {/* ── totals ────────────────────────────────────────────────────── */}
        {totals && (
          <section
            className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl p-4 sm:grid-cols-3 lg:grid-cols-6"
            style={{ backgroundColor: PANEL, border: `1px solid ${BORDER}` }}
            aria-label="Dependency totals"
          >
            <Readout label="catalog entries" value={String(totals.total)} />
            <Readout label="installed" value={String(totals.installed)} tone="#86EFAC" />
            <Readout label="missing" value={String(totals.missing)} tone={totals.missing > 0 ? '#FCA5A5' : undefined} />
            <Readout label="stale" value={String(totals.stale)} tone={totals.stale > 0 ? '#FCD34D' : undefined} />
            <Readout label="heavy pending" value={String(totals.heavy_pending)} tone={totals.heavy_pending > 0 ? '#FCD34D' : undefined} />
            <Readout label="on disk (measured)" value={formatBytes(totals.measured_bytes)} />
          </section>
        )}

        {/* ── live install channel ──────────────────────────────────────── */}
        {installing && (
          <section
            className="rounded-2xl p-4"
            style={{ backgroundColor: PANEL, border: '1px solid #2A4A4A' }}
            aria-label="Install progress"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Loader2 className="size-4 animate-spin" style={{ color: '#5EEAD4' }} aria-hidden="true" />
                Installing {activeIds?.join(', ')}
              </h2>
              <button
                type="button"
                onClick={() => progress.jobId && void depsApi.cancelInstall(progress.jobId)}
                disabled={!progress.jobId}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 font-mono text-[12px] font-bold uppercase tracking-wider transition-colors hover:bg-white/10 disabled:opacity-40"
                style={{ border: `1px solid ${CONTROL_BORDER}`, color: '#DCE7EC' }}
              >
                <Ban className="size-3.5" aria-hidden="true" />
                {progress.jobId ? 'Cancel' : 'starting…'}
              </button>
            </div>

            <div
              className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full"
              style={{ backgroundColor: 'rgba(220,231,236,0.12)' }}
              role="progressbar"
              aria-label="Installed bytes"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent ?? undefined}
              aria-valuetext={
                byteProgress.totalBytes === 0
                  ? 'the backend reported no byte totals for this job'
                  : `${formatBytes(byteProgress.completedBytes)} of ${formatBytes(byteProgress.totalBytes)} installed`
              }
            >
              <div
                className="dep-progress-bar h-full rounded-full"
                style={{ width: `${percent ?? 0}%`, backgroundColor: '#5EEAD4' }}
              />
              {byteProgress.activeDepId && (
                <span className="dep-progress-sheen pointer-events-none absolute inset-0" aria-hidden="true" />
              )}
            </div>
            <p className="mt-2 font-mono text-[12px] tabular-nums text-[#93A7B1]">
              {byteProgress.totalBytes === 0
                ? 'byte totals not reported for this job'
                : `${formatBytes(byteProgress.completedBytes)} of ${formatBytes(byteProgress.totalBytes)} installed${
                    percent !== null ? ` · ${percent}%` : ''
                  }`}
            </p>

            <ul className="mt-3 space-y-1">
              {progress.order.map((depId) => {
                const stage = progress.stageByDep[depId]
                const message = progress.messageByDep[depId]
                return (
                  <li key={depId} className="flex flex-wrap items-baseline justify-between gap-2 text-[12px]">
                    <span className="font-mono">{depId}</span>
                    <span
                      className="font-mono font-semibold"
                      style={{
                        color:
                          stage === 'done'
                            ? '#86EFAC'
                            : stage === 'failed'
                              ? '#FCA5A5'
                              : stage === 'cancelled'
                                ? '#FCD34D'
                                : '#5EEAD4',
                      }}
                    >
                      {stage ?? 'queued'}
                    </span>
                    {message && stage !== 'done' && (
                      <pre className="w-full whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-[#7C8F99]">
                        {message}
                      </pre>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* ── the inventory ─────────────────────────────────────────────── */}
        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Catalog</h2>
            <p className="font-mono text-[12px] text-[#7C8F99]">
              {deps.length} entr{deps.length === 1 ? 'y' : 'ies'}
            </p>
          </div>

          {deps.length === 0 && !loading && (
            <p
              className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-[#93A7B1]"
              style={{ borderColor: CONTROL_BORDER }}
            >
              {loadError
                ? 'Nothing to show until the inventory request succeeds.'
                : 'The backend reported an empty catalog.'}
            </p>
          )}

          {deps.map((entry) => {
            const { bytes, measured } = depDisplayBytes(entry)
            const style = STATUS_STYLE[entry.status] ?? STATUS_STYLE.missing
            const removing = busyDepId === entry.dep_id
            const confirming = confirmRemove === entry.dep_id
            const breaks = entry.dependents
            return (
              <article
                key={entry.dep_id}
                className="rounded-2xl p-4"
                style={{ backgroundColor: PANEL, border: `1px solid ${BORDER}` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-mono text-sm font-bold">{entry.dep_id}</h3>
                      <span
                        className="rounded-md border px-1.5 py-0.5 font-mono text-[12px] uppercase tracking-wider"
                        style={{ borderColor: CONTROL_BORDER, color: '#93A7B1' }}
                      >
                        {entry.kind}
                      </span>
                      <span
                        className="rounded-md border px-1.5 py-0.5 font-mono text-[12px] font-bold uppercase tracking-wider"
                        style={{ borderColor: 'currentColor', color: style.color }}
                      >
                        {style.label}
                      </span>
                      {entry.heavy && (
                        <span
                          className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[12px] font-bold uppercase tracking-wider"
                          style={{ borderColor: '#FCD34D', color: '#FCD34D' }}
                        >
                          <TriangleAlert className="size-3" aria-hidden="true" />
                          heavy
                        </span>
                      )}
                    </div>

                    {entry.notes && (
                      <p className="max-w-3xl text-xs leading-relaxed text-[#93A7B1]">{entry.notes}</p>
                    )}

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
                      <Readout
                        label="on disk (measured)"
                        value={measured && bytes !== null ? formatBytes(bytes) : 'not installed'}
                      />
                      <Readout
                        label="install estimate"
                        value={formatBytes(entry.approx_bytes)}
                      />
                      <Readout label="version" value={entry.version ?? 'unknown'} />
                      <Readout
                        label="installed at"
                        value={entry.installed_at ? new Date(entry.installed_at).toLocaleString() : 'never'}
                      />
                    </dl>

                    {entry.provides.length > 0 && (
                      <p className="font-mono text-[12px] text-[#7C8F99]">
                        provides <span className="text-[#93A7B1]">{entry.provides.join(', ')}</span>
                        {entry.missing_commands.length > 0 && (
                          <>
                            {' '}· not found: <span style={{ color: '#FCA5A5' }}>{entry.missing_commands.join(', ')}</span>
                          </>
                        )}
                      </p>
                    )}

                    {entry.reason && (
                      <p className="font-mono text-[12px]" style={{ color: '#FCD34D' }}>
                        backend reason: {entry.reason}
                      </p>
                    )}

                    <p className="text-xs text-[#93A7B1]">
                      {breaks.length === 0 ? (
                        'No registered tool depends on this entry.'
                      ) : (
                        <>
                          Removing it breaks{' '}
                          <span className="font-mono" style={{ color: '#FCD34D' }}>
                            {breaks.join(', ')}
                          </span>
                          .
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {installControl(entry)}
                    <button
                      type="button"
                      disabled={installing || removing || entry.status === 'missing'}
                      onClick={() => setConfirmRemove(entry.dep_id)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono text-[12px] font-bold uppercase tracking-wider transition-colors hover:bg-white/10 disabled:opacity-40"
                      style={{ border: `1px solid ${CONTROL_BORDER}`, color: '#FCA5A5' }}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      {removing ? 'removing…' : 'Remove'}
                    </button>
                  </div>
                </div>

                {confirming && (
                  <div
                    className="mt-3 rounded-xl p-3"
                    style={{ border: '1px solid #7F3A3A', backgroundColor: 'rgba(252,165,165,0.08)' }}
                    role="alertdialog"
                    aria-label={`Confirm removing ${entry.dep_id}`}
                  >
                    <p className="text-sm font-semibold">
                      Delete <span className="font-mono">{entry.dep_id}</span> from disk?
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-[#93A7B1]">
                      {breaks.length === 0
                        ? 'No registered tool depends on it.'
                        : `It currently provides a command for: ${breaks.join(', ')}. Those tools will fail to run until it is installed again.`}
                      {measured && bytes !== null ? ` This frees about ${formatBytes(bytes)} of measured on-disk bytes.` : ''}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void removeOne(entry)}
                        disabled={removing}
                        className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 font-mono text-[12px] font-bold uppercase tracking-wider disabled:opacity-40"
                        style={{ backgroundColor: '#FCA5A5', color: '#3B0A0A' }}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        {removing ? 'Removing…' : `Yes, delete ${entry.dep_id}`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(null)}
                        disabled={removing}
                        className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 font-mono text-[12px] font-bold uppercase tracking-wider transition-colors hover:bg-white/10 disabled:opacity-40"
                        style={{ border: `1px solid ${CONTROL_BORDER}`, color: '#DCE7EC' }}
                      >
                        Keep it
                      </button>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </section>

        {/* ── nuke ──────────────────────────────────────────────────────── */}
        {inventory && (
          <section
            className="rounded-2xl p-4"
            style={{ backgroundColor: PANEL, border: `1px solid ${nukeStep > 0 ? '#7F3A3A' : BORDER}` }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Package className="size-4" style={{ color: '#FCA5A5' }} aria-hidden="true" />
                  Delete the whole dependency root
                </h2>
                <p className="max-w-3xl text-xs leading-relaxed text-[#93A7B1]">
                  Removes micromamba, every prefix, the package cache and the install manifest under{' '}
                  <span className="font-mono break-all">{inventory.deps_root}</span>
                  {totals ? ` — about ${formatBytes(totals.measured_bytes)} of measured bytes.` : '.'} Every tool that
                  shells out to an external command stops working until you install again.
                </p>
              </div>

              {nukeStep === 0 && (
                <button
                  type="button"
                  disabled={installing || nuking}
                  onClick={() => setNukeStep(1)}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 font-mono text-[12px] font-bold uppercase tracking-wider transition-colors hover:bg-white/10 disabled:opacity-40"
                  style={{ border: `1px solid ${CONTROL_BORDER}`, color: '#FCA5A5' }}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Delete everything
                </button>
              )}

              {nukeStep > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={nuking}
                    onClick={() => void nuke()}
                    className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 font-mono text-[12px] font-bold uppercase tracking-wider disabled:opacity-40"
                    style={{ backgroundColor: '#FCA5A5', color: '#3B0A0A' }}
                  >
                    {nuking ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="size-3.5" aria-hidden="true" />}
                    {nuking ? 'Deleting…' : nukeStep === 1 ? 'Yes, delete the deps root' : 'Confirm again to be certain'}
                  </button>
                  <button
                    type="button"
                    disabled={nuking}
                    onClick={() => setNukeStep((step) => (step === 2 ? 1 : 0))}
                    className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 font-mono text-[12px] font-bold uppercase tracking-wider transition-colors hover:bg-white/10 disabled:opacity-40"
                    style={{ border: `1px solid ${CONTROL_BORDER}`, color: '#DCE7EC' }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {nukeStep === 1 && (
              <p className="mt-2.5 text-xs font-semibold" style={{ color: '#FCD34D' }}>
                This cannot be undone and there is no undo button. Click the button again to confirm.
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
