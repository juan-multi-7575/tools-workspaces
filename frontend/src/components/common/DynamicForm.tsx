import { useMemo, useState } from 'react'
import {
  Search,
  Eye,
  EyeOff,
  RotateCcw,
  Link2,
  Clipboard,
  X,
  Video,
  Music,
  Film,
  Sparkles,
  Subtitles,
  ListOrdered,
  Settings2,
  FileCode,
} from 'lucide-react'
import UniversalFileInput from './UniversalFileInput'

export interface SchemaField {
  type?: string
  title?: string
  description?: string
  default?: unknown
  enum?: (string | number)[]
  enumLabels?: Record<string, string>
  minimum?: number
  maximum?: number
  step?: number
  widget?: 'text' | 'textarea' | 'secret' | 'select' | 'artifact_picker' | 'code' | 'url'
  placeholder?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolSchema = Record<string, any>

const FIELD_GROUPS: Record<string, { label: string; icon: typeof Sparkles; keys: string[] }> = {
  format: {
    label: 'Format & Quality',
    icon: Film,
    keys: ['format_preset', 'merge_output_format', 'format'],
  },
  audio: {
    label: 'Audio Options',
    icon: Music,
    keys: ['audio_format', 'audio_quality', 'extract_audio', 'keep_video'],
  },
  subtitles: {
    label: 'Subtitles & Metadata',
    icon: Subtitles,
    keys: [
      'writesubtitles',
      'writeautomaticsub',
      'subtitleslangs',
      'embed_subs',
      'embed_thumbnail',
      'write_thumbnail',
      'embed_metadata',
      'embed_chapters',
    ],
  },
  playlist: {
    label: 'Playlists & Limits',
    icon: ListOrdered,
    keys: ['playlist_items', 'no_playlist', 'max_downloads', 'limit_rate', 'concurrent_fragments', 'retries', 'socket_timeout'],
  },
  advanced: {
    label: 'Output & Advanced',
    icon: Settings2,
    keys: ['output_template', 'restrict_filenames', 'windows_filenames', 'force_overwrites', 'raw_args'],
  },
}

export default function DynamicForm({
  schema = {},
  value = {},
  onChange,
  availableArtifacts = [],
}: {
  schema?: ToolSchema
  value?: Record<string, unknown>
  onChange: (nextValue: Record<string, unknown>) => void
  availableArtifacts?: { name: string; path: string; kind?: string }[]
}) {
  const [search, setSearch] = useState('')
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState<string>('all')

  const setField = (key: string, val: unknown) => {
    const next = { ...value }
    if (val === undefined || val === '') {
      delete next[key]
    } else {
      next[key] = val
    }
    onChange(next)
  }

  const handlePasteUrl = async (key: string) => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) setField(key, text.trim())
    } catch {
      // clipboard permission denied or not supported
    }
  }

  // Identify special URL field and Download Mode field
  const urlKey = useMemo(() => {
    if ('url' in schema) return 'url'
    return Object.keys(schema).find((k) => k.toLowerCase().includes('url'))
  }, [schema])

  const hasDownloadMode = 'download_mode' in schema
  const currentMode = (value.download_mode as string) || 'video_audio'

  const handleModeChange = (mode: string) => {
    const next: Record<string, unknown> = { ...value, download_mode: mode }
    if (mode === 'audio_only') {
      next.extract_audio = true
    } else {
      delete next.extract_audio
    }
    onChange(next)
  }

  const entries = useMemo(() => {
    const q = search.trim().toLowerCase()
    return Object.entries(schema).filter(([key, rawField]) => {
      // Skip top-level special highlighted fields from the regular grid
      if (key === urlKey) return false
      if (key === 'download_mode') return false

      const field = rawField as SchemaField
      if (activeTab !== 'all') {
        const groupSpec = FIELD_GROUPS[activeTab]
        if (groupSpec && !groupSpec.keys.includes(key)) {
          return false
        }
      }

      if (!q) return true
      return (
        key.toLowerCase().includes(q) ||
        field.title?.toLowerCase().includes(q) ||
        field.description?.toLowerCase().includes(q)
      )
    })
  }, [schema, search, urlKey, activeTab])

  const availableGroups = useMemo(() => {
    const schemaKeys = new Set(Object.keys(schema).filter((k) => k !== urlKey && k !== 'download_mode'))
    const groups: { id: string; label: string; icon: typeof Sparkles; count: number }[] = []

    for (const [groupId, group] of Object.entries(FIELD_GROUPS)) {
      const matchingCount = group.keys.filter((k) => schemaKeys.has(k)).length
      if (matchingCount > 0) {
        groups.push({
          id: groupId,
          label: group.label,
          icon: group.icon,
          count: matchingCount,
        })
      }
    }
    return groups
  }, [schema, urlKey])

  if (Object.keys(schema).length === 0) {
    return (
      <div className="rounded-xl border border-[#B0BA99] bg-[#EDE5CD]/40 p-5 text-center text-xs text-[#7C5339] font-mono">
        No configurable parameters for this tool.
      </div>
    )
  }

  return (
    <div className="space-y-4 font-sans text-xs text-[#4E220F]">
      {/* ========================================================================= */}
      {/* 1. HERO URL INSERTION BAR (High-Priority Primary Control)                */}
      {/* ========================================================================= */}
      {urlKey && (
        <div className="relative rounded-2xl border-2 border-[#9D6638]/50 bg-[#F7F1DE] p-4 shadow-sm ring-1 ring-[#9D6638]/20 transition-all focus-within:border-[#9D6638] focus-within:ring-2 focus-within:ring-[#9D6638]/30">
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 font-bold text-[#4E220F] text-xs">
              <span className="flex size-5 items-center justify-center rounded-md bg-[#9D6638] text-[#FDFBF7]">
                <Link2 className="size-3" />
              </span>
              <span>{schema[urlKey]?.title ? String(schema[urlKey].title) : 'Target Media URL'}</span>
              <span className="font-mono text-[9px] font-bold text-[#4E220F] px-2 py-0.5 rounded-full bg-[#B0BA99]/40 border border-[#B0BA99]">
                REQUIRED
              </span>
            </label>

            {value[urlKey] !== undefined && value[urlKey] !== '' && (
              <button
                type="button"
                onClick={() => setField(urlKey, undefined)}
                className="flex items-center gap-1 font-mono text-[10px] text-[#7C5339] hover:text-[#A83232] transition-colors"
              >
                <X className="size-3" /> clear
              </button>
            )}
          </div>

          <div className="relative flex items-center gap-2">
            <input
              type="text"
              autoFocus
              value={String(value[urlKey] ?? '')}
              onChange={(e) => setField(urlKey, e.target.value)}
              placeholder={
                schema[urlKey]?.placeholder
                  ? String(schema[urlKey].placeholder)
                  : 'https://www.youtube.com/watch?v=... or media link'
              }
              className="w-full rounded-xl border border-[#B0BA99] bg-[#FFFFFF] pl-3.5 pr-20 py-2.5 font-mono text-xs text-[#4E220F] placeholder-[#7C5339]/60 shadow-inner focus:border-[#9D6638] focus:outline-none focus:ring-1 focus:ring-[#9D6638]/40 font-medium"
            />
            <button
              type="button"
              onClick={() => handlePasteUrl(urlKey)}
              className="absolute right-1.5 top-1.5 inline-flex items-center gap-1.5 rounded-lg bg-[#EDE5CD] px-3 py-1.5 text-[11px] font-semibold text-[#4E220F] hover:bg-[#B0BA99]/40 border border-[#B0BA99] active:scale-95 transition-all"
              title="Paste URL from clipboard"
            >
              <Clipboard className="size-3 text-[#9D6638]" />
              <span>Paste</span>
            </button>
          </div>

          {schema[urlKey]?.description && (
            <p className="mt-2 text-[11px] text-[#7C5339] flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[#9D6638] inline-block" />
              {String(schema[urlKey].description)}
            </p>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. DOWNLOAD MODE SELECTOR (Video + Audio / Audio Only / Video Only)        */}
      {/* ========================================================================= */}
      {hasDownloadMode && (
        <div className="rounded-2xl border border-[#B0BA99] bg-[#EDE5CD]/50 p-3.5 space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#7C5339] flex items-center gap-1.5">
              <Sparkles className="size-3 text-[#9D6638]" />
              Download Mode
            </span>
            <span className="font-mono text-[10px] font-semibold text-[#4E220F]">
              {currentMode === 'audio_only'
                ? 'Extracting Audio Track'
                : currentMode === 'video_only'
                  ? 'Video Stream Only'
                  : 'Full Video + Audio'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleModeChange('video_audio')}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-center transition-all ${
                currentMode === 'video_audio'
                  ? 'border-[#9D6638] bg-[#9D6638] text-[#FDFBF7] font-bold shadow-xs ring-1 ring-[#9D6638]'
                  : 'border-[#B0BA99] bg-[#FFFFFF] text-[#4E220F] hover:bg-[#EDE5CD] hover:border-[#9D6638]'
              }`}
            >
              <div className="flex items-center gap-1 text-xs font-bold">
                <Video className="size-3.5" />
                <span>Video + Audio</span>
              </div>
              <span className={`text-[10px] ${currentMode === 'video_audio' ? 'text-[#FDFBF7]/80' : 'text-[#7C5339]'}`}>
                Full Merged Video
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleModeChange('audio_only')}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-center transition-all ${
                currentMode === 'audio_only'
                  ? 'border-[#9D6638] bg-[#9D6638] text-[#FDFBF7] font-bold shadow-xs ring-1 ring-[#9D6638]'
                  : 'border-[#B0BA99] bg-[#FFFFFF] text-[#4E220F] hover:bg-[#EDE5CD] hover:border-[#9D6638]'
              }`}
            >
              <div className="flex items-center gap-1 text-xs font-bold">
                <Music className="size-3.5" />
                <span>Audio Only</span>
              </div>
              <span className={`text-[10px] ${currentMode === 'audio_only' ? 'text-[#FDFBF7]/80' : 'text-[#7C5339]'}`}>
                MP3 / FLAC / WAV
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleModeChange('video_only')}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-center transition-all ${
                currentMode === 'video_only'
                  ? 'border-[#9D6638] bg-[#9D6638] text-[#FDFBF7] font-bold shadow-xs ring-1 ring-[#9D6638]'
                  : 'border-[#B0BA99] bg-[#FFFFFF] text-[#4E220F] hover:bg-[#EDE5CD] hover:border-[#9D6638]'
              }`}
            >
              <div className="flex items-center gap-1 text-xs font-bold">
                <Film className="size-3.5" />
                <span>Video Only</span>
              </div>
              <span className={`text-[10px] ${currentMode === 'video_only' ? 'text-[#FDFBF7]/80' : 'text-[#7C5339]'}`}>
                No Audio Track
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. STRUCTURED CATEGORY TABS & SEARCH BAR                                  */}
      {/* ========================================================================= */}
      {availableGroups.length > 1 && (
        <div className="space-y-2 pt-1 border-t border-[#B0BA99]/60">
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-none">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`rounded-xl px-3 py-1 text-xs font-semibold transition-all ${
                  activeTab === 'all'
                    ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs font-bold'
                    : 'bg-[#EDE5CD]/70 text-[#4E220F] hover:bg-[#EDE5CD] border border-[#B0BA99]/60'
                }`}
              >
                All ({Object.keys(schema).length - (urlKey ? 1 : 0) - (hasDownloadMode ? 1 : 0)})
              </button>
              {availableGroups.map((g) => {
                const Icon = g.icon
                const isActive = activeTab === g.id
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setActiveTab(g.id)}
                    className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1 text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs font-bold'
                        : 'bg-[#EDE5CD]/70 text-[#4E220F] hover:bg-[#EDE5CD] border border-[#B0BA99]/60'
                    }`}
                  >
                    <Icon className="size-3" />
                    <span>{g.label}</span>
                    <span className="font-mono text-[9px] px-1.5 py-0.2 rounded-full bg-[#B0BA99]/40 font-bold">
                      {g.count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Search parameter bar */}
      {Object.keys(schema).length > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-3.5 text-[#7C5339]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search parameter names, descriptions..."
            className="w-full rounded-xl border border-[#B0BA99] bg-[#FFFFFF] pl-9 pr-8 py-2 text-xs text-[#4E220F] placeholder-[#7C5339]/60 focus:border-[#9D6638] focus:outline-none focus:ring-1 focus:ring-[#9D6638]/30 font-medium"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2.5 text-[#7C5339] hover:text-[#4E220F]"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. PARAMETER FORM GRID WITH DUAL FILE INGESTION                           */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {entries.map(([key, rawField]) => {
          const field = rawField as SchemaField
          const type = field.type || 'string'
          const val = value[key]
          // Booleans always render as checkboxes — even when the key name
          // looks like a file path (e.g. restrict_filenames).
          const isArtifactField =
            type !== 'boolean' &&
            (key.includes('input') || key.includes('file') || key.includes('path') || key === 'paths')
          const isFullWidth =
            field.widget === 'code' ||
            field.widget === 'textarea' ||
            key === 'code' ||
            key === 'raw_args' ||
            isArtifactField

          return (
            <div
              key={key}
              className={`space-y-2 rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] p-3.5 transition-all hover:border-[#9D6638]/70 shadow-xs ${
                isFullWidth ? 'sm:col-span-2' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <label className="font-bold text-[#4E220F] text-xs flex items-center gap-1.5">
                  {field.title || key}
                </label>
                {val !== undefined && (
                  <button
                    type="button"
                    onClick={() => setField(key, undefined)}
                    className="flex items-center gap-1 font-mono text-[10px] text-[#7C5339] hover:text-[#A83232] transition-colors"
                  >
                    <RotateCcw className="size-2.5" /> reset
                  </button>
                )}
              </div>

              {field.description && (
                <p className="text-[11px] text-[#7C5339] leading-relaxed">{field.description}</p>
              )}

              {/* UNIVERSAL FILE PICKER: Drag & Drop + Click to Browse + Server Upload + Artifact Picker */}
              {isArtifactField ? (
                <UniversalFileInput
                  value={val !== undefined ? String(val) : ''}
                  onChange={(p) => setField(key, p)}
                  placeholder={
                    field.placeholder
                      ? String(field.placeholder)
                      : `Select file or enter path for ${field.title || key}...`
                  }
                  availableArtifacts={availableArtifacts}
                />
              ) : field.enum ? (
                <select
                  value={String(val ?? field.default ?? '')}
                  onChange={(e) => setField(key, e.target.value || undefined)}
                  className="w-full rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/70 px-3 py-2 text-xs text-[#4E220F] font-mono font-medium focus:border-[#9D6638] focus:bg-[#FFFFFF] focus:outline-none"
                >
                  <option value="">— select option —</option>
                  {field.enum.map((opt) => (
                    <option key={String(opt)} value={String(opt)}>
                      {field.enumLabels?.[String(opt)] || String(opt)}
                    </option>
                  ))}
                </select>
              ) : type === 'boolean' ? (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id={`field-${key}`}
                    checked={Boolean(val ?? field.default ?? false)}
                    onChange={(e) => setField(key, e.target.checked)}
                    className="size-4 rounded border-[#B0BA99] bg-[#F7F1DE] accent-[#9D6638] cursor-pointer"
                  />
                  <label htmlFor={`field-${key}`} className="text-xs font-semibold text-[#4E220F] select-none cursor-pointer">
                    {Boolean(val ?? field.default ?? false) ? 'Enabled' : 'Disabled'}
                  </label>
                </div>
              ) : field.widget === 'secret' ? (
                <div className="relative">
                  <input
                    type={showSecrets[key] ? 'text' : 'password'}
                    value={String(val ?? '')}
                    onChange={(e) => setField(key, e.target.value)}
                    placeholder="Enter secret key..."
                    className="w-full rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/70 pl-3 pr-8 py-2 font-mono text-xs text-[#4E220F] focus:border-[#9D6638] focus:bg-[#FFFFFF] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecrets((p) => ({ ...p, [key]: !p[key] }))}
                    className="absolute right-2.5 top-2.5 text-[#7C5339] hover:text-[#4E220F]"
                  >
                    {showSecrets[key] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              ) : field.widget === 'code' || field.widget === 'textarea' || key === 'code' || key === 'raw_args' ? (
                <div className="relative">
                  <textarea
                    rows={key === 'raw_args' ? 2 : 4}
                    value={String(val ?? field.default ?? '')}
                    onChange={(e) => setField(key, e.target.value)}
                    placeholder={field.placeholder || 'Enter code or command arguments...'}
                    className="w-full rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/70 px-3 py-2 font-mono text-xs text-[#4E220F] placeholder-[#7C5339]/60 focus:border-[#9D6638] focus:bg-[#FFFFFF] focus:outline-none leading-relaxed"
                  />
                  {key === 'raw_args' && (
                    <FileCode className="absolute right-2.5 bottom-2.5 size-3.5 text-[#7C5339] pointer-events-none" />
                  )}
                </div>
              ) : (
                <input
                  type={type === 'number' || type === 'integer' ? 'number' : 'text'}
                  min={(type === 'number' || type === 'integer') && field.minimum !== undefined ? field.minimum : undefined}
                  max={(type === 'number' || type === 'integer') && field.maximum !== undefined ? field.maximum : undefined}
                  value={val !== undefined ? String(val) : (field.default !== undefined ? String(field.default) : '')}
                  onChange={(e) =>
                    setField(
                      key,
                      type === 'number' || type === 'integer'
                        ? e.target.value === ''
                          ? undefined
                          : Number(e.target.value)
                        : e.target.value,
                    )
                  }
                  placeholder={field.placeholder || `Enter ${key}...`}
                  className="w-full rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/70 px-3 py-2 text-xs text-[#4E220F] placeholder-[#7C5339]/60 focus:border-[#9D6638] focus:bg-[#FFFFFF] focus:outline-none font-mono font-medium"
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
