import React, { useState } from 'react'
import { Clock } from 'lucide-react'
import type { DownloadTask } from '../../../lib/api'
import { DownloadRow } from './DownloadRow'

interface DownloadsTabProps {
  tasks: DownloadTask[]
  filterQuery: string
  onCancel: (id: string) => void
  onRemove: (id: string) => void
  onPlayMedia?: (media: { name: string; path: string; kind?: string }) => void
  onBrowseFiles?: () => void
}

export const DownloadsTab: React.FC<DownloadsTabProps> = ({
  tasks,
  filterQuery,
  onCancel,
  onRemove,
  onPlayMedia,
  onBrowseFiles,
}) => {
  const [copiedPath, setCopiedPath] = useState<string | null>(null)

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopiedPath(text)
    setTimeout(() => setCopiedPath(null), 2000)
  }

  const filtered = tasks.filter((t) => {
    if (!filterQuery) return true
    const q = filterQuery.toLowerCase()
    return (
      t.id.toLowerCase().includes(q) ||
      (t.params?.url && t.params.url.toLowerCase().includes(q)) ||
      (t.status && t.status.toLowerCase().includes(q))
    )
  })

  if (filtered.length === 0) {
    const recentCompleted = !filterQuery
      ? tasks.filter((t) => t.status === 'completed').slice(0, 3)
      : []
    return (
      <div className="space-y-2">
        <div className="rounded-xl border border-dashed border-brand-sage bg-brand-cream-dark/40 p-6 text-center text-brand-caramel-text text-xs font-mono space-y-2">
          <Clock className="mx-auto size-6 text-brand-caramel mb-1 opacity-60" />
          <p>{filterQuery ? 'No matching downloads found.' : 'Nothing downloading.'}</p>
          {!filterQuery && (
            <p>
              Completed files land in{' '}
              <button onClick={onBrowseFiles} className="font-bold text-brand-caramel underline underline-offset-2 hover:text-brand-caramel-hover">
                Saved Files →
              </button>
            </p>
          )}
        </div>
        {recentCompleted.length > 0 && (
          <div className="space-y-2">
            <p className="font-mono text-xs font-bold uppercase tracking-wider text-brand-caramel-text px-1">
              Recently completed
            </p>
            {recentCompleted.map((task) => (
              <DownloadRow
                key={task.id}
                task={task}
                onCancel={onCancel}
                onRemove={onRemove}
                onPlayMedia={onPlayMedia}
                onCopyPath={copyToClipboard}
                copiedPath={copiedPath}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {filtered.map((task) => (
        <DownloadRow
          key={task.id}
          task={task}
          onCancel={onCancel}
          onRemove={onRemove}
          onPlayMedia={onPlayMedia}
          onCopyPath={copyToClipboard}
          copiedPath={copiedPath}
        />
      ))}
    </div>
  )
}
