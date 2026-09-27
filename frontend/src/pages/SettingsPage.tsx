import { useEffect, useState } from 'react'
import { RefreshCw, Save, KeyRound, Server, PackageCheck, CheckCircle2, ArrowUpCircle } from 'lucide-react'
import { api, type ProviderInfo } from '../lib/api'

export default function SettingsPage() {
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
      <div className="mx-auto max-w-5xl space-y-6 text-[#4E220F]">
      {/* Header */}
      <div className="border-b border-[#B0BA99] pb-4">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-bold tracking-tight text-[#4E220F]">Global Settings</h1>
          <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-[#B0BA99]/40 border border-[#B0BA99] text-[#4E220F] font-semibold">
            System Config
          </span>
        </div>
        <p className="mt-1 text-xs text-[#7C5339]">
          Runtime parameters, external provider secrets, and system binary dependencies.
        </p>
      </div>

      {/* Section 1: Download Queue */}
      <section className="rounded-2xl border-2 border-[#B0BA99] bg-[#FFFFFF] p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-[#B0BA99]/60 pb-3">
          <div className="flex size-8 items-center justify-center rounded-xl bg-[#9D6638] text-[#FDFBF7]">
            <Server className="size-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#4E220F]">
              Download Queue Concurrency
            </h2>
            <p className="font-mono text-[10px] text-[#7C5339]">MAX CONCURRENT BACKGROUND WORKERS</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-[11px] text-[#7C5339]">Number of simultaneous downloads allowed before queueing.</p>
            {isConcurrencyDirty && (
              <p className="mt-1 text-[10px] text-[#7C5339]">Unsaved changes</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={16}
              value={maxConcurrent}
              onChange={(e) => setMaxConcurrent(Number(e.target.value))}
              className="w-20 rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/70 px-3 py-1.5 font-mono text-xs text-[#4E220F] focus:border-[#9D6638] focus:outline-none font-bold"
            />
            <button
              onClick={saveConcurrency}
              disabled={savingQueue || !isConcurrencyDirty}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#9D6638] px-4 py-2 text-xs font-bold text-[#FDFBF7] shadow-sm transition-all hover:bg-[#86542C] active:scale-95 disabled:opacity-40"
            >
              <Save className="size-3.5" />
              {savingQueue ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </section>

      {/* Section 2: Provider API Keys */}
      <section className="rounded-2xl border-2 border-[#B0BA99] bg-[#FFFFFF] p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-[#B0BA99]/60 pb-3">
          <div className="flex size-8 items-center justify-center rounded-xl bg-[#9D6638] text-[#FDFBF7]">
            <KeyRound className="size-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#4E220F]">
              Provider API Credentials
            </h2>
            <p className="font-mono text-[10px] text-[#7C5339]">ENCRYPTED LOCAL KEY VAULT</p>
          </div>
        </div>

        <div className="space-y-3">
          {Object.entries(providers).map(([pid, info]) => {
            const hasKey = keys.includes(pid)
            return (
              <div
                key={pid}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[#B0BA99]/80 bg-[#F7F1DE]/60 p-3.5 shadow-2xs"
              >
                <div className="w-48 shrink-0">
                  <p className="text-xs font-bold text-[#4E220F]">{info.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        hasKey ? 'bg-[#9D6638]' : info.needs_key ? 'bg-[#B0BA99]' : 'bg-[#9D6638]'
                      }`}
                    />
                    <span className="font-mono text-[10px] text-[#7C5339] font-medium">
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
                    className="flex-1 rounded-xl border border-[#B0BA99] bg-[#FFFFFF] px-3.5 py-1.5 font-mono text-xs text-[#4E220F] placeholder-[#7C5339]/60 focus:border-[#9D6638] focus:outline-none disabled:opacity-40 shadow-2xs"
                  />
                  <button
                    onClick={() => saveKey(pid)}
                    disabled={!info.needs_key || !keyInputs[pid]}
                    aria-label={`Save ${info.name || pid} API key`}
                    title={!info.needs_key ? 'No key required for local runtime' : !keyInputs[pid] ? 'Paste a key above to enable Save' : `Save ${info.name || pid} key`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#9D6638] px-3.5 py-1.5 text-xs font-bold text-[#FDFBF7] transition-all hover:bg-[#86542C] active:scale-95 disabled:opacity-40 shadow-xs"
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
      <section className="rounded-2xl border-2 border-[#B0BA99] bg-[#FFFFFF] p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#B0BA99]/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-[#9D6638] text-[#FDFBF7]">
              <PackageCheck className="size-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#4E220F]">
                yt-dlp Anti-403 & Cookies Bypass
              </h2>
              <p className="font-mono text-[10px] text-[#7C5339]">BROWSER COOKIES, PLAYER CLIENTS & NIGHTLY BUILDS</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => upgradeYtdlpNightly('nightly')}
              disabled={upgradingNightly}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#9D6638] bg-[#EDE5CD] px-3.5 py-1.5 text-xs font-bold text-[#4E220F] transition-all hover:bg-[#B0BA99]/40 active:scale-95 disabled:opacity-40 shadow-xs"
            >
              <ArrowUpCircle className={`size-3.5 ${upgradingNightly ? 'animate-spin text-[#9D6638]' : ''}`} />
              {upgradingNightly ? 'Upgrading to Nightly…' : 'Switch to Nightly Channel'}
            </button>
            <button
              onClick={saveYtdlp}
              disabled={savingYtdlp || !isYtdlpDirty}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#9D6638] px-4 py-1.5 text-xs font-bold text-[#FDFBF7] shadow-sm transition-all hover:bg-[#86542C] active:scale-95 disabled:opacity-40"
            >
              <Save className="size-3.5" />
              {savingYtdlp ? 'Saving…' : 'Save Anti-403 Settings'}
            </button>
          </div>
        </div>
        {isYtdlpDirty && (
          <p className="text-[10px] text-[#7C5339]">Unsaved changes</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-[#B0BA99]/80 bg-[#F7F1DE]/60 p-3.5 space-y-1.5">
            <label className="text-xs font-bold text-[#4E220F] block">Browser Cookies Extraction (`--cookies-from-browser`)</label>
            <p className="text-[10px] text-[#7C5339]">Load active login cookies directly from local browser installation to bypass YouTube 403 blocks.</p>
            <select
              value={ytdlpSettings.cookies_from_browser}
              onChange={(e) => setYtdlpSettings((s) => ({ ...s, cookies_from_browser: e.target.value }))}
              className="w-full rounded-xl border border-[#B0BA99] bg-[#FFFFFF] px-3 py-1.5 font-mono text-xs text-[#4E220F] focus:border-[#9D6638] focus:outline-none font-medium"
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

          <div className="rounded-xl border border-[#B0BA99]/80 bg-[#F7F1DE]/60 p-3.5 space-y-1.5">
            <label className="text-xs font-bold text-[#4E220F] block">Player Client Preset (`--extractor-args`)</label>
            <p className="text-[10px] text-[#7C5339]">Override YouTube player client spoofing flags to bypass bot detection.</p>
            <select
              value={ytdlpSettings.extractor_args}
              onChange={(e) => setYtdlpSettings((s) => ({ ...s, extractor_args: e.target.value }))}
              className="w-full rounded-xl border border-[#B0BA99] bg-[#FFFFFF] px-3 py-1.5 font-mono text-xs text-[#4E220F] focus:border-[#9D6638] focus:outline-none font-medium"
            >
              <option value="youtube:player_client=ios,web">iOS + Web (Recommended Default)</option>
              <option value="youtube:player_client=mweb">Mobile Web (`mweb`)</option>
              <option value="youtube:player_client=tv">TV Embedded Client (`tv`)</option>
              <option value="youtube:player_client=android">Android Client</option>
            </select>
          </div>

          <div className="rounded-xl border border-[#B0BA99]/80 bg-[#F7F1DE]/60 p-3.5 space-y-1.5 md:col-span-2">
            <label className="text-xs font-bold text-[#4E220F] block">Custom `cookies.txt` File Path (`--cookies`)</label>
            <p className="text-[10px] text-[#7C5339]">Absolute path to Netscape-formatted cookies file exported from browser extension.</p>
            <input
              type="text"
              value={ytdlpSettings.cookies_file_path}
              onChange={(e) => setYtdlpSettings((s) => ({ ...s, cookies_file_path: e.target.value }))}
              placeholder="e.g. /home/<you>/downloads/cookies.txt"
              className="w-full rounded-xl border border-[#B0BA99] bg-[#FFFFFF] px-3.5 py-1.5 font-mono text-xs text-[#4E220F] placeholder-[#7C5339]/60 focus:border-[#9D6638] focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* Section 4: Dependency Updater */}
      <section className="rounded-2xl border-2 border-[#B0BA99] bg-[#FFFFFF] p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#B0BA99]/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-[#9D6638] text-[#FDFBF7]">
              <PackageCheck className="size-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#4E220F]">
                Core Binary Dependencies
              </h2>
              <p className="font-mono text-[10px] text-[#7C5339]">EXTERNAL CLI UTILITIES</p>
            </div>
          </div>

          <button
            onClick={runCheck}
            disabled={checkingDeps}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#B0BA99] bg-[#EDE5CD] px-3.5 py-1.5 text-xs font-semibold text-[#4E220F] transition-all hover:bg-[#B0BA99]/40 active:scale-95 disabled:opacity-40 shadow-xs"
          >
            <RefreshCw className={`size-3.5 ${checkingDeps ? 'animate-spin text-[#9D6638]' : ''}`} />
            Check Updates
          </button>
        </div>

        <div className="space-y-2">
          {deps.map((dep) => {
            const isInstalled = dep.installed != null && dep.installed !== '' && dep.installed !== '—'
            const hasUpdate = isInstalled && Boolean(dep.latest) && dep.latest !== dep.installed
            const isUpdating = updatingDepName === dep.name
            return (
              <div
                key={dep.name}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[#B0BA99]/80 bg-[#F7F1DE]/60 px-4 py-3 shadow-2xs"
              >
                <div>
                  <p className="font-mono text-xs font-bold text-[#4E220F]">{dep.name}</p>
                  <p className="font-mono text-[10px] text-[#7C5339] mt-0.5">
                    Installed: <span className="text-[#4E220F] font-semibold">{dep.installed ?? '—'}</span> · Latest:{' '}
                    <span className="text-[#4E220F] font-semibold">{dep.latest ?? 'check failed'}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {!isInstalled ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#7C5339] bg-[#EDE5CD] border border-[#B0BA99] px-2.5 py-0.5 rounded-full font-semibold">
                        NOT INSTALLED
                      </span>
                      <button
                        onClick={() => updateDep(dep.name)}
                        disabled={isUpdating}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#9D6638] px-3.5 py-1.5 text-xs font-bold text-[#FDFBF7] shadow-sm transition-all hover:bg-[#86542C] active:scale-95 disabled:opacity-40"
                      >
                        <ArrowUpCircle className="size-3.5" />
                        {isUpdating ? 'Installing…' : 'Install'}
                      </button>
                    </div>
                  ) : hasUpdate ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#86542C] bg-[#F5C86B]/30 border border-[#9D6638]/50 px-2.5 py-0.5 rounded-full font-bold">
                        UPDATE AVAILABLE
                      </span>
                      <button
                        onClick={() => updateDep(dep.name)}
                        disabled={isUpdating}
                        title={`Upgrade ${dep.name} from ${dep.installed} to ${dep.latest} — you will be asked to confirm`}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#9D6638] px-3.5 py-1.5 text-xs font-bold text-[#FDFBF7] shadow-sm transition-all hover:bg-[#86542C] active:scale-95 disabled:opacity-40"
                      >
                        <ArrowUpCircle className="size-3.5" />
                        {isUpdating ? 'Upgrading…' : 'Upgrade'}
                      </button>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#4E220F] bg-[#B0BA99]/40 border border-[#B0BA99] px-2.5 py-0.5 rounded-full font-bold">
                      <CheckCircle2 className="size-3 text-[#9D6638]" />
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
