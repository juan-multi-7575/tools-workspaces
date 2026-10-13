import React, { useEffect, useRef, useState, type CSSProperties } from 'react'
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
import { useHostSkin } from '../../lib/hostSkin'

export interface UniversalFileInputProps {
  value?: string
  onChange: (path: string | undefined) => void
  placeholder?: string
  accept?: string
  availableArtifacts?: { name: string; path: string; kind?: string }[]
  title?: string
  filterExtensions?: string[]
  /** Lets a host page's own `<label htmlFor>` name this picker's text input. */
  id?: string
  /**
   * The required-field gate. The picker is a composite (drop target, browse
   * button, recent-file list) around one text input, and that input is what
   * carries the value, so it is where `required`, `aria-invalid` and the
   * `aria-describedby` error reference belong.
   */
  required?: boolean
  'aria-required'?: boolean
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  onBlur?: () => void
}

export default function UniversalFileInput({
  value = '',
  onChange,
  placeholder = 'Select file or enter path...',
  accept,
  availableArtifacts = [],
  filterExtensions,
  id,
  required,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  onBlur,
}: UniversalFileInputProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [recentFiles, setRecentFiles] = useState<{ name: string; path: string; kind: string }[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // This control is mounted inside a dozen tool pages that each have their own
  // palette, so it reads the board it landed in instead of carrying one.
  const rootRef = useRef<HTMLDivElement>(null)
  const skin = useHostSkin(rootRef)

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
    if (['mp4', 'mkv', 'webm', 'mov', 'avi'].includes(ext)) return <Video className="size-4 tool-accent-text" />
    if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) return <Music className="size-4 tool-accent-text" />
    if (['srt', 'vtt', 'txt', 'md', 'doc', 'pdf'].includes(ext)) return <FileText className="size-4 tool-accent-text" />
    return <File className="size-4 tool-muted" />
  }

  const fileNameOnly = value ? value.split('/').pop() : ''

  return (
    <div ref={rootRef} className="tool-form space-y-2.5" data-tone={skin.tone} style={{ '--tool-ink': skin.ink, '--tool-on-accent': skin.onAccent } as CSSProperties}>
      {/* 1. Quick Select Dropdown from Recent Artifacts */}
      {(recentFiles.length > 0 || availableArtifacts.length > 0) && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold tool-muted">
            <span className="flex items-center gap-1.5">
              <FolderOpen className="size-3 tool-accent-text" /> Pick from recent artifacts & downloads:
            </span>
          </div>
          <select
            value={value}
            onChange={(e) => onChange(e.target.value || undefined)}
            className="tool-well w-full rounded-xl px-3 py-2 text-xs font-mono font-medium transition-colors"
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
        className="tool-dropzone relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-center cursor-pointer transition-all"
        data-dragging={isDragging}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleFileInputChange}
        />

        {uploading ? (
          <div className="flex items-center gap-2 text-xs font-bold tool-accent-text">
            <Loader2 className="size-5 animate-spin" />
            <span>Uploading file to server...</span>
          </div>
        ) : value ? (
          <div className="flex items-center gap-2.5 max-w-full px-2">
            <div className="tool-accent-chip flex size-7 shrink-0 items-center justify-center rounded-lg">
              {getFileIcon(fileNameOnly || value)}
            </div>
            <div className="min-w-0 text-left">
              <p className="truncate text-xs font-bold max-w-md" title={value}>
                {fileNameOnly || value}
              </p>
              <p className="text-xs tool-muted flex items-center gap-1">
                <CheckCircle2 className="size-2.5 text-emerald-500 inline" /> Ready • Click or drop to replace
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 py-1">
            <div className="tool-accent-chip flex size-9 items-center justify-center rounded-xl">
              <UploadCloud className="size-5 tool-accent-text" />
            </div>
            <div className="text-xs">
              <span className="font-bold">Click to browse</span>
              <span className="tool-muted"> or drop files here</span>
            </div>
            <span className="text-xs font-mono tool-faint">
              Supports {accept ? accept.replace(/\./g, ' ').toUpperCase() : 'any file'}
            </span>
          </div>
        )}
      </div>

      {uploadError && (
        <div className="tool-alert flex items-center gap-1.5 text-xs font-medium p-2 rounded-xl">
          <AlertCircle className="size-3.5 tool-alert-ink shrink-0" />
          <span className="tool-alert-ink">{uploadError}</span>
        </div>
      )}

      {/* 3. Manual Path Input / Direct Edit */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <input
            id={id}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value || undefined)}
            onBlur={onBlur}
            required={required}
            aria-required={ariaRequired}
            aria-invalid={ariaInvalid}
            aria-describedby={ariaDescribedBy}
            placeholder={placeholder}
            className="tool-well w-full rounded-xl pl-3 pr-8 py-2 font-mono text-xs transition-colors"
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="tool-quiet-action absolute right-2 top-2"
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
