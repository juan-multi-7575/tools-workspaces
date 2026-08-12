import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { RefreshCw, Trash2, Download, Eye, FileArchive, Workflow } from 'lucide-react'
import { api, type Run, type ArtifactFile, type ToolManifest } from '../lib/api'
import PipelineCanvas from '../components/pipeline/PipelineCanvas'

export default function WorkspaceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [view, setView] = useState<'pipeline' | 'artifacts'>('pipeline')
  const [tools, setTools] = useState<ToolManifest[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [selectedRun, setSelectedRun] = useState<string | null>(null)
  const [artifacts, setArtifacts] = useState<ArtifactFile[]>([])

  const refreshRuns = useCallback(() => {
    if (!id) return
    api.listRuns(id).then(({ runs }) => {
      setRuns(runs)
      if (!selectedRun && runs.length > 0) setSelectedRun(runs[0].id)
    })
  }, [id, selectedRun])

  useEffect(() => {
    api.listTools().then(({ tools }) => setTools(tools))
  }, [])

  useEffect(refreshRuns, [refreshRuns])

  useEffect(() => {
    if (!id || !selectedRun) return
    api.listArtifacts(id, selectedRun).then(({ artifacts }) => setArtifacts(artifacts))
  }, [id, selectedRun])

  const removeRun = async (runId: string) => {
    if (!id) return
    await api.deleteRun(id, runId)
    setSelectedRun(null)
    setArtifacts([])
    refreshRuns()
  }

  const removeArtifact = async (name: string) => {
    if (!id || !selectedRun) return
    await api.deleteArtifact(id, selectedRun, name)
    setArtifacts(artifacts.filter((a) => a.name !== name))
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-50">
            Workspace <span className="text-emerald-400">{id}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">Chain tools into pipelines and browse every artifact.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshRuns}
            className="inline-flex items-center gap-2 rounded-lg border border-garage-700 bg-garage-900 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-garage-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          {id && (
            <a
              href={api.exportWorkspace(id)}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400"
            >
              <FileArchive className="h-3.5 w-3.5" />
              Export ZIP
            </a>
          )}
        </div>
      </header>

      <div className="mb-5 flex gap-2">
        <button
          onClick={() => setView('pipeline')}
          className={
            'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ' +
            (view === 'pipeline' ? 'bg-garage-800 text-white' : 'text-slate-400 hover:bg-garage-800/60')
          }
        >
          <Workflow className="h-4 w-4" /> Pipeline editor
        </button>
        <button
          onClick={() => setView('artifacts')}
          className={
            'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ' +
            (view === 'artifacts' ? 'bg-garage-800 text-white' : 'text-slate-400 hover:bg-garage-800/60')
          }
        >
          Runs & artifacts ({runs.length})
        </button>
      </div>

      {view === 'pipeline' ? (
        <PipelineCanvas workspaceId={id!} tools={tools} onRan={() => { setView('artifacts'); refreshRuns() }} />
      ) : runs.length === 0 ? (
        <p className="text-sm text-slate-500">No runs yet. Build a pipeline to see artifacts here.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Runs</h2>
            {runs.map((run) => (
              <div
                key={run.id}
                onClick={() => setSelectedRun(run.id)}
                className={
                  'group flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2.5 transition-colors ' +
                  (selectedRun === run.id
                    ? 'border-port-in/60 bg-garage-800'
                    : 'border-garage-800 bg-garage-900/40 hover:bg-garage-800/60')
                }
              >
                <div>
                  <p className="font-mono text-xs text-slate-200">{run.id}</p>
                  <p className="text-[11px] text-slate-500">{run.artifacts.length} artifacts</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeRun(run.id)
                  }}
                  className="rounded-md p-1 text-slate-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                  title="Delete run"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </aside>

          <section>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Artifacts
            </h2>
            {artifacts.length === 0 ? (
              <p className="text-sm text-slate-500">No artifacts in this run.</p>
            ) : (
              <ul className="space-y-2">
                {artifacts.map((art) => (
                  <li
                    key={art.name}
                    className="flex items-center justify-between rounded-xl border border-garage-800 bg-garage-900/40 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-100">{art.name}</p>
                      <p className="text-xs text-slate-500">{formatSize(art.size)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {id && selectedRun && (
                        <>
                          <a
                            href={api.artifactPreviewUrl(id, selectedRun, art.name)}
                            target="_blank"
                            rel="noreferrer"
                            title="Preview"
                            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-garage-800 hover:text-port-in"
                          >
                            <Eye className="h-4 w-4" />
                          </a>
                          <a
                            href={api.artifactDownloadUrl(id, selectedRun, art.name)}
                            title="Download"
                            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-garage-800 hover:text-emerald-400"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                          <button
                            onClick={() => removeArtifact(art.name)}
                            title="Delete"
                            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-garage-800 hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
