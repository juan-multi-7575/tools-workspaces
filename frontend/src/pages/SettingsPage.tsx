import { useEffect, useState } from 'react'
import { RefreshCw, Save, KeyRound, Server } from 'lucide-react'
import { api, type ProviderInfo } from '../lib/api'

export default function SettingsPage() {
  const [maxConcurrent, setMaxConcurrent] = useState(2)
  const [providers, setProviders] = useState<Record<string, ProviderInfo>>({})
  const [keys, setKeys] = useState<string[]>([])
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [deps, setDeps] = useState<{ name: string; installed?: string | null; latest?: string | null }[]>([])

  const refresh = async () => {
    const [dl, prov, keyList, depList] = await Promise.all([
      api.getDownloadSettings(),
      api.listProviders(),
      api.listKeys(),
      api.getDeps(),
    ])
    setMaxConcurrent(dl.max_concurrent)
    setProviders(prov.providers)
    setKeys(keyList.providers)
    setDeps(depList.dependencies)
  }

  useEffect(() => {
    refresh()
  }, [])

  const saveConcurrency = async () => {
    const res = await api.updateDownloadSettings(maxConcurrent)
    setMaxConcurrent(res.max_concurrent)
  }

  const saveKey = async (providerId: string) => {
    await api.saveKey(providerId, keyInputs[providerId] ?? '')
    setKeyInputs((k) => ({ ...k, [providerId]: '' }))
    const keyList = await api.listKeys()
    setKeys(keyList.providers)
  }

  const runCheck = async () => {
    const res = await api.checkDeps()
    setDeps(res.dependencies)
  }

  const updateDep = async (name: string) => {
    await api.updateDep(name)
    runCheck()
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-slate-50">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">
          Global config, separate from per-tool run options.
        </p>
      </header>

      <section className="rounded-2xl border border-garage-800 bg-garage-900/60 p-6">
        <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-100">
          <Server className="h-4 w-4 text-port-in" /> Download Queue
        </h2>
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-400">Max concurrent downloads</label>
          <input
            type="number"
            min={1}
            value={maxConcurrent}
            onChange={(e) => setMaxConcurrent(Number(e.target.value))}
            className="w-24 rounded-lg border border-garage-700 bg-garage-900 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-port-in/60"
          />
          <button
            onClick={saveConcurrency}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400"
          >
            <Save className="h-3.5 w-3.5" /> Save
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-garage-800 bg-garage-900/60 p-6">
        <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-100">
          <KeyRound className="h-4 w-4 text-port-in" /> Provider API Keys
        </h2>
        <div className="space-y-3">
          {Object.entries(providers).map(([pid, info]) => (
            <div key={pid} className="flex items-center gap-3">
              <div className="w-40">
                <p className="text-sm font-medium text-slate-200">{info.name}</p>
                <p className="text-[11px] text-slate-500">
                  {keys.includes(pid) ? 'key saved' : 'no key'}
                </p>
              </div>
              <input
                type="password"
                value={keyInputs[pid] ?? ''}
                onChange={(e) => setKeyInputs((k) => ({ ...k, [pid]: e.target.value }))}
                placeholder={info.needs_key ? 'Paste API key' : 'No key needed'}
                disabled={!info.needs_key}
                className="flex-1 rounded-lg border border-garage-700 bg-garage-900 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-port-in/60 disabled:opacity-40"
              />
              <button
                onClick={() => saveKey(pid)}
                disabled={!info.needs_key}
                className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-40"
              >
                Save
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-garage-800 bg-garage-900/60 p-6">
        <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-100">
          <RefreshCw className="h-4 w-4 text-port-in" /> Dependency Updates
        </h2>
        <div className="mb-4">
          <button
            onClick={runCheck}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Check now
          </button>
        </div>
        <ul className="space-y-2">
          {deps.map((dep) => (
            <li
              key={dep.name}
              className="flex items-center justify-between rounded-xl border border-garage-800 bg-garage-950/50 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-slate-100">{dep.name}</p>
                <p className="text-xs text-slate-500">
                  installed: {dep.installed ?? '—'} · latest: {dep.latest ?? 'unknown'}
                </p>
              </div>
              <button
                onClick={() => updateDep(dep.name)}
                disabled={!dep.latest || dep.latest === dep.installed}
                className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-40"
              >
                Upgrade
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
