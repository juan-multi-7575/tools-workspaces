import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Save, KeyRound, Server, PackageCheck, CheckCircle2, ArrowUpCircle, HardDrive } from 'lucide-react'
import { api, type ProviderInfo } from '../lib/api'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function SettingsPage() {
  useDocumentTitle('Tools Garage — settings')
  const [maxConcurrent, setMaxConcurrent] = useState(2)
  const [initialMaxConcurrent, setInitialMaxConcurrent] = useState<number | null>(null)
  const [providers, setProviders] = useState<Record<string, ProviderInfo>>({})
  const [keys, setKeys] = useState<string[]>([])
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [deps, setDeps] = useState<{ name: string; installed?: string | null; latest?: string | null }[]>([])
  const [savingQueue, setSavingQueue] = useState(false)
  const [checkingDeps, setCheckingDeps] = useState(false)
  const [updatingDepName, setUpdatingDepName] = useState<string | null>(null)

  const [ytdlpSettings, setYtdlpSettings] = useState<{
    cookies_from_browser: string
    cookies_file_path: string
    extractor_args: string
    user_agent: string
    update_channel: string
  }>({
    cookies_from_browser: 'none',
    cookies_file_path: '',
    extractor_args: 'youtube:player_client=ios,web',
    user_agent: '',
    update_channel: 'stable',
  })
  const [savingYtdlp, setSavingYtdlp] = useState(false)
  const [upgradingNightly, setUpgradingNightly] = useState(false)
  const [initialYtdlpSettings, setInitialYtdlpSettings] = useState<typeof ytdlpSettings | null>(null)

  const refresh = async () => {
    const [dl, prov, keyList, depList, ytdlp] = await Promise.all([
      api.getDownloadSettings(),
      api.listProviders(),
      api.listKeys(),
      api.getDeps(),
      api.getYtdlpSettings(),
    ])
    setMaxConcurrent(dl.max_concurrent)
    setInitialMaxConcurrent(dl.max_concurrent)
    setProviders(prov.providers)
    setKeys(keyList.providers)
    setDeps(depList.dependencies)
    setYtdlpSettings(ytdlp)
    setInitialYtdlpSettings(ytdlp)
  }

  useEffect(() => {
    refresh()
  }, [])

  const saveConcurrency = async () => {
    setSavingQueue(true)
    try {
      const res = await api.updateDownloadSettings(maxConcurrent)
      setMaxConcurrent(res.max_concurrent)
      setInitialMaxConcurrent(res.max_concurrent)
    } finally {
      setSavingQueue(false)
    }
  }

  const isConcurrencyDirty = initialMaxConcurrent !== null && maxConcurrent !== initialMaxConcurrent

  const saveYtdlp = async () => {
    setSavingYtdlp(true)
    try {
      const res = await api.updateYtdlpSettings(ytdlpSettings)
      setYtdlpSettings(res)
      setInitialYtdlpSettings(res)
    } finally {
      setSavingYtdlp(false)
    }
  }

  const isYtdlpDirty =
    initialYtdlpSettings !== null &&
    JSON.stringify(ytdlpSettings) !== JSON.stringify(initialYtdlpSettings)

  const upgradeYtdlpNightly = async (channel: string) => {
    setUpgradingNightly(true)
    try {
      await api.updateDep('yt-dlp', channel)
      await runCheck()
      const ytdlp = await api.getYtdlpSettings()
      setYtdlpSettings(ytdlp)
      setInitialYtdlpSettings(ytdlp)
    } finally {
      setUpgradingNightly(false)
    }
  }

  const saveKey = async (providerId: string) => {
    await api.saveKey(providerId, keyInputs[providerId] ?? '')
    setKeyInputs((k) => ({ ...k, [providerId]: '' }))
    const keyList = await api.listKeys()
    setKeys(keyList.providers)
  }

  const runCheck = async () => {
    setCheckingDeps(true)
    try {
      const res = await api.checkDeps()
      setDeps(res.dependencies)
    } finally {
      setCheckingDeps(false)
    }
  }

  const updateDep = async (name: string) => {
    if (!window.confirm(`Upgrade system binary "${name}" now? This modifies your local installation.`)) return
    setUpdatingDepName(name)
    try {
      await api.updateDep(name)
      await runCheck()
    } finally {
      setUpdatingDepName(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-6 text-brand-espresso">
      {/* Header */}
      <div className="border-b border-brand-sage pb-4">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-bold tracking-tight text-brand-espresso">Global Settings</h1>
          <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-brand-sage/40 border border-brand-sage text-brand-espresso font-semibold">
            System Config
          </span>
        </div>
        <p className="mt-1 text-xs text-brand-caramel-text">
          Runtime parameters, external provider secrets, and system binary dependencies.
        </p>
      </div>

      {/* Section 1: Download Queue */}
      <section className="rounded-2xl border-2 border-brand-sage bg-surface-white p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-brand-sage/60 pb-3">
          <div className="flex size-8 items-center justify-center rounded-xl bg-brand-caramel text-brand-cream-light">
            <Server className="size-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-espresso">
              Download Queue Concurrency
            </h2>
            <p className="font-mono text-xs text-brand-caramel-text">MAX CONCURRENT BACKGROUND WORKERS</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs text-brand-caramel-text">Number of simultaneous downloads allowed before queueing.</p>
            {isConcurrencyDirty && (
              <p className="mt-1 text-xs text-brand-caramel-text">Unsaved changes</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              aria-label="Download queue concurrency"
              min={1}
              max={16}
              value={maxConcurrent}
              onChange={(e) => setMaxConcurrent(Number(e.target.value))}
              className="w-20 rounded-xl border border-brand-sage bg-brand-cream/70 px-3 py-1.5 font-mono text-xs text-brand-espresso focus:border-brand-caramel focus:outline-none font-bold"
            />
            <button
              onClick={saveConcurrency}
              disabled={savingQueue || !isConcurrencyDirty}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-caramel px-4 py-2 text-xs font-bold text-brand-cream-light shadow-sm transition-all hover:bg-brand-caramel-hover active:scale-95 disabled:opacity-40"
            >
              <Save className="size-3.5" />
              {savingQueue ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </section>

      {/* Section 2: Provider API Keys */}
      <section className="rounded-2xl border-2 border-brand-sage bg-surface-white p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-brand-sage/60 pb-3">
          <div className="flex size-8 items-center justify-center rounded-xl bg-brand-caramel text-brand-cream-light">
            <KeyRound className="size-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-espresso">
              Provider API Credentials
            </h2>
            <p className="font-mono text-xs text-brand-caramel-text">ENCRYPTED LOCAL KEY VAULT</p>
          </div>
        </div>

        <div className="space-y-3">
          {Object.entries(providers).map(([pid, info]) => {
            const hasKey = keys.includes(pid)
            return (
              <div
                key={pid}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-brand-sage/80 bg-brand-cream/60 p-3.5 shadow-2xs"
              >
                <div className="w-48 shrink-0">
                  <p className="text-xs font-bold text-brand-espresso">{info.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        hasKey ? 'bg-brand-caramel' : info.needs_key ? 'bg-brand-sage' : 'bg-brand-caramel'
                      }`}
                    />
                    <span className="font-mono text-xs text-brand-caramel-text font-medium">
                      {!info.needs_key ? 'LOCAL RUNTIME' : hasKey ? 'KEY CONFIGURED' : 'NO KEY SET'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-1 items-center gap-2">
                  <input
                    type="password"
                    value={keyInputs[pid] ?? ''}
                    onChange={(e) => setKeyInputs((k) => ({ ...k, [pid]: e.target.value }))}
                    placeholder={info.needs_key ? (hasKey ? '•••••••••••••••• (replace)' : 'Paste API key…') : 'No key required'}
                    disabled={!info.needs_key}
                    className="flex-1 rounded-xl border border-brand-sage bg-surface-white px-3.5 py-1.5 font-mono text-xs text-brand-espresso placeholder-placeholder focus:border-brand-caramel focus:outline-none disabled:opacity-40 shadow-2xs"
                  />
                  <button
                    onClick={() => saveKey(pid)}
                    disabled={!info.needs_key || !keyInputs[pid]}
                    aria-label={`Save ${info.name || pid} API key`}
                    title={!info.needs_key ? 'No key required for local runtime' : !keyInputs[pid] ? 'Paste a key above to enable Save' : `Save ${info.name || pid} key`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand-caramel px-3.5 py-1.5 text-xs font-bold text-brand-cream-light transition-all hover:bg-brand-caramel-hover active:scale-95 disabled:opacity-40 shadow-xs"
                  >
                    <Save className="size-3.5" />
                    Save
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Section 3: yt-dlp 403 Anti-Throttling & Cookies */}
      <section className="rounded-2xl border-2 border-brand-sage bg-surface-white p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-brand-sage/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-brand-caramel text-brand-cream-light">
              <PackageCheck className="size-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-brand-espresso">
                yt-dlp Anti-403 & Cookies Bypass
              </h2>
              <p className="font-mono text-xs text-brand-caramel-text">BROWSER COOKIES, PLAYER CLIENTS & NIGHTLY BUILDS</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => upgradeYtdlpNightly('nightly')}
              disabled={upgradingNightly}
              className="inline-flex items-center gap-1.5 rounded-xl border border-brand-caramel bg-brand-cream-dark px-3.5 py-1.5 text-xs font-bold text-brand-espresso transition-all hover:bg-brand-sage/40 active:scale-95 disabled:opacity-40 shadow-xs"
            >
              <ArrowUpCircle className={`size-3.5 ${upgradingNightly ? 'animate-spin text-brand-caramel' : ''}`} />
              {upgradingNightly ? 'Upgrading to Nightly…' : 'Switch to Nightly Channel'}
            </button>
            <button
              onClick={saveYtdlp}
              disabled={savingYtdlp || !isYtdlpDirty}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-caramel px-4 py-1.5 text-xs font-bold text-brand-cream-light shadow-sm transition-all hover:bg-brand-caramel-hover active:scale-95 disabled:opacity-40"
            >
              <Save className="size-3.5" />
              {savingYtdlp ? 'Saving…' : 'Save Anti-403 Settings'}
            </button>
          </div>
        </div>
        {isYtdlpDirty && (
          <p className="text-xs text-brand-caramel-text">Unsaved changes</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-brand-sage/80 bg-brand-cream/60 p-3.5 space-y-1.5">
            <label className="text-xs font-bold text-brand-espresso block">Browser Cookies Extraction (`--cookies-from-browser`)</label>
            <p className="text-xs text-brand-caramel-text">Load active login cookies directly from local browser installation to bypass YouTube 403 blocks.</p>
            <select
              value={ytdlpSettings.cookies_from_browser}
              aria-label="Browser Cookies Extraction (`--cookies-from-browser`)"
              onChange={(e) => setYtdlpSettings((s) => ({ ...s, cookies_from_browser: e.target.value }))}
              className="w-full rounded-xl border border-brand-sage bg-surface-white px-3 py-1.5 font-mono text-xs text-brand-espresso focus:border-brand-caramel focus:outline-none font-medium"
            >
              <option value="none">Disabled (No Browser Cookies)</option>
              <option value="chrome">Google Chrome</option>
              <option value="firefox">Mozilla Firefox</option>
              <option value="edge">Microsoft Edge</option>
              <option value="brave">Brave Browser</option>
              <option value="safari">Apple Safari</option>
              <option value="opera">Opera Browser</option>
            </select>
          </div>

          <div className="rounded-xl border border-brand-sage/80 bg-brand-cream/60 p-3.5 space-y-1.5">
            <label className="text-xs font-bold text-brand-espresso block">Player Client Preset (`--extractor-args`)</label>
            <p className="text-xs text-brand-caramel-text">Override YouTube player client spoofing flags to bypass bot detection.</p>
            <select
              value={ytdlpSettings.extractor_args}
              aria-label="Player Client Preset (`--extractor-args`)"
              onChange={(e) => setYtdlpSettings((s) => ({ ...s, extractor_args: e.target.value }))}
              className="w-full rounded-xl border border-brand-sage bg-surface-white px-3 py-1.5 font-mono text-xs text-brand-espresso focus:border-brand-caramel focus:outline-none font-medium"
            >
              <option value="youtube:player_client=ios,web">iOS + Web (Recommended Default)</option>
              <option value="youtube:player_client=mweb">Mobile Web (`mweb`)</option>
              <option value="youtube:player_client=tv">TV Embedded Client (`tv`)</option>
              <option value="youtube:player_client=android">Android Client</option>
            </select>
          </div>

          <div className="rounded-xl border border-brand-sage/80 bg-brand-cream/60 p-3.5 space-y-1.5 md:col-span-2">
            <label className="text-xs font-bold text-brand-espresso block">Custom `cookies.txt` File Path (`--cookies`)</label>
            <p className="text-xs text-brand-caramel-text">Absolute path to Netscape-formatted cookies file exported from browser extension.</p>
            <input
              type="text"
              value={ytdlpSettings.cookies_file_path}
              onChange={(e) => setYtdlpSettings((s) => ({ ...s, cookies_file_path: e.target.value }))}
              placeholder="e.g. /home/<you>/downloads/cookies.txt"
              className="w-full rounded-xl border border-brand-sage bg-surface-white px-3.5 py-1.5 font-mono text-xs text-brand-espresso placeholder-placeholder focus:border-brand-caramel focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* Section 4: Dependency Updater */}
      <section className="rounded-2xl border-2 border-brand-sage bg-surface-white p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-brand-sage/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-brand-caramel text-brand-cream-light">
              <PackageCheck className="size-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-brand-espresso">
                Core Binary Dependencies
              </h2>
              <p className="font-mono text-xs text-brand-caramel-text">EXTERNAL CLI UTILITIES · SYSTEM-WIDE UPDATES</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/dependencies"
              className="inline-flex items-center gap-1.5 rounded-xl border border-brand-sage bg-brand-cream-dark px-3.5 py-1.5 text-xs font-semibold text-brand-espresso transition-all hover:bg-brand-sage/40 active:scale-95 shadow-xs"
            >
              <HardDrive className="size-3.5 text-brand-caramel" />
              Managed installs
            </Link>
            <button
              onClick={runCheck}
              disabled={checkingDeps}
              className="inline-flex items-center gap-1.5 rounded-xl border border-brand-sage bg-brand-cream-dark px-3.5 py-1.5 text-xs font-semibold text-brand-espresso transition-all hover:bg-brand-sage/40 active:scale-95 disabled:opacity-40 shadow-xs"
            >
              <RefreshCw className={`size-3.5 ${checkingDeps ? 'animate-spin text-brand-caramel' : ''}`} />
              Check Updates
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {deps.map((dep) => {
            const isInstalled = dep.installed != null && dep.installed !== '' && dep.installed !== '—'
            const hasUpdate = isInstalled && Boolean(dep.latest) && dep.latest !== dep.installed
            const isUpdating = updatingDepName === dep.name
            return (
              <div
                key={dep.name}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-brand-sage/80 bg-brand-cream/60 px-4 py-3 shadow-2xs"
              >
                <div>
                  <p className="font-mono text-xs font-bold text-brand-espresso">{dep.name}</p>
                  <p className="font-mono text-xs text-brand-caramel-text mt-0.5">
                    Installed: <span className="text-brand-espresso font-semibold">{dep.installed ?? '—'}</span> · Latest:{' '}
                    <span className="text-brand-espresso font-semibold">{dep.latest ?? 'check failed'}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {!isInstalled ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 font-mono text-xs text-brand-caramel-text bg-brand-cream-dark border border-brand-sage px-2.5 py-0.5 rounded-full font-semibold">
                        NOT INSTALLED
                      </span>
                      <button
                        onClick={() => updateDep(dep.name)}
                        disabled={isUpdating}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-brand-caramel px-3.5 py-1.5 text-xs font-bold text-brand-cream-light shadow-sm transition-all hover:bg-brand-caramel-hover active:scale-95 disabled:opacity-40"
                      >
                        <ArrowUpCircle className="size-3.5" />
                        {isUpdating ? 'Installing…' : 'Install'}
                      </button>
                    </div>
                  ) : hasUpdate ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 font-mono text-xs text-brand-caramel-hover bg-warning/30 border border-brand-caramel/50 px-2.5 py-0.5 rounded-full font-bold">
                        UPDATE AVAILABLE
                      </span>
                      <button
                        onClick={() => updateDep(dep.name)}
                        disabled={isUpdating}
                        title={`Upgrade ${dep.name} from ${dep.installed} to ${dep.latest} — you will be asked to confirm`}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-brand-caramel px-3.5 py-1.5 text-xs font-bold text-brand-cream-light shadow-sm transition-all hover:bg-brand-caramel-hover active:scale-95 disabled:opacity-40"
                      >
                        <ArrowUpCircle className="size-3.5" />
                        {isUpdating ? 'Upgrading…' : 'Upgrade'}
                      </button>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-mono text-xs text-brand-espresso bg-brand-sage/40 border border-brand-sage px-2.5 py-0.5 rounded-full font-bold">
                      <CheckCircle2 className="size-3 text-brand-caramel" />
                      UP TO DATE
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
    </div>
  )
}
