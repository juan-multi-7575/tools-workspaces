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
  unit?: string
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
      <div className="rounded-xl border border-brand-sage bg-brand-cream-dark/40 p-5 text-center text-xs text-brand-caramel-text font-mono">
        No configurable parameters for this tool.
      </div>
    )
  }

  return (
    <div className="space-y-4 font-sans text-xs text-brand-espresso">
      {/* ========================================================================= */}
      {/* 1. HERO URL INSERTION BAR (High-Priority Primary Control)                */}
      {/* ========================================================================= */}
      {urlKey && (
        <div className="relative rounded-2xl border-2 border-brand-caramel/50 bg-brand-cream p-4 shadow-sm ring-1 ring-brand-caramel/20 transition-all focus-within:border-brand-caramel focus-within:ring-2 focus-within:ring-brand-caramel/30">
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 font-bold text-brand-espresso text-xs">
              <span className="flex size-5 items-center justify-center rounded-md bg-brand-caramel text-brand-cream-light">
                <Link2 className="size-3" />
              </span>
              <span>{schema[urlKey]?.title ? String(schema[urlKey].title) : 'Target Media URL'}</span>
              <span className="font-mono text-xs font-bold text-brand-espresso px-2 py-0.5 rounded-full bg-brand-sage/40 border border-brand-sage">
                REQUIRED
              </span>
            </label>

            {value[urlKey] !== undefined && value[urlKey] !== '' && (
              <button
                type="button"
                onClick={() => setField(urlKey, undefined)}
                className="flex items-center gap-1 font-mono text-xs text-brand-caramel-text hover:text-accent-contrast transition-colors"
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
              className="w-full rounded-xl border border-brand-sage bg-surface-white pl-3.5 pr-20 py-2.5 font-mono text-xs text-brand-espresso placeholder-brand-caramel-text/60 shadow-inner focus:border-brand-caramel focus:outline-none focus:ring-1 focus:ring-brand-caramel/40 font-medium"
            />
            <button
              type="button"
              onClick={() => handlePasteUrl(urlKey)}
              className="absolute right-1.5 top-1.5 inline-flex items-center gap-1.5 rounded-lg bg-brand-cream-dark px-3 py-1.5 text-xs font-semibold text-brand-espresso hover:bg-brand-sage/40 border border-brand-sage active:scale-95 transition-all"
              title="Paste URL from clipboard"
            >
              <Clipboard className="size-3 text-brand-caramel" />
              <span>Paste</span>
            </button>
          </div>

          {schema[urlKey]?.description && (
            <p className="mt-2 text-xs text-brand-caramel-text flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-brand-caramel inline-block" />
              {String(schema[urlKey].description)}
            </p>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. DOWNLOAD MODE SELECTOR (Video + Audio / Audio Only / Video Only)        */}
      {/* ========================================================================= */}
      {hasDownloadMode && (
        <div className="rounded-2xl border border-brand-sage bg-brand-cream-dark/50 p-3.5 space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase font-bold tracking-wider text-brand-caramel-text flex items-center gap-1.5">
              <Sparkles className="size-3 text-brand-caramel" />
              Download Mode
            </span>
            <span className="font-mono text-xs font-semibold text-brand-espresso">
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
                  ? 'border-brand-caramel bg-brand-caramel text-brand-cream-light font-bold shadow-xs ring-1 ring-brand-caramel'
                  : 'border-brand-sage bg-surface-white text-brand-espresso hover:bg-brand-cream-dark hover:border-brand-caramel'
              }`}
            >
              <div className="flex items-center gap-1 text-xs font-bold">
                <Video className="size-3.5" />
                <span>Video + Audio</span>
              </div>
              <span className={`text-xs ${currentMode === 'video_audio' ? 'text-brand-cream-light/80' : 'text-brand-caramel-text'}`}>
                Full Merged Video
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleModeChange('audio_only')}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-center transition-all ${
                currentMode === 'audio_only'
                  ? 'border-brand-caramel bg-brand-caramel text-brand-cream-light font-bold shadow-xs ring-1 ring-brand-caramel'
                  : 'border-brand-sage bg-surface-white text-brand-espresso hover:bg-brand-cream-dark hover:border-brand-caramel'
              }`}
            >
              <div className="flex items-center gap-1 text-xs font-bold">
                <Music className="size-3.5" />
                <span>Audio Only</span>
              </div>
              <span className={`text-xs ${currentMode === 'audio_only' ? 'text-brand-cream-light/80' : 'text-brand-caramel-text'}`}>
                MP3 / FLAC / WAV
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleModeChange('video_only')}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-center transition-all ${
                currentMode === 'video_only'
                  ? 'border-brand-caramel bg-brand-caramel text-brand-cream-light font-bold shadow-xs ring-1 ring-brand-caramel'
                  : 'border-brand-sage bg-surface-white text-brand-espresso hover:bg-brand-cream-dark hover:border-brand-caramel'
              }`}
            >
              <div className="flex items-center gap-1 text-xs font-bold">
                <Film className="size-3.5" />
                <span>Video Only</span>
              </div>
              <span className={`text-xs ${currentMode === 'video_only' ? 'text-brand-cream-light/80' : 'text-brand-caramel-text'}`}>
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
        <div className="space-y-2 pt-1 border-t border-brand-sage/60">
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-none">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`rounded-xl px-3 py-1 text-xs font-semibold transition-all ${
                  activeTab === 'all'
                    ? 'bg-brand-caramel text-brand-cream-light shadow-xs font-bold'
                    : 'bg-brand-cream-dark/70 text-brand-espresso hover:bg-brand-cream-dark border border-brand-sage/60'
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
                        ? 'bg-brand-caramel text-brand-cream-light shadow-xs font-bold'
                        : 'bg-brand-cream-dark/70 text-brand-espresso hover:bg-brand-cream-dark border border-brand-sage/60'
                    }`}
                  >
                    <Icon className="size-3" />
                    <span>{g.label}</span>
                    <span className="font-mono text-xs px-1.5 py-0.2 rounded-full bg-brand-sage/40 font-bold">
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
          <Search className="absolute left-3 top-2.5 size-3.5 text-brand-caramel-text" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search parameter names, descriptions..."
            className="w-full rounded-xl border border-brand-sage bg-surface-white pl-9 pr-8 py-2 text-xs text-brand-espresso placeholder-brand-caramel-text/60 focus:border-brand-caramel focus:outline-none focus:ring-1 focus:ring-brand-caramel/30 font-medium"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2.5 text-brand-caramel-text hover:text-brand-espresso"
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

          const fieldHelper = (() => {
          const parts: string[] = []
          if (field.unit) parts.push(field.unit)
          if (field.default !== undefined && val !== undefined && val !== field.default) {
            parts.push(`Default: ${String(field.default)}`)
          }
          if (field.minimum !== undefined || field.maximum !== undefined) {
            parts.push(`Range: ${field.minimum ?? '−∞'}…${field.maximum ?? '+∞'}`)
          }
          return parts.join(' · ')
        })()
        return (
          <div key={key} className={`space-y-2 rounded-2xl border border-brand-sage bg-surface-white p-3.5 transition-all hover:border-brand-caramel/70 shadow-xs ${
            isFullWidth ? 'sm:col-span-2' : ''
          }`}>
            <div className="flex items-center justify-between">
              <label className="font-bold text-brand-espresso text-xs flex items-center gap-1.5">
                {field.title || key}
              </label>
              {val !== undefined && (
                <button
                  type="button"
                  onClick={() => setField(key, undefined)}
                  className="flex items-center gap-1 font-mono text-xs text-brand-caramel-text hover:text-accent-contrast transition-colors"
                >
                  <RotateCcw className="size-2.5" /> reset
                </button>
              )}
            </div>

{field.description && (
              <p className="text-xs text-brand-caramel-text leading-relaxed">{field.description}</p>
            )}
            {fieldHelper && (
              <p className="text-xs font-mono text-brand-caramel-text/80 leading-tight">
                {fieldHelper}
              </p>
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
                  className="w-full rounded-xl border border-brand-sage bg-brand-cream/70 px-3 py-2 text-xs text-brand-espresso font-mono font-medium focus:border-brand-caramel focus:bg-surface-white focus:outline-none"
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
                    className="size-4 rounded border-brand-sage bg-brand-cream accent-brand-caramel cursor-pointer"
                  />
                  <label htmlFor={`field-${key}`} className="text-xs font-semibold text-brand-espresso select-none cursor-pointer">
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
                    className="w-full rounded-xl border border-brand-sage bg-brand-cream/70 pl-3 pr-8 py-2 font-mono text-xs text-brand-espresso focus:border-brand-caramel focus:bg-surface-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecrets((p) => ({ ...p, [key]: !p[key] }))}
                    className="absolute right-2.5 top-2.5 text-brand-caramel-text hover:text-brand-espresso"
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
                    className="w-full rounded-xl border border-brand-sage bg-brand-cream/70 px-3 py-2 font-mono text-xs text-brand-espresso placeholder-brand-caramel-text/60 focus:border-brand-caramel focus:bg-surface-white focus:outline-none leading-relaxed"
                  />
                  {key === 'raw_args' && (
                    <FileCode className="absolute right-2.5 bottom-2.5 size-3.5 text-brand-caramel-text pointer-events-none" />
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
                  className="w-full rounded-xl border border-brand-sage bg-brand-cream/70 px-3 py-2 text-xs text-brand-espresso placeholder-brand-caramel-text/60 focus:border-brand-caramel focus:bg-surface-white focus:outline-none font-mono font-medium"
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
