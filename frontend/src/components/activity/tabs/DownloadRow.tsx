import { memo } from 'react'
import { AlertCircle, Ban, Play, Copy, Check, Trash2 } from 'lucide-react'
import type { DownloadTask } from '../../../lib/api'
import { useDownloadProgress } from '../../../lib/activityStore'

interface DownloadRowProps {
  task: DownloadTask
  onCancel: (id: string) => void
  onRemove: (id: string) => void
  onPlayMedia?: (media: { name: string; path: string; kind?: string }) => void
  onCopyPath: (path: string) => void
  copiedPath: string | null
}

export const DownloadRow = memo(function DownloadRow({
  task: t,
  onCancel,
  onRemove,
  onPlayMedia,
  onCopyPath,
  copiedPath,
}: DownloadRowProps) {
  // Fine-grained row subscription: 200ms ticks only re-render THIS component
  const liveProgress = useDownloadProgress(t.id)

  const percent = liveProgress?.percent ?? (t.status === 'completed' ? 100 : 0)
  const speed = liveProgress?.speed
  const eta = liveProgress?.eta
  const isLive = t.status === 'running' || t.status === 'queued'

  return (
    <div className="rounded-xl border border-brand-sage bg-surface-white p-3 shadow-xs space-y-2.5 transition-all hover:border-brand-caramel/70">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`font-mono text-xs font-extrabold px-1.5 py-0.5 rounded border uppercase shrink-0 ${
                t.status === 'completed'
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  : t.status === 'running'
                  ? 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
                  : t.status === 'failed'
                  ? 'bg-rose-100 text-rose-900 border-rose-300'
                  : 'bg-brand-cream-dark text-brand-caramel-text border-brand-sage'
              }`}
            >
              {t.status}
            </span>
            <span className="font-mono text-xs text-brand-caramel-text truncate">
              ID: {t.id}
            </span>
          </div>

          <p className="font-mono text-xs font-bold text-brand-espresso truncate" title={t.params?.url}>
            {t.params?.url || 'Direct Download Task'}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isLive ? (
            <button
              onClick={() => onCancel(t.id)}
              className="inline-flex items-center gap-1 rounded border border-accent-contrast/40 bg-accent-contrast/10 px-2 py-1 text-xs font-semibold text-accent-contrast hover:bg-accent-contrast/20 transition-all"
              title="Cancel download"
            >
              <Ban className="size-2.5" />
              <span>Cancel</span>
            </button>
          ) : (
            <button
              onClick={() => onRemove(t.id)}
              className="p-1 text-brand-caramel-text/60 hover:text-accent-contrast hover:bg-brand-cream-dark rounded transition-colors"
              title="Dismiss record"
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar & Telemetry */}
      {isLive && (
        <div className="space-y-1">
          <div className="flex items-center justify-between font-mono text-xs text-brand-caramel-text">
            <span className="font-bold text-brand-espresso">{percent}%</span>
            <div className="flex items-center gap-2">
              {speed && <span>{speed}</span>}
              {eta && <span>ETA {eta}</span>}
            </div>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-cream-dark border border-brand-sage/40">
            <div
              className="h-full bg-brand-caramel transition-all duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {t.error && (
        <div className="rounded-lg border border-accent-contrast/30 bg-accent-contrast/10 p-2 font-mono text-xs text-accent-contrast leading-tight flex items-start gap-1.5">
          <AlertCircle className="size-3 shrink-0 mt-0.5" />
          <p className="break-all">{t.error}</p>
        </div>
      )}

      {/* Completed Download Quick Actions */}
      {t.status === 'completed' && (
        <div className="border-t border-brand-sage/40 pt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {onPlayMedia && (
              <button
                onClick={() =>
                  onPlayMedia({
                    name: `Task-${t.id}.mp4`,
                    path: `downloads/downloader/`,
                    kind: 'media',
                  })
                }
                className="inline-flex items-center gap-1 rounded bg-brand-caramel px-2 py-0.5 text-xs font-semibold text-brand-cream-light hover:bg-brand-caramel-hover transition-all"
              >
                <Play className="size-2.5 fill-current" />
                Play
              </button>
            )}
            <button
              type="button"
              onClick={() => onCopyPath(`downloads/downloader/`)}
              className="inline-flex items-center gap-1 rounded border border-brand-sage bg-brand-cream-dark px-2 py-0.5 text-xs font-semibold text-brand-espresso hover:bg-brand-sage/40 transition-all"
            >
              {copiedPath === `downloads/downloader/` ? (
                <>
                  <Check className="size-2.5 text-emerald-700" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="size-2.5 text-brand-caramel" />
                  <span>Path</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
})
