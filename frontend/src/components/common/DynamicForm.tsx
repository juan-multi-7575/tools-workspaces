import { useMemo, useRef, useState, type CSSProperties } from 'react'
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
import { useHostSkin } from '../../lib/hostSkin'

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

  // Every tool page routes its manifest through this form, so none of them can
  // be asked to theme it: it reads the board it was mounted in instead.
  const rootRef = useRef<HTMLDivElement>(null)
  const skin = useHostSkin(rootRef)

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
      <div ref={rootRef} className="tool-form" data-tone={skin.tone} style={{ '--tool-ink': skin.ink } as CSSProperties}>
        <div className="tool-panel-quiet rounded-xl border p-5 text-center text-xs font-mono tool-muted">
          No configurable parameters for this tool.
        </div>
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className="tool-form @container space-y-4 font-sans text-xs"
      data-tone={skin.tone}
      style={{ '--tool-ink': skin.ink } as CSSProperties}
    >
      {/* ========================================================================= */}
      {/* 1. HERO URL INSERTION BAR (High-Priority Primary Control)                */}
      {/* ========================================================================= */}
      {urlKey && (
        <div data-param-key={urlKey} className="tool-panel relative rounded-2xl border-2 p-4 transition-all">
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-xs font-bold">
              <span className="tool-on-accent flex size-5 items-center justify-center rounded-md">
                <Link2 className="size-3" />
              </span>
              <span>{schema[urlKey]?.title ? String(schema[urlKey].title) : 'Target Media URL'}</span>
              <span className="tool-accent-chip font-mono text-xs font-bold px-2 py-0.5 rounded-full">
                REQUIRED
              </span>
            </label>

            {value[urlKey] !== undefined && value[urlKey] !== '' && (
              <button
                type="button"
                onClick={() => setField(urlKey, undefined)}
                className="tool-quiet-action flex items-center gap-1 font-mono text-xs"
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
                  : 'https://www.youtube.com/watch?v=… or media link'
              }
              className="tool-well w-full rounded-xl pl-3.5 pr-20 py-2.5 font-mono font-medium"
            />
            <button
              type="button"
              onClick={() => handlePasteUrl(urlKey)}
              className="tool-panel-quiet absolute right-1.5 top-1.5 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold active:scale-95 transition-all"
              title="Paste URL from clipboard"
            >
              <Clipboard className="size-3 tool-accent-text" />
              <span>Paste</span>
            </button>
          </div>

          {schema[urlKey]?.description && (
            <p className="mt-2 text-xs tool-muted flex items-center gap-1.5">
              <span className="size-1.5 rounded-full tool-accent-text inline-block" />
              {String(schema[urlKey].description)}
            </p>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. DOWNLOAD MODE SELECTOR (Video + Audio / Audio Only / Video Only)        */}
      {/* ========================================================================= */}
      {hasDownloadMode && (
        <div data-param-key="download_mode" className="tool-panel-quiet rounded-2xl border p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase font-bold tracking-wider tool-muted flex items-center gap-1.5">
              <Sparkles className="size-3 tool-accent-text" />
              Download Mode
            </span>
            <span className="font-mono text-xs font-semibold">
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
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-center transition-all font-bold ${
                currentMode === 'video_audio' ? 'tool-on-accent' : 'tool-choice'
              }`}
            >
              <div className="flex items-center gap-1 text-xs font-bold">
                <Video className="size-3.5" />
                <span>Video + Audio</span>
              </div>
              <span className={`text-xs ${currentMode === 'video_audio' ? 'opacity-80' : 'tool-muted'}`}>
                Full Merged Video
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleModeChange('audio_only')}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-center transition-all font-bold ${
                currentMode === 'audio_only' ? 'tool-on-accent' : 'tool-choice'
              }`}
            >
              <div className="flex items-center gap-1 text-xs font-bold">
                <Music className="size-3.5" />
                <span>Audio Only</span>
              </div>
              <span className={`text-xs ${currentMode === 'audio_only' ? 'opacity-80' : 'tool-muted'}`}>
                MP3 / FLAC / WAV
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleModeChange('video_only')}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-center transition-all font-bold ${
                currentMode === 'video_only' ? 'tool-on-accent' : 'tool-choice'
              }`}
            >
              <div className="flex items-center gap-1 text-xs font-bold">
                <Film className="size-3.5" />
                <span>Video Only</span>
              </div>
              <span className={`text-xs ${currentMode === 'video_only' ? 'opacity-80' : 'tool-muted'}`}>
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
        <div className="space-y-2 pt-1 border-t tool-rule">
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-none">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`rounded-xl px-3 py-1 text-xs font-semibold transition-all ${
                  activeTab === 'all' ? 'tool-on-accent font-bold' : 'tool-panel-quiet border'
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
                      isActive ? 'tool-on-accent font-bold' : 'tool-panel-quiet border'
                    }`}
                  >
                    <Icon className="size-3" />
                    <span>{g.label}</span>
                    <span className="tool-accent-chip font-mono text-xs px-1.5 py-0.2 rounded-full font-bold">
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
          <Search className="absolute left-3 top-2.5 size-3.5 tool-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search parameter names, descriptions…"
            className="tool-well w-full rounded-xl pl-9 pr-8 py-2 font-medium"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="tool-quiet-action absolute right-2.5 top-2.5"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. PARAMETER FORM GRID WITH DUAL FILE INGESTION                           */}
      {/* ========================================================================= */}
      {/* The grid splits on its own width, not the viewport's. Several hosts mount
        this form in a rail far narrower than the window, where a viewport
        breakpoint would still ask for two columns and squeeze a field until its
        label and placeholder were cut off mid-word. The query container is the
        form root: putting it on the grid itself makes its track sizing depend on
        the very query it is answering, which collapses the columns. */}
      <div className="grid grid-cols-1 gap-3 @min-[26rem]:grid-cols-2">
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
          <div key={key} data-param-key={key} className={`tool-card space-y-2 rounded-2xl border p-3.5 ${
            isFullWidth ? '@min-[26rem]:col-span-2' : ''
          }`}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold flex items-center gap-1.5">
                {field.title || key}
              </label>
              {val !== undefined && (
                <button
                  type="button"
                  onClick={() => setField(key, undefined)}
                  className="tool-quiet-action flex items-center gap-1 font-mono text-xs"
                >
                  <RotateCcw className="size-2.5" /> reset
                </button>
              )}
            </div>

{field.description && (
              <p className="text-xs leading-relaxed tool-muted">{field.description}</p>
            )}
            {fieldHelper && (
              <p className="text-xs font-mono leading-tight tool-faint">
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
                  className="tool-well w-full rounded-xl px-3 py-2 text-xs font-mono font-medium"
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
                    className="tool-checkbox size-4 rounded cursor-pointer"
                  />
                  <label htmlFor={`field-${key}`} className="text-xs font-semibold select-none cursor-pointer">
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
                    className="tool-well w-full rounded-xl pl-3 pr-8 py-2 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecrets((p) => ({ ...p, [key]: !p[key] }))}
                    className="tool-quiet-action absolute right-2.5 top-2.5"
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
                    placeholder={field.placeholder || 'Enter code or command arguments…'}
                    className="tool-well w-full rounded-xl px-3 py-2 font-mono text-xs leading-relaxed"
                  />
                  {key === 'raw_args' && (
                    <FileCode className="absolute right-2.5 bottom-2.5 size-3.5 tool-muted pointer-events-none" />
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
                  placeholder={field.placeholder || `Enter ${key}…`}
                  className="tool-well w-full rounded-xl px-3 py-2 text-xs font-mono font-medium"
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
