import React, { useEffect, useRef, useState } from 'react'
import {
  UploadCloud,
  File,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  FileText,
  Video,
  Music,
} from 'lucide-react'
import { api } from '../../lib/api'

export interface UniversalFileInputProps {
  value?: string
  onChange: (path: string | undefined) => void
  placeholder?: string
  accept?: string
  availableArtifacts?: { name: string; path: string; kind?: string }[]
  title?: string
  filterExtensions?: string[]
}

export default function UniversalFileInput({
  value = '',
  onChange,
  placeholder = 'Select file or enter path...',
  accept,
  availableArtifacts = [],
  filterExtensions,
}: UniversalFileInputProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [recentFiles, setRecentFiles] = useState<{ name: string; path: string; kind: string }[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch recent files from server workspaces and downloads
  useEffect(() => {
    let active = true
    api
      .getRecentArtifacts()
      .then((res) => {
        if (!active) return
        if (res?.artifacts) {
          let items = res.artifacts
          if (filterExtensions && filterExtensions.length > 0) {
            const allowed = filterExtensions.map((e) => e.toLowerCase().replace(/^\./, ''))
            items = items.filter((a) => {
              const ext = a.name.split('.').pop()?.toLowerCase() || ''
              return allowed.includes(ext)
            })
          }
          setRecentFiles(items)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [filterExtensions])

  const handleUpload = async (file: File) => {
    setUploading(true)
    setUploadError(null)
    try {
      const res = await api.uploadFile(file)
      if (res?.path) {
        onChange(res.path)
      } else {
        onChange(file.name)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setUploadError(`Upload failed: ${msg}. Setting local filename.`)
      // Fallback to filename so backend resolver can still locate it if it exists
      onChange(file.name)
    } finally {
      setUploading(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      handleUpload(files[0])
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleUpload(files[0])
    }
  }

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    if (['mp4', 'mkv', 'webm', 'mov', 'avi'].includes(ext)) return <Video className="size-4 text-brand-caramel" />
    if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) return <Music className="size-4 text-brand-caramel" />
    if (['srt', 'vtt', 'txt', 'md', 'doc', 'pdf'].includes(ext)) return <FileText className="size-4 text-brand-caramel" />
    return <File className="size-4 text-brand-caramel-text" />
  }

  const fileNameOnly = value ? value.split('/').pop() : ''

  return (
    <div className="space-y-2.5">
      {/* 1. Quick Select Dropdown from Recent Artifacts */}
      {(recentFiles.length > 0 || availableArtifacts.length > 0) && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-brand-caramel-text font-semibold">
            <span className="flex items-center gap-1.5">
              <FolderOpen className="size-3 text-brand-caramel" /> Pick from recent artifacts & downloads:
            </span>
          </div>
          <select
            value={value}
            onChange={(e) => onChange(e.target.value || undefined)}
            className="w-full rounded-xl border border-brand-sage bg-brand-cream-dark/50 px-3 py-2 text-xs font-mono font-medium text-brand-espresso focus:border-brand-caramel focus:bg-surface-white focus:outline-none transition-colors"
          >
            <option value="">— Select an existing file from workspace or downloads —</option>
            {recentFiles.map((f) => (
              <option key={f.path} value={f.path}>
                [{f.kind.toUpperCase()}] {f.name}
              </option>
            ))}
            {availableArtifacts.map((a) => (
              <option key={a.path} value={a.path}>
                [{a.kind || 'file'}] {a.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 2. Drag & Drop Zone + Click to Browse */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-brand-caramel bg-brand-cream-dark scale-[1.01] shadow-md'
            : 'border-brand-sage bg-brand-cream/40 hover:border-brand-caramel hover:bg-brand-cream-dark/50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleFileInputChange}
        />

        {uploading ? (
          <div className="flex items-center gap-2 text-xs font-bold text-brand-caramel">
            <Loader2 className="size-5 animate-spin" />
            <span>Uploading file to server...</span>
          </div>
        ) : value ? (
          <div className="flex items-center gap-2.5 max-w-full px-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-cream-dark border border-brand-sage">
              {getFileIcon(fileNameOnly || value)}
            </div>
            <div className="min-w-0 text-left">
              <p className="truncate text-xs font-bold text-brand-espresso max-w-md" title={value}>
                {fileNameOnly || value}
              </p>
              <p className="text-xs text-brand-caramel-text flex items-center gap-1">
                <CheckCircle2 className="size-2.5 text-emerald-600 inline" /> Ready • Click or drop to replace
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 py-1">
            <div className="flex size-9 items-center justify-center rounded-xl bg-brand-cream-dark text-brand-caramel border border-brand-sage">
              <UploadCloud className="size-5" />
            </div>
            <div className="text-xs">
              <span className="font-bold text-brand-espresso">Click to browse</span>
              <span className="text-brand-caramel-text"> or drop files here</span>
            </div>
            <span className="text-xs text-brand-caramel-text/80 font-mono">
              Supports {accept ? accept.replace(/\./g, ' ').toUpperCase() : 'any file'}
            </span>
          </div>
        )}
      </div>

      {uploadError && (
        <div className="flex items-center gap-1.5 text-xs text-accent-contrast font-medium bg-accent-contrast/10 p-2 rounded-xl border border-accent-contrast/20">
          <AlertCircle className="size-3.5 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* 3. Manual Path Input / Direct Edit */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value || undefined)}
            placeholder={placeholder}
            className="w-full rounded-xl border border-brand-sage bg-surface-white pl-3 pr-8 py-2 font-mono text-xs text-brand-espresso placeholder-brand-caramel-text/60 focus:border-brand-caramel focus:outline-none transition-colors"
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="absolute right-2 top-2 text-brand-caramel-text hover:text-accent-contrast transition-colors"
              title="Clear input"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
