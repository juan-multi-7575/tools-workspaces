import { useEffect, useState } from 'react'
import { ArrowDownToLine, Wrench, X, Play, CheckCircle2, XCircle } from 'lucide-react'
import { api, type ToolManifest } from '../lib/api'

type ParamSchema = Record<string, { type: string; enum?: (string | number)[] }>

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolManifest[]>([])
  const [loading, setLoading] = useState(true)
  const [runTarget, setRunTarget] = useState<ToolManifest | null>(null)
  const [params, setParams] = useState<Record<string, unknown>>({})
  const [result, setResult] = useState<{ status: string; error?: string | null; artifacts?: { name: string }[] } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.listTools().then(({ tools }) => {
      setTools(tools)
      setLoading(false)
    })
  }, [])

  const openRun = (tool: ToolManifest) => {
    setRunTarget(tool)
    setParams({})
    setResult(null)
  }

  const run = async () => {
    if (!runTarget) return
    setBusy(true)
    try {
      const res = await api.executeTool(runTarget.id, {
        kind: 'standalone',
        destination: '',
        params,
      })
      setResult({ status: res.status, error: res.error, artifacts: (res.artifacts as { name: string }[]) ?? [] })
    } finally {
      setBusy(false)
    }
  }

  const schema = (runTarget?.parameters_schema ?? {}) as ParamSchema

  return (
    <div className="mx-auto max-w-6xl">
      <section
        className="relative mb-8 overflow-hidden rounded-2xl border border-garage-800 bg-cover bg-center shadow-2xl"
        style={{ backgroundImage: 'url(/src/assets/hero-background.png)' }}
      >
        <div className="bg-garage-950/70 p-8 backdrop-blur-sm">
          <h1 className="text-3xl font-black tracking-tight text-slate-50">Tool Catalog</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-300">
            Standalone utilities, runnable anywhere. Chain them into pipelines inside a Workspace.
          </p>
        </div>
      </section>

      {loading ? (
        <p className="text-sm text-slate-500 animate-pulse">Loading tools…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <article
              key={tool.id}
              className="rounded-2xl border border-garage-800 bg-garage-900/60 p-5 shadow-xl backdrop-blur-md transition-colors hover:border-garage-700"
            >
              <div className="mb-3 flex items-start justify-between">
                <Wrench className="h-6 w-6 text-port-in" />
                <span className="rounded-md bg-garage-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-port-in">
                  {tool.id}
                </span>
              </div>
              <h2 className="text-base font-bold text-slate-100">{tool.name}</h2>
              <p className="mt-1 line-clamp-2 text-xs text-slate-400">{tool.description}</p>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-garage-800 pt-3 text-[11px]">
                <span className="rounded-md bg-slate-800 px-2 py-0.5 text-slate-300">in: {tool.input_kinds.join(', ')}</span>
                <span className="rounded-md bg-slate-800 px-2 py-0.5 text-slate-300">out: {tool.output_kinds.join(', ')}</span>
              </div>
              <button
                onClick={() => openRun(tool)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400"
              >
                <ArrowDownToLine className="h-3.5 w-3.5" />
                Run
              </button>
            </article>
          ))}
        </div>
      )}

      {runTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setRunTarget(null)} />
          <div className="relative w-full max-w-lg rounded-2xl border border-garage-800 bg-garage-950 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">Run {runTarget.name}</h3>
              <button onClick={() => setRunTarget(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-garage-800 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              {Object.entries(schema).map(([key, def]) => (
                <label key={key} className="block text-xs text-slate-300">
                  <span className="mb-1 block font-medium text-slate-400">{key}</span>
                  {def.enum ? (
                    <select
                      value={String(params[key] ?? '')}
                      onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))}
                      className="w-full rounded-lg border border-garage-800 bg-garage-950 px-3 py-2 text-slate-100 outline-none focus:border-port-in"
                    >
                      <option value="">—</option>
                      {def.enum.map((o) => (
                        <option key={String(o)} value={String(o)}>
                          {String(o)}
                        </option>
                      ))}
                    </select>
                  ) : def.type === 'boolean' ? (
                    <input
                      type="checkbox"
                      checked={Boolean(params[key])}
                      onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.checked }))}
                      className="h-4 w-4 accent-cyan-500"
                    />
                  ) : (
                    <input
                      type={def.type === 'number' || def.type === 'integer' ? 'number' : 'text'}
                      value={String(params[key] ?? '')}
                      onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))}
                      className="w-full rounded-lg border border-garage-800 bg-garage-950 px-3 py-2 text-slate-100 outline-none focus:border-port-in"
                    />
                  )}
                </label>
              ))}
              {Object.keys(schema).length === 0 && (
                <p className="text-xs text-slate-500">This tool takes no parameters.</p>
              )}
            </div>

            <button
              onClick={run}
              disabled={busy}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5" /> Run tool
            </button>

            {result && (
              <div className="mt-4 rounded-xl border border-garage-800 bg-garage-900/60 p-3">
                <p className={'flex items-center gap-2 text-sm ' + (result.status === 'completed' ? 'text-emerald-400' : result.status === 'failed' ? 'text-red-400' : 'text-slate-300')}>
                  {result.status === 'completed' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {result.status}
                </p>
                {result.error && <p className="mt-1 text-xs text-red-400">{result.error}</p>}
                {result.artifacts && result.artifacts.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-slate-400">
                    {result.artifacts.map((a) => (
                      <li key={a.name} className="font-mono">{a.name}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
