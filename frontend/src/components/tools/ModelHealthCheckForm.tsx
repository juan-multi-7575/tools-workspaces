import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  AlertCircle,
  Sparkles,
  KeyRound,
  Eye,
  EyeOff,
  Cpu,
  RefreshCw,
  Check,
  Search,
} from 'lucide-react'
import { api, type DetectedModelProvider } from '../../lib/api'

export default function ModelHealthCheckForm({
  value = {},
  onChange,
}: {
  value?: Record<string, unknown>
  onChange: (nextValue: Record<string, unknown>) => void
}) {
  const [providers, setProviders] = useState<DetectedModelProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [fetchingModels, setFetchingModels] = useState(false)
  const [filterMode, setFilterMode] = useState<'all' | 'detected'>('all')
  const [modelSearchQuery, setModelSearchQuery] = useState('')
  const [modelFamilyFilter, setModelFamilyFilter] = useState('all')
  const [fetchedModelsMap, setFetchedModelsMap] = useState<
    Record<string, { models: string[]; source: string; error?: string }>
  >({})

  const selectedProviderId = (value.provider as string) || 'all'
  const selectedModel = (value.model as string) || ''
  const selectedModels = (value.models as string) || ''
  const apiKey = (value.api_key as string) || ''
  const mockOffline = Boolean(value.mock_offline ?? false)

  const fetchProviders = async () => {
    setScanning(true)
    try {
      const res = await api.getDetectedModelProviders()
      setProviders(res.providers || [])
    } catch {
      // fallback if API is initializing
    } finally {
      setLoading(false)
      setScanning(false)
    }
  }

  const fetchLiveModels = async (pid: string, customKey?: string) => {
    if (pid === 'all') return
    setFetchingModels(true)
    try {
      const res = await api.getProviderModels(pid, customKey || apiKey || undefined)
      setFetchedModelsMap((prev) => ({
        ...prev,
        [pid]: {
          models: res.models || [],
          source: res.source,
          error: res.error,
        },
      }))
    } catch (err: any) {
      setFetchedModelsMap((prev) => ({
        ...prev,
        [pid]: {
          models: [],
          source: 'error',
          error: err?.message || 'Failed to fetch models from provider endpoint',
        },
      }))
    } finally {
      setFetchingModels(false)
    }
  }

  useEffect(() => {
    fetchProviders()
  }, [])

  useEffect(() => {
    if (selectedProviderId !== 'all' && !fetchedModelsMap[selectedProviderId]) {
      fetchLiveModels(selectedProviderId)
    }
  }, [selectedProviderId])

  const setParam = (key: string, val: unknown) => {
    const next = { ...value }
    if (val === undefined || val === '') {
      delete next[key]
    } else {
      next[key] = val
    }
    onChange(next)
  }

  const handleSelectProvider = (pid: string) => {
    const next: Record<string, unknown> = { ...value, provider: pid }
    delete next.model
    delete next.models
    onChange(next)
    setModelSearchQuery('')
    setModelFamilyFilter('all')
    if (pid !== 'all' && !fetchedModelsMap[pid]) {
      fetchLiveModels(pid)
    }
  }

  const selectedProviderObj = providers.find((p) => p.id === selectedProviderId)
  const detectedCount = providers.filter((p) => p.has_key).length

  const filteredProviders = providers.filter((p) => {
    if (filterMode === 'detected' && !p.has_key) return false
    return true
  })

  return (
    <div className="space-y-4 font-sans text-xs text-[#4E220F] w-full min-w-0 overflow-x-hidden">
      {/* 1. BASHRC & ENV SCANNER HEADER */}
      <div className="rounded-2xl border-2 border-[#9D6638]/40 bg-[#EDE5CD]/60 p-3.5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-lg bg-[#9D6638] text-[#FDFBF7] shadow-2xs">
                <KeyRound className="size-3.5" />
              </span>
              <h4 className="font-bold text-xs text-[#4E220F] flex items-center gap-2">
                Shell Profile & Environment Credential Scanner
                <span className="font-mono text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#9D6638]/15 border border-[#9D6638]/30 text-[#4E220F]">
                  ZERO-DISK STORAGE
                </span>
              </h4>
            </div>
            <p className="mt-1 text-[11px] text-[#7C5339]">
              Scans <code className="bg-[#F7F1DE] px-1 py-0.2 rounded border border-[#B0BA99]/60 font-bold">~/.bashrc</code>, <code className="bg-[#F7F1DE] px-1 py-0.2 rounded border border-[#B0BA99]/60 font-bold">~/.zshrc</code>, and active process environment on the fly.
            </p>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className="font-mono text-[10px] font-bold px-2.5 py-1 rounded-xl bg-[#F7F1DE] border border-[#B0BA99] text-[#4E220F] shadow-2xs">
              {loading ? 'Scanning...' : `${detectedCount} of ${providers.length} in Env`}
            </span>
            <button
              type="button"
              onClick={fetchProviders}
              disabled={scanning}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#B0BA99] bg-[#FFFFFF] px-3 py-1.5 text-xs font-bold text-[#4E220F] hover:bg-[#EDE5CD] active:scale-95 transition-all shadow-2xs"
              title="Rescan ~/.bashrc and environment"
            >
              <RefreshCw className={`size-3 text-[#9D6638] ${scanning ? 'animate-spin' : ''}`} />
              <span>{scanning ? 'Scanning...' : 'Rescan'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. INTERACTIVE PROVIDER SELECTOR GRID */}
      <div className="space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <label className="font-bold text-[#4E220F] text-xs flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-[#9D6638]" />
            Select Target AI Provider
          </label>

          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`font-mono text-[10px] px-2.5 py-1 rounded-lg border transition-all ${
                filterMode === 'all'
                  ? 'bg-[#9D6638] text-[#FDFBF7] border-[#9D6638] font-bold shadow-2xs'
                  : 'bg-[#FFFFFF] text-[#4E220F] border-[#B0BA99] hover:bg-[#EDE5CD]'
              }`}
            >
              All Providers ({providers.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('detected')}
              className={`font-mono text-[10px] px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-all ${
                filterMode === 'detected'
                  ? 'bg-[#9D6638] text-[#FDFBF7] border-[#9D6638] font-bold shadow-2xs'
                  : 'bg-[#FFFFFF] text-[#4E220F] border-[#B0BA99] hover:bg-[#EDE5CD]'
              }`}
            >
              <span className="size-1.5 rounded-full bg-emerald-500 inline-block" />
              Detected in Env ({detectedCount})
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {/* ALL PROVIDERS CARD */}
          <button
            type="button"
            onClick={() => handleSelectProvider('all')}
            className={`flex flex-col items-start justify-between rounded-xl border p-3 text-left transition-all relative ${
              selectedProviderId === 'all'
                ? 'border-[#9D6638] bg-[#9D6638] text-[#FDFBF7] font-bold shadow-xs ring-1 ring-[#9D6638]'
                : 'border-[#B0BA99] bg-[#FFFFFF] text-[#4E220F] hover:bg-[#EDE5CD]/50 hover:border-[#9D6638]'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-1">
              <span className="font-bold text-xs">All Providers</span>
              {selectedProviderId === 'all' && <Check className="size-3 text-[#FDFBF7]" />}
            </div>
            <span
              className={`text-[10px] leading-tight ${
                selectedProviderId === 'all' ? 'text-[#FDFBF7]/80' : 'text-[#7C5339]'
              }`}
            >
              Full multi-provider sweep & benchmark ({providers.length} available)
            </span>
          </button>

          {/* INDIVIDUAL PROVIDER CARDS */}
          {filteredProviders.map((p) => {
            const isSelected = selectedProviderId === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectProvider(p.id)}
                className={`flex flex-col items-start justify-between rounded-xl border p-2.5 text-left transition-all relative ${
                  isSelected
                    ? 'border-[#9D6638] bg-[#9D6638] text-[#FDFBF7] font-bold shadow-xs ring-1 ring-[#9D6638]'
                    : p.has_key
                    ? 'border-[#9D6638]/70 bg-[#FDFBF7] text-[#4E220F] hover:bg-[#EDE5CD]/50 hover:border-[#9D6638]'
                    : 'border-[#B0BA99] bg-[#FFFFFF] text-[#4E220F] hover:bg-[#EDE5CD]/50 hover:border-[#9D6638]'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="font-bold text-xs truncate">{p.name}</span>
                    {p.is_custom && (
                      <span className={`font-mono text-[8px] px-1 py-0.2 rounded border ${
                        isSelected ? 'bg-[#FDFBF7]/20 border-white/40' : 'bg-[#EDE5CD] border-[#B0BA99]'
                      }`}>
                        Env
                      </span>
                    )}
                  </div>
                  {isSelected && <Check className="size-3 text-[#FDFBF7] shrink-0" />}
                </div>

                <div className="flex items-center justify-between w-full gap-1 mt-0.5">
                  {p.has_key ? (
                    <span
                      className={`inline-flex items-center gap-1 font-mono text-[9px] font-bold px-1.5 py-0.2 rounded-md ${
                        isSelected
                          ? 'bg-[#FDFBF7]/20 text-[#FDFBF7]'
                          : 'bg-[#9D6638]/15 text-[#4E220F] border border-[#9D6638]/40'
                      }`}
                    >
                      <CheckCircle2 className={`size-2.5 ${isSelected ? 'text-[#FDFBF7]' : 'text-[#9D6638]'}`} />
                      {p.source === 'local-python' || p.source === 'local-daemon' ? 'Local Runtime' : p.source}
                    </span>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1 font-mono text-[9px] px-1.5 py-0.2 rounded-md ${
                        isSelected ? 'bg-[#FDFBF7]/15 text-[#FDFBF7]/80' : 'bg-[#EDE5CD] text-[#7C5339]'
                      }`}
                    >
                      <AlertCircle className="size-2.5 opacity-60" />
                      Key Missing
                    </span>
                  )}

                  {p.env_vars && p.env_vars.length > 0 && (
                    <span className={`font-mono text-[8px] truncate max-w-[95px] ${
                      isSelected ? 'text-[#FDFBF7]/70' : 'text-[#7C5339]/80'
                    }`} title={p.env_vars.join(', ')}>
                      {p.env_vars[0]}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 3. DYNAMIC MODEL SELECTOR & LIVE MODEL FETCHER (When Single Provider Selected) */}
      {selectedProviderId !== 'all' && selectedProviderObj && (() => {
        const fetchInfo = fetchedModelsMap[selectedProviderId]
        const availableModels = fetchInfo?.models && fetchInfo.models.length > 0
          ? fetchInfo.models
          : selectedProviderObj.models
        const isLive = fetchInfo?.source === 'live_api'

        const selectedList = typeof selectedModels === 'string' && selectedModels.trim()
          ? selectedModels.split(',').map((s) => s.trim()).filter(Boolean)
          : (selectedModel ? [selectedModel] : [])

        const toggleModel = (m: string) => {
          let nextList: string[]
          if (selectedList.includes(m)) {
            nextList = selectedList.filter((item) => item !== m)
          } else {
            nextList = [...selectedList, m]
          }
          const next = { ...value }
          if (nextList.length === 0) {
            delete next.model
            delete next.models
          } else if (nextList.length === 1) {
            next.model = nextList[0]
            delete next.models
          } else {
            delete next.model
            next.models = nextList.join(',')
          }
          onChange(next)
        }

        const selectAllFiltered = (listToSelect: string[]) => {
          const next = { ...value }
          delete next.model
          next.models = listToSelect.join(',')
          onChange(next)
        }

        const clearSelection = () => {
          const next = { ...value }
          delete next.model
          delete next.models
          onChange(next)
        }

        const filteredModels = availableModels.filter((m) => {
          if (modelFamilyFilter !== 'all' && !m.toLowerCase().includes(modelFamilyFilter.toLowerCase())) {
            return false
          }
          if (modelSearchQuery.trim() && !m.toLowerCase().includes(modelSearchQuery.toLowerCase())) {
            return false
          }
          return true
        })

        // Common model families present in the list
        const families = ['all', 'nemotron', 'llama', 'mistral', 'gemma', 'deepseek', 'vision', 'instruct']
          .filter((f) => f === 'all' || availableModels.some((m) => m.toLowerCase().includes(f)))

        return (
          <div className="rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] p-3.5 space-y-3 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="font-bold text-[#4E220F] text-xs flex items-center gap-1.5">
                <Cpu className="size-3.5 text-[#9D6638]" />
                Target Models for {selectedProviderObj.name}
              </label>

              <div className="flex items-center gap-2">
                <span className={`font-mono text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                  isLive
                    ? 'bg-[#9D6638]/15 border-[#9D6638]/40 text-[#4E220F]'
                    : 'bg-[#EDE5CD] border-[#B0BA99] text-[#7C5339]'
                }`}>
                  {isLive ? `Live API (${availableModels.length} models)` : `Default Catalog (${availableModels.length} models)`}
                </span>

                <button
                  type="button"
                  onClick={() => fetchLiveModels(selectedProviderId)}
                  disabled={fetchingModels}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#B0BA99] bg-[#F7F1DE] px-2.5 py-1 text-[10px] font-bold text-[#4E220F] hover:bg-[#EDE5CD] transition-all"
                  title="Query /v1/models endpoint directly to fetch all live available models"
                >
                  <RefreshCw className={`size-3 text-[#9D6638] ${fetchingModels ? 'animate-spin' : ''}`} />
                  <span>{fetchingModels ? 'Fetching Models...' : 'Fetch Live Models'}</span>
                </button>
              </div>
            </div>

            {fetchInfo?.error && (
              <div className="rounded-xl bg-[#EDE5CD]/50 border border-[#B0BA99]/60 px-3 py-1.5 text-[10px] text-[#7C5339] flex items-center gap-1.5">
                <AlertCircle className="size-3 text-[#9D6638] shrink-0" />
                <span>{fetchInfo.error}</span>
              </div>
            )}

            {/* Model Search & Filter Header */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="size-3.5 text-[#7C5339] absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={modelSearchQuery}
                  onChange={(e) => setModelSearchQuery(e.target.value)}
                  placeholder={`Search ${availableModels.length} models (e.g. nemotron, llama, gemma, mistral, deepseek)...`}
                  className="w-full rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/40 pl-8 pr-16 py-1.5 font-mono text-[11px] text-[#4E220F] placeholder-[#7C5339]/60 focus:border-[#9D6638] focus:bg-[#FFFFFF] focus:outline-none shadow-2xs"
                />
                {modelSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setModelSearchQuery('')}
                    className="absolute right-2 top-1 font-mono text-[9px] text-[#7C5339] hover:text-[#4E220F] px-1.5 py-0.5 rounded bg-[#EDE5CD]"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Family Filter Pills & Selection Controls */}
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex flex-wrap items-center gap-1">
                  {families.map((fam) => (
                    <button
                      key={fam}
                      type="button"
                      onClick={() => setModelFamilyFilter(fam)}
                      className={`font-mono text-[9px] px-2 py-0.5 rounded-md capitalize border transition-all ${
                        modelFamilyFilter === fam
                          ? 'bg-[#9D6638] border-[#9D6638] text-[#FDFBF7] font-bold shadow-2xs'
                          : 'bg-[#FDFBF7] border-[#B0BA99] text-[#7C5339] hover:bg-[#EDE5CD]'
                      }`}
                    >
                      {fam}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => selectAllFiltered(filteredModels)}
                    className="font-mono text-[9px] px-2 py-0.5 rounded-md border border-[#B0BA99] bg-[#FDFBF7] text-[#4E220F] hover:bg-[#EDE5CD] transition-all"
                  >
                    Select All Filtered ({filteredModels.length})
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="font-mono text-[9px] px-2 py-0.5 rounded-md border border-[#B0BA99] bg-[#FDFBF7] text-[#7C5339] hover:bg-[#EDE5CD] transition-all"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => selectAllFiltered(availableModels)}
                    className={`font-mono text-[9px] font-bold px-2 py-0.5 rounded-md border transition-all ${
                      selectedList.length === 0
                        ? 'bg-[#9D6638]/15 border-[#9D6638]/40 text-[#4E220F] hover:bg-[#9D6638]/25'
                        : 'bg-[#EDE5CD] border-[#B0BA99] text-[#7C5339] hover:bg-[#EDE5CD]/80'
                    }`}
                    title="Select and probe all available models from provider"
                  >
                    {selectedList.length === 0 ? `Probe All (${availableModels.length})` : `${selectedList.length} Selected (Click for All)`}
                  </button>
                </div>
              </div>
            </div>

            {/* Complete Model Selection Grid (All Models, No Artificial Slicing) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-[#7C5339] font-mono">
                <span>Click model to select/toggle:</span>
                <span>Showing {filteredModels.length} of {availableModels.length} models</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1 border border-[#B0BA99]/40 rounded-xl p-2 bg-[#F7F1DE]/20">
                {filteredModels.length === 0 ? (
                  <div className="w-full py-4 text-center text-xs text-[#7C5339] italic">
                    No models matching "{modelSearchQuery}" under {modelFamilyFilter}
                  </div>
                ) : (
                  filteredModels.map((m) => {
                    const isSelected = selectedList.includes(m)
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleModel(m)}
                        className={`inline-flex items-center gap-1 font-mono text-[10px] px-2.5 py-1 rounded-lg border transition-all truncate max-w-[280px] ${
                          isSelected
                            ? 'bg-[#9D6638] border-[#9D6638] text-[#FDFBF7] font-bold shadow-xs'
                            : 'bg-[#FFFFFF] border-[#B0BA99] text-[#4E220F] hover:bg-[#EDE5CD] hover:border-[#9D6638]'
                        }`}
                        title={m}
                      >
                        {isSelected ? (
                          <Check className="size-2.5 text-[#FDFBF7] shrink-0" />
                        ) : (
                          <span className="size-1.5 rounded-full bg-[#B0BA99] shrink-0" />
                        )}
                        <span className="truncate">{m}</span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 min-w-0 w-full">
              <select
                value={selectedList.length === 1 ? selectedList[0] : ''}
                onChange={(e) => {
                  const m = e.target.value
                  const next = { ...value }
                  if (m) {
                    next.model = m
                    delete next.models
                  } else {
                    delete next.model
                    delete next.models
                  }
                  onChange(next)
                }}
                className="flex-1 min-w-0 rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/80 px-3 py-2 text-xs text-[#4E220F] font-mono font-medium focus:border-[#9D6638] focus:bg-[#FFFFFF] focus:outline-none"
              >
                <option value="">
                  {selectedList.length > 1
                    ? `— ${selectedList.length} Models Selected for Probe —`
                    : `— Probe All Provider Models (${availableModels.length} models) —`}
                </option>
                {availableModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={selectedModel}
                onChange={(e) => setParam('model', e.target.value)}
                placeholder="Or custom model ID..."
                className="w-full sm:w-48 shrink-0 min-w-0 rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/60 px-3 py-2 text-xs text-[#4E220F] font-mono placeholder-[#7C5339]/60 focus:border-[#9D6638] focus:bg-[#FFFFFF] focus:outline-none"
              />
            </div>

            <p className="text-[11px] text-[#7C5339]">
              {selectedProviderObj.description}
            </p>
          </div>
        )
      })()}

      {/* 4. EPHEMERAL API KEY INPUT (If key missing or user wants custom ephemeral override) */}
      <div className="rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] p-3.5 space-y-2 shadow-2xs">
        <div className="flex items-center justify-between">
          <label className="font-bold text-[#4E220F] text-xs flex items-center gap-1.5">
            <KeyRound className="size-3.5 text-[#9D6638]" />
            Ephemeral API Key Override (Optional)
          </label>

          {selectedProviderObj?.has_key && !apiKey && (
            <span className="font-mono text-[10px] font-bold text-[#4E220F] flex items-center gap-1">
              <CheckCircle2 className="size-3 text-[#9D6638]" />
              Detected from {selectedProviderObj.source}
            </span>
          )}
        </div>

        <div className="relative">
          <input
            type={showSecret ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setParam('api_key', e.target.value)}
            placeholder={
              selectedProviderObj?.has_key
                ? `Using ${selectedProviderObj.source} credentials (or paste temporary override here)...`
                : selectedProviderObj?.env_vars?.length
                  ? `Enter temporary key (or export ${selectedProviderObj.env_vars.join(' / ')} in ~/.bashrc)...`
                  : 'Enter temporary API key...'
            }
            className="w-full rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/70 pl-3.5 pr-10 py-2.5 font-mono text-xs text-[#4E220F] placeholder-[#7C5339]/60 shadow-inner focus:border-[#9D6638] focus:bg-[#FFFFFF] focus:outline-none font-medium"
          />
          <button
            type="button"
            onClick={() => setShowSecret((p) => !p)}
            className="absolute right-3 top-2.5 text-[#7C5339] hover:text-[#4E220F] transition-colors"
          >
            {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>

        <p className="text-[11px] text-[#7C5339] flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-[#9D6638] inline-block" />
          Never saved to disk or config. In-memory execution only for this probe.
        </p>
      </div>

      {/* 5. DRY-RUN MOCK SIMULATION TOGGLE */}
      <div className="flex items-center justify-between rounded-xl border border-[#B0BA99]/70 bg-[#EDE5CD]/40 p-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="mock-offline-toggle"
            checked={mockOffline}
            onChange={(e) => setParam('mock_offline', e.target.checked)}
            className="size-4 rounded border-[#B0BA99] bg-[#F7F1DE] accent-[#9D6638] cursor-pointer"
          />
          <label htmlFor="mock-offline-toggle" className="text-xs font-bold text-[#4E220F] cursor-pointer select-none">
            Mock Offline Simulation (Dry-Run Mode)
          </label>
        </div>
        <span className="font-mono text-[10px] text-[#7C5339]">Tests UI & probe flow without network calls</span>
      </div>
    </div>
  )
}
