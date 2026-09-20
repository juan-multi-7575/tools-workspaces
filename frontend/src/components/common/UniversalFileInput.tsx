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
    if (['mp4', 'mkv', 'webm', 'mov', 'avi'].includes(ext)) return <Video className="size-4 text-[#9D6638]" />
    if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) return <Music className="size-4 text-[#9D6638]" />
    if (['srt', 'vtt', 'txt', 'md', 'doc', 'pdf'].includes(ext)) return <FileText className="size-4 text-[#9D6638]" />
    return <File className="size-4 text-[#7C5339]" />
  }

  const fileNameOnly = value ? value.split('/').pop() : ''

  return (
    <div className="space-y-2.5">
      {/* 1. Quick Select Dropdown from Recent Artifacts */}
      {(recentFiles.length > 0 || availableArtifacts.length > 0) && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-[#7C5339] font-semibold">
            <span className="flex items-center gap-1.5">
              <FolderOpen className="size-3 text-[#9D6638]" /> Pick from recent artifacts & downloads:
            </span>
          </div>
          <select
            value={value}
            onChange={(e) => onChange(e.target.value || undefined)}
            className="w-full rounded-xl border border-[#B0BA99] bg-[#EDE5CD]/50 px-3 py-2 text-xs font-mono font-medium text-[#4E220F] focus:border-[#9D6638] focus:bg-[#FFFFFF] focus:outline-none transition-colors"
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
            ? 'border-[#9D6638] bg-[#EDE5CD] scale-[1.01] shadow-md'
            : 'border-[#B0BA99] bg-[#F7F1DE]/40 hover:border-[#9D6638] hover:bg-[#EDE5CD]/50'
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
          <div className="flex items-center gap-2 text-xs font-bold text-[#9D6638]">
            <Loader2 className="size-5 animate-spin" />
            <span>Uploading file to server...</span>
          </div>
        ) : value ? (
          <div className="flex items-center gap-2.5 max-w-full px-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#EDE5CD] border border-[#B0BA99]">
              {getFileIcon(fileNameOnly || value)}
            </div>
            <div className="min-w-0 text-left">
              <p className="truncate text-xs font-bold text-[#4E220F] max-w-md" title={value}>
                {fileNameOnly || value}
              </p>
              <p className="text-[10px] text-[#7C5339] flex items-center gap-1">
                <CheckCircle2 className="size-2.5 text-emerald-600 inline" /> Ready • Click or drop to replace
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 py-1">
            <div className="flex size-9 items-center justify-center rounded-xl bg-[#EDE5CD] text-[#9D6638] border border-[#B0BA99]">
              <UploadCloud className="size-5" />
            </div>
            <div className="text-xs">
              <span className="font-bold text-[#4E220F]">Click to browse</span>
              <span className="text-[#7C5339]"> or drop files here</span>
            </div>
            <span className="text-[10px] text-[#7C5339]/80 font-mono">
              Supports {accept ? accept.replace(/\./g, ' ').toUpperCase() : 'any file'}
            </span>
          </div>
        )}
      </div>

      {uploadError && (
        <div className="flex items-center gap-1.5 text-xs text-[#A83232] font-medium bg-[#A83232]/10 p-2 rounded-xl border border-[#A83232]/20">
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
            className="w-full rounded-xl border border-[#B0BA99] bg-[#FFFFFF] pl-3 pr-8 py-2 font-mono text-xs text-[#4E220F] placeholder-[#7C5339]/60 focus:border-[#9D6638] focus:outline-none transition-colors"
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="absolute right-2 top-2 text-[#7C5339] hover:text-[#A83232] transition-colors"
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
