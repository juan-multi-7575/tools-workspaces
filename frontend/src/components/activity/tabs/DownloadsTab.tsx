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
        <div className="rounded-xl border border-dashed border-[#B0BA99] bg-[#EDE5CD]/40 p-6 text-center text-[#7C5339] text-xs font-mono space-y-2">
          <Clock className="mx-auto size-6 text-[#9D6638] mb-1 opacity-60" />
          <p>{filterQuery ? 'No matching downloads found.' : 'Nothing downloading.'}</p>
          {!filterQuery && (
            <p>
              Completed files land in{' '}
              <button onClick={onBrowseFiles} className="font-bold text-[#9D6638] underline underline-offset-2 hover:text-[#86542C]">
                Saved Files →
              </button>
            </p>
          )}
        </div>
        {recentCompleted.length > 0 && (
          <div className="space-y-2">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7C5339] px-1">
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
