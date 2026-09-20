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
    <div className="rounded-xl border border-[#B0BA99] bg-[#FFFFFF] p-3 shadow-xs space-y-2.5 transition-all hover:border-[#9D6638]/70">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`font-mono text-[9px] font-extrabold px-1.5 py-0.5 rounded border uppercase shrink-0 ${
                t.status === 'completed'
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  : t.status === 'running'
                  ? 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
                  : t.status === 'failed'
                  ? 'bg-rose-100 text-rose-900 border-rose-300'
                  : 'bg-[#EDE5CD] text-[#7C5339] border-[#B0BA99]'
              }`}
            >
              {t.status}
            </span>
            <span className="font-mono text-[10px] text-[#7C5339] truncate">
              ID: {t.id}
            </span>
          </div>

          <p className="font-mono text-xs font-bold text-[#4E220F] truncate" title={t.params?.url}>
            {t.params?.url || 'Direct Download Task'}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isLive ? (
            <button
              onClick={() => onCancel(t.id)}
              className="inline-flex items-center gap-1 rounded border border-[#A83232]/40 bg-[#A83232]/10 px-2 py-1 text-[10px] font-semibold text-[#A83232] hover:bg-[#A83232]/20 transition-all"
              title="Cancel download"
            >
              <Ban className="size-2.5" />
              <span>Cancel</span>
            </button>
          ) : (
            <button
              onClick={() => onRemove(t.id)}
              className="p-1 text-[#7C5339]/60 hover:text-[#A83232] hover:bg-[#EDE5CD] rounded transition-colors"
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
          <div className="flex items-center justify-between font-mono text-[10px] text-[#7C5339]">
            <span className="font-bold text-[#4E220F]">{percent}%</span>
            <div className="flex items-center gap-2">
              {speed && <span>{speed}</span>}
              {eta && <span>ETA {eta}</span>}
            </div>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EDE5CD] border border-[#B0BA99]/40">
            <div
              className="h-full bg-[#9D6638] transition-all duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {t.error && (
        <div className="rounded-lg border border-[#A83232]/30 bg-[#A83232]/10 p-2 font-mono text-[10px] text-[#A83232] leading-tight flex items-start gap-1.5">
          <AlertCircle className="size-3 shrink-0 mt-0.5" />
          <p className="break-all">{t.error}</p>
        </div>
      )}

      {/* Completed Download Quick Actions */}
      {t.status === 'completed' && (
        <div className="border-t border-[#B0BA99]/40 pt-2 flex items-center justify-between gap-2">
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
                className="inline-flex items-center gap-1 rounded bg-[#9D6638] px-2 py-0.5 text-[10px] font-semibold text-[#FDFBF7] hover:bg-[#86542C] transition-all"
              >
                <Play className="size-2.5 fill-current" />
                Play
              </button>
            )}
            <button
              type="button"
              onClick={() => onCopyPath(`downloads/downloader/`)}
              className="inline-flex items-center gap-1 rounded border border-[#B0BA99] bg-[#EDE5CD] px-2 py-0.5 text-[10px] font-semibold text-[#4E220F] hover:bg-[#B0BA99]/40 transition-all"
            >
              {copiedPath === `downloads/downloader/` ? (
                <>
                  <Check className="size-2.5 text-emerald-700" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="size-2.5 text-[#9D6638]" />
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
