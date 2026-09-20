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
}

export const DownloadsTab: React.FC<DownloadsTabProps> = ({
  tasks,
  filterQuery,
  onCancel,
  onRemove,
  onPlayMedia,
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
    return (
      <div className="rounded-xl border border-dashed border-[#B0BA99] bg-[#EDE5CD]/40 p-8 text-center text-[#7C5339] text-xs font-mono">
        <Clock className="mx-auto size-6 text-[#9D6638] mb-2 opacity-60" />
        {filterQuery ? 'No matching downloads found.' : 'No active or recent downloads.'}
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
