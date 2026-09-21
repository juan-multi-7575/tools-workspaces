import React, { useState } from 'react'
import { FolderOpen, Clock, Play, Download, Copy, Check } from 'lucide-react'
import type { StoredArtifact } from '../../../lib/activityStore'
import { getCompatibleTools } from '../../../lib/toolCompatibility'
import { UseAsInputMenu } from '../UseAsInputMenu'

interface ArtifactsTabProps {
  artifacts: StoredArtifact[]
  filterQuery: string
  filterKind?: string
  onOpenAudioPlayer?: (artifact: { name: string; path: string; kind?: string }) => void
  onSendToTool?: (toolId: string, inputPath: string) => void
}

function getArtifactBadge(name: string) {
  const lower = name.toLowerCase()
  if (lower.endsWith('.en.srt')) return { label: 'EN SRT', color: 'bg-amber-100 text-amber-900 border-amber-300' }
  if (lower.endsWith('.ko.srt')) return { label: 'KO SRT', color: 'bg-indigo-100 text-indigo-900 border-indigo-300' }
  if (lower.endsWith('.srt')) return { label: 'SRT', color: 'bg-amber-100 text-amber-900 border-amber-300' }
  if (lower.endsWith('.vtt')) return { label: 'VTT', color: 'bg-sky-100 text-sky-900 border-sky-300' }
  if (lower.includes('clean.txt')) return { label: 'CLEAN TXT', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' }
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return { label: 'DOC', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' }
  if (['.mp4', '.mkv', '.webm', '.mov'].some((ext) => lower.endsWith(ext))) {
    return { label: 'VIDEO', color: 'bg-purple-100 text-purple-900 border-purple-300' }
  }
  if (['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.opus', '.aac'].some((ext) => lower.endsWith(ext))) {
    return { label: 'AUDIO', color: 'bg-orange-100 text-orange-900 border-orange-300' }
  }
  const ext = name.split('.').pop()?.toUpperCase() || 'FILE'
  return { label: ext, color: 'bg-[#EDE5CD] text-[#4E220F] border-[#B0BA99]' }
}

function formatFileName(name: string, maxLen = 34): string {
  if (name.length <= maxLen) return name
  const lastDot = name.lastIndexOf('.')
  const ext = lastDot !== -1 ? name.slice(lastDot) : ''
  const base = lastDot !== -1 ? name.slice(0, lastDot) : name
  const keepFront = Math.floor((maxLen - ext.length - 3) * 0.55)
  const keepBack = Math.max(4, maxLen - ext.length - 3 - keepFront)
  return `${base.slice(0, keepFront)}...${base.slice(-keepBack)}${ext}`
}

function formatTimeAgo(timestamp: number): string {
  const elapsedSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (elapsedSec < 10) return 'just now'
  if (elapsedSec < 60) return `${elapsedSec}s ago`
  const elapsedMin = Math.floor(elapsedSec / 60)
  if (elapsedMin < 60) return `${elapsedMin}m ago`
  const elapsedHours = Math.floor(elapsedMin / 60)
  return `${elapsedHours}h ago`
}

function isAudioMedia(name: string): boolean {
  const lower = name.toLowerCase()
  return ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.opus', '.aac'].some((ext) => lower.endsWith(ext))
}

export const ArtifactsTab: React.FC<ArtifactsTabProps> = ({
  artifacts,
  filterQuery,
  filterKind = 'ALL',
  onOpenAudioPlayer,
  onSendToTool,
}) => {
  const [copiedPath, setCopiedPath] = useState<string | null>(null)

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopiedPath(text)
    setTimeout(() => setCopiedPath(null), 2000)
  }

  const filtered = artifacts.filter((a) => {
    if (filterKind !== 'ALL') {
      const badge = getArtifactBadge(a.name).label
      if (filterKind === 'AUDIO' && badge !== 'AUDIO') return false
      if (filterKind === 'VIDEO' && badge !== 'VIDEO') return false
      if (filterKind === 'SRT' && !badge.includes('SRT') && badge !== 'VTT') return false
      if (filterKind === 'DOC' && badge !== 'DOC' && badge !== 'CLEAN TXT') return false
    }
    if (!filterQuery) return true
    const q = filterQuery.toLowerCase()
    return a.name.toLowerCase().includes(q) || a.path.toLowerCase().includes(q) || a.kind.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7C5339] flex items-center gap-1">
          <FolderOpen className="size-3 text-[#9D6638]" />
          Server Saved Files
        </span>
        <span className="font-mono text-[10px] text-[#7C5339]">
          {filtered.length} files found
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#B0BA99] bg-[#EDE5CD]/30 p-8 text-center text-[#7C5339] text-xs font-mono">
          <Clock className="mx-auto size-6 text-[#9D6638] mb-2 opacity-60" />
          {filterQuery ? 'No matching saved files found.' : 'No output artifacts recorded yet.'}
        </div>
      ) : (
        filtered.map((art) => {
          const badge = getArtifactBadge(art.name)
          const isAudio = isAudioMedia(art.name)
          const compatible = getCompatibleTools(art.name).filter((t) => t.compatible)
          const compatTitle =
            compatible.length > 0
              ? `Fits: ${compatible.map((t) => t.toolName).join(', ')}`
              : 'No tool accepts this file type as input'
          return (
            <div
              key={art.path}
              className="flex items-center justify-between gap-2.5 rounded-xl border border-[#B0BA99] bg-[#FFFFFF] p-2.5 shadow-xs hover:border-[#9D6638]/80 transition-all group"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span
                  className={`font-mono text-[9px] font-extrabold px-1.5 py-0.5 rounded border uppercase shrink-0 ${badge.color}`}
                >
                  {badge.label}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-xs font-bold text-[#4E220F] truncate block" title={art.name}>
                    {formatFileName(art.name, 36)}
                  </span>
                  <div className="flex items-center gap-2 font-mono text-[10px] text-[#7C5339]">
                    <span>{(art.size / 1024 / 1024).toFixed(2)} MB</span>
                    <span>•</span>
                    <span>{formatTimeAgo(art.mtime * 1000)}</span>
                    <span>•</span>
                    <span
                      title={compatTitle}
                      className={
                        compatible.length > 0
                          ? 'font-bold text-[#2E6B47]'
                          : 'italic text-[#7C5339]/70'
                      }
                    >
                      {compatible.length > 0
                        ? `✓ fits ${compatible[0].toolName}${compatible.length > 1 ? ` +${compatible.length - 1}` : ''}`
                        : 'no tool match'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {isAudio && onOpenAudioPlayer && (
                  <button
                    onClick={() => onOpenAudioPlayer(art)}
                    className="inline-flex items-center gap-1 rounded bg-[#9D6638] px-2 py-1 text-[10px] font-semibold text-[#FDFBF7] hover:bg-[#86542C] transition-all shadow-2xs"
                  >
                    <Play className="size-2.5 fill-current" />
                    Play
                  </button>
                )}

                {/* 1-Click Copy Path */}
                <button
                  type="button"
                  onClick={() => copyToClipboard(art.path)}
                  className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-semibold transition-all ${
                    copiedPath === art.path
                      ? 'border-emerald-500 bg-emerald-100 text-emerald-800'
                      : 'border-[#B0BA99] bg-[#EDE5CD] text-[#4E220F] hover:bg-[#B0BA99]/40'
                  }`}
                  title="Copy local server path"
                >
                  {copiedPath === art.path ? (
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

                {/* Download / Content */}
                <a
                  href={`/api/artifacts/content?path=${encodeURIComponent(art.path)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-[#B0BA99] bg-[#EDE5CD] px-2 py-1 text-[10px] font-semibold text-[#4E220F] hover:bg-[#B0BA99]/40 transition-colors"
                  title="Download file"
                >
                  <Download className="size-2.5 text-[#9D6638]" />
                  <span>Get</span>
                </a>

                {/* Interactive Use as Input Menu */}
                {onSendToTool && (
                  <UseAsInputMenu
                    artifactPath={art.path}
                    artifactName={art.name}
                    onSendToTool={onSendToTool}
                  />
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
