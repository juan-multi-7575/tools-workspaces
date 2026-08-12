import { useEffect, useState } from 'react'
import { ArrowDownToLine, Wrench } from 'lucide-react'
import { api, type ToolManifest } from '../lib/api'

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolManifest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.listTools().then(({ tools }) => {
      setTools(tools)
      setLoading(false)
    })
  }, [])

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
                <span className="rounded-md bg-slate-800 px-2 py-0.5 text-slate-300">
                  in: {tool.input_kinds.join(', ')}
                </span>
                <span className="rounded-md bg-slate-800 px-2 py-0.5 text-slate-300">
                  out: {tool.output_kinds.join(', ')}
                </span>
              </div>
              <a
                href={`/api/tools/${tool.id}`}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400"
              >
                <ArrowDownToLine className="h-3.5 w-3.5" />
                Run
              </a>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
