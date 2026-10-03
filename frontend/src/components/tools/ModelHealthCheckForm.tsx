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
import { errorMessage } from '../../lib/apiTransport'

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
          error: res.error ? errorMessage(res.error) : undefined,
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
    <div className="space-y-4 font-sans text-xs text-brand-espresso w-full min-w-0 overflow-x-hidden">
      {/* 1. BASHRC & ENV SCANNER HEADER */}
      <div className="rounded-2xl border-2 border-brand-caramel/40 bg-brand-cream-dark/60 p-3.5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-lg bg-brand-caramel text-brand-cream-light shadow-2xs">
                <KeyRound className="size-3.5" />
              </span>
              <h4 className="font-bold text-xs text-brand-espresso flex items-center gap-2">
                Shell Profile & Environment Credential Scanner
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-brand-caramel/15 border border-brand-caramel/30 text-brand-espresso">
                  ZERO-DISK STORAGE
                </span>
              </h4>
            </div>
            <p className="mt-1 text-xs text-brand-caramel-text">
              Scans <code className="bg-brand-cream px-1 py-0.2 rounded border border-brand-sage/60 font-bold">~/.bashrc</code>, <code className="bg-brand-cream px-1 py-0.2 rounded border border-brand-sage/60 font-bold">~/.zshrc</code>, and active process environment on the fly.
            </p>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-xl bg-brand-cream border border-brand-sage text-brand-espresso shadow-2xs">
              {loading ? 'Scanning...' : `${detectedCount} of ${providers.length} in Env`}
            </span>
            <button
              type="button"
              onClick={fetchProviders}
              disabled={scanning}
              className="inline-flex items-center gap-1.5 rounded-xl border border-brand-sage bg-surface-white px-3 py-1.5 text-xs font-bold text-brand-espresso hover:bg-brand-cream-dark active:scale-95 transition-all shadow-2xs"
              title="Rescan ~/.bashrc and environment"
            >
              <RefreshCw className={`size-3 text-brand-caramel ${scanning ? 'animate-spin' : ''}`} />
              <span>{scanning ? 'Scanning...' : 'Rescan'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. INTERACTIVE PROVIDER SELECTOR GRID */}
      <div className="space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <label className="font-bold text-brand-espresso text-xs flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-brand-caramel" />
            Select Target AI Provider
          </label>

          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`font-mono text-xs px-2.5 py-1 rounded-lg border transition-all ${
                filterMode === 'all'
                  ? 'bg-brand-caramel text-brand-cream-light border-brand-caramel font-bold shadow-2xs'
                  : 'bg-surface-white text-brand-espresso border-brand-sage hover:bg-brand-cream-dark'
              }`}
            >
              All Providers ({providers.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('detected')}
              className={`font-mono text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-all ${
                filterMode === 'detected'
                  ? 'bg-brand-caramel text-brand-cream-light border-brand-caramel font-bold shadow-2xs'
                  : 'bg-surface-white text-brand-espresso border-brand-sage hover:bg-brand-cream-dark'
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
                ? 'border-brand-caramel bg-brand-caramel text-brand-cream-light font-bold shadow-xs ring-1 ring-brand-caramel'
                : 'border-brand-sage bg-surface-white text-brand-espresso hover:bg-brand-cream-dark/50 hover:border-brand-caramel'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-1">
              <span className="font-bold text-xs">All Providers</span>
              {selectedProviderId === 'all' && <Check className="size-3 text-brand-cream-light" />}
            </div>
            <span
              className={`text-xs leading-tight ${
                selectedProviderId === 'all' ? 'text-brand-cream-light/80' : 'text-brand-caramel-text'
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
                    ? 'border-brand-caramel bg-brand-caramel text-brand-cream-light font-bold shadow-xs ring-1 ring-brand-caramel'
                    : p.has_key
                    ? 'border-brand-caramel/70 bg-brand-cream-light text-brand-espresso hover:bg-brand-cream-dark/50 hover:border-brand-caramel'
                    : 'border-brand-sage bg-surface-white text-brand-espresso hover:bg-brand-cream-dark/50 hover:border-brand-caramel'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="font-bold text-xs truncate">{p.name}</span>
                    {p.is_custom && (
                      <span className={`font-mono text-[8px] px-1 py-0.2 rounded border ${
                        isSelected ? 'bg-brand-cream-light/20 border-white/40' : 'bg-brand-cream-dark border-brand-sage'
                      }`}>
                        Env
                      </span>
                    )}
                  </div>
                  {isSelected && <Check className="size-3 text-brand-cream-light shrink-0" />}
                </div>

                <div className="flex items-center justify-between w-full gap-1 mt-0.5">
                  {p.has_key ? (
                    <span
                      className={`inline-flex items-center gap-1 font-mono text-xs font-bold px-1.5 py-0.2 rounded-md ${
                        isSelected
                          ? 'bg-brand-cream-light/20 text-brand-cream-light'
                          : 'bg-brand-caramel/15 text-brand-espresso border border-brand-caramel/40'
                      }`}
                    >
                      <CheckCircle2 className={`size-2.5 ${isSelected ? 'text-brand-cream-light' : 'text-brand-caramel'}`} />
                      {p.source === 'local-python' || p.source === 'local-daemon' ? 'Local Runtime' : p.source}
                    </span>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1 font-mono text-xs px-1.5 py-0.2 rounded-md ${
                        isSelected ? 'bg-brand-cream-light/15 text-brand-cream-light/80' : 'bg-brand-cream-dark text-brand-caramel-text'
                      }`}
                    >
                      <AlertCircle className="size-2.5 opacity-60" />
                      Key Missing
                    </span>
                  )}

                  {p.env_vars && p.env_vars.length > 0 && (
                    <span className={`font-mono text-[8px] truncate max-w-[95px] ${
                      isSelected ? 'text-brand-cream-light/70' : 'text-brand-caramel-text/80'
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
          <div className="rounded-2xl border border-brand-sage bg-surface-white p-3.5 space-y-3 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="font-bold text-brand-espresso text-xs flex items-center gap-1.5">
                <Cpu className="size-3.5 text-brand-caramel" />
                Target Models for {selectedProviderObj.name}
              </label>

              <div className="flex items-center gap-2">
                <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded-full border ${
                  isLive
                    ? 'bg-brand-caramel/15 border-brand-caramel/40 text-brand-espresso'
                    : 'bg-brand-cream-dark border-brand-sage text-brand-caramel-text'
                }`}>
                  {isLive ? `Live API (${availableModels.length} models)` : `Default Catalog (${availableModels.length} models)`}
                </span>

                <button
                  type="button"
                  onClick={() => fetchLiveModels(selectedProviderId)}
                  disabled={fetchingModels}
                  className="inline-flex items-center gap-1 rounded-lg border border-brand-sage bg-brand-cream px-2.5 py-1 text-xs font-bold text-brand-espresso hover:bg-brand-cream-dark transition-all"
                  title="Query /v1/models endpoint directly to fetch all live available models"
                >
                  <RefreshCw className={`size-3 text-brand-caramel ${fetchingModels ? 'animate-spin' : ''}`} />
                  <span>{fetchingModels ? 'Fetching Models...' : 'Fetch Live Models'}</span>
                </button>
              </div>
            </div>

            {fetchInfo?.error && (
              <div className="rounded-xl bg-brand-cream-dark/50 border border-brand-sage/60 px-3 py-1.5 text-xs text-brand-caramel-text flex items-center gap-1.5">
                <AlertCircle className="size-3 text-brand-caramel shrink-0" />
                <span>{fetchInfo.error}</span>
              </div>
            )}

            {/* Model Search & Filter Header */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="size-3.5 text-brand-caramel-text absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={modelSearchQuery}
                  onChange={(e) => setModelSearchQuery(e.target.value)}
                  placeholder={`Search ${availableModels.length} models (e.g. nemotron, llama, gemma, mistral, deepseek)...`}
                  className="w-full rounded-xl border border-brand-sage bg-brand-cream/40 pl-8 pr-16 py-1.5 font-mono text-xs text-brand-espresso placeholder-brand-caramel-text/60 focus:border-brand-caramel focus:bg-surface-white focus:outline-none shadow-2xs"
                />
                {modelSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setModelSearchQuery('')}
                    className="absolute right-2 top-1 font-mono text-xs text-brand-caramel-text hover:text-brand-espresso px-1.5 py-0.5 rounded bg-brand-cream-dark"
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
                      className={`font-mono text-xs px-2 py-0.5 rounded-md capitalize border transition-all ${
                        modelFamilyFilter === fam
                          ? 'bg-brand-caramel border-brand-caramel text-brand-cream-light font-bold shadow-2xs'
                          : 'bg-brand-cream-light border-brand-sage text-brand-caramel-text hover:bg-brand-cream-dark'
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
                    className="font-mono text-xs px-2 py-0.5 rounded-md border border-brand-sage bg-brand-cream-light text-brand-espresso hover:bg-brand-cream-dark transition-all"
                  >
                    Select All Filtered ({filteredModels.length})
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="font-mono text-xs px-2 py-0.5 rounded-md border border-brand-sage bg-brand-cream-light text-brand-caramel-text hover:bg-brand-cream-dark transition-all"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => selectAllFiltered(availableModels)}
                    className={`font-mono text-xs font-bold px-2 py-0.5 rounded-md border transition-all ${
                      selectedList.length === 0
                        ? 'bg-brand-caramel/15 border-brand-caramel/40 text-brand-espresso hover:bg-brand-caramel/25'
                        : 'bg-brand-cream-dark border-brand-sage text-brand-caramel-text hover:bg-brand-cream-dark/80'
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
              <div className="flex items-center justify-between text-xs text-brand-caramel-text font-mono">
                <span>Click model to select/toggle:</span>
                <span>Showing {filteredModels.length} of {availableModels.length} models</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1 border border-brand-sage/40 rounded-xl p-2 bg-brand-cream/20">
                {filteredModels.length === 0 ? (
                  <div className="w-full py-4 text-center text-xs text-brand-caramel-text italic">
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
                        className={`inline-flex items-center gap-1 font-mono text-xs px-2.5 py-1 rounded-lg border transition-all truncate max-w-[280px] ${
                          isSelected
                            ? 'bg-brand-caramel border-brand-caramel text-brand-cream-light font-bold shadow-xs'
                            : 'bg-surface-white border-brand-sage text-brand-espresso hover:bg-brand-cream-dark hover:border-brand-caramel'
                        }`}
                        title={m}
                      >
                        {isSelected ? (
                          <Check className="size-2.5 text-brand-cream-light shrink-0" />
                        ) : (
                          <span className="size-1.5 rounded-full bg-brand-sage shrink-0" />
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
                className="flex-1 min-w-0 rounded-xl border border-brand-sage bg-brand-cream/80 px-3 py-2 text-xs text-brand-espresso font-mono font-medium focus:border-brand-caramel focus:bg-surface-white focus:outline-none"
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
                className="w-full sm:w-48 shrink-0 min-w-0 rounded-xl border border-brand-sage bg-brand-cream/60 px-3 py-2 text-xs text-brand-espresso font-mono placeholder-brand-caramel-text/60 focus:border-brand-caramel focus:bg-surface-white focus:outline-none"
              />
            </div>

            <p className="text-xs text-brand-caramel-text">
              {selectedProviderObj.description}
            </p>
          </div>
        )
      })()}

      {/* 4. EPHEMERAL API KEY INPUT (If key missing or user wants custom ephemeral override) */}
      <div className="rounded-2xl border border-brand-sage bg-surface-white p-3.5 space-y-2 shadow-2xs">
        <div className="flex items-center justify-between">
          <label className="font-bold text-brand-espresso text-xs flex items-center gap-1.5">
            <KeyRound className="size-3.5 text-brand-caramel" />
            Ephemeral API Key Override (Optional)
          </label>

          {selectedProviderObj?.has_key && !apiKey && (
            <span className="font-mono text-xs font-bold text-brand-espresso flex items-center gap-1">
              <CheckCircle2 className="size-3 text-brand-caramel" />
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
            className="w-full rounded-xl border border-brand-sage bg-brand-cream/70 pl-3.5 pr-10 py-2.5 font-mono text-xs text-brand-espresso placeholder-brand-caramel-text/60 shadow-inner focus:border-brand-caramel focus:bg-surface-white focus:outline-none font-medium"
          />
          <button
            type="button"
            onClick={() => setShowSecret((p) => !p)}
            className="absolute right-3 top-2.5 text-brand-caramel-text hover:text-brand-espresso transition-colors"
          >
            {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>

        <p className="text-xs text-brand-caramel-text flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-brand-caramel inline-block" />
          Never saved to disk or config. In-memory execution only for this probe.
        </p>
      </div>

      {/* 5. DRY-RUN MOCK SIMULATION TOGGLE */}
      <div className="flex items-center justify-between rounded-xl border border-brand-sage/70 bg-brand-cream-dark/40 p-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="mock-offline-toggle"
            checked={mockOffline}
            onChange={(e) => setParam('mock_offline', e.target.checked)}
            className="size-4 rounded border-brand-sage bg-brand-cream accent-brand-caramel cursor-pointer"
          />
          <label htmlFor="mock-offline-toggle" className="text-xs font-bold text-brand-espresso cursor-pointer select-none">
            Mock Offline Simulation (Dry-Run Mode)
          </label>
        </div>
        <span className="font-mono text-xs text-brand-caramel-text">Tests UI & probe flow without network calls</span>
      </div>
    </div>
  )
}
