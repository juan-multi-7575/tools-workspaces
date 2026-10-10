import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { SiteProps } from '../types'
import type { ToolManifest } from '../../lib/api'
import { api, errorMessage, resolveUrl } from '../../lib/api'
import { formatBytes } from '../../lib/depsApi'
import { useToolExecute } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'
import './packager.css'

type ParamSpec = { title?: string; description?: string; default?: unknown; type?: string }
type Artifact = { name: string; path: string; kind: string; size: number }

export default function PackagerSite({ siteState, initialInputPath }: SiteProps) {
  const [manifest, setManifest] = useState<ToolManifest | null>(null)
  const [loadError, setLoadError] = useState('')
  useEffect(() => {
    api.getTool('packager').then(setManifest).catch((cause: unknown) => setLoadError(errorMessage(cause)))
  }, [])
  if (loadError) return <main className="pk-root pk-message"><h1>Archive packager</h1><pre>{loadError}</pre></main>
  if (!manifest) return <main className="pk-root pk-message">Loading archive packager…</main>
  return siteState === 'hero'
    ? <PackagerHero manifest={manifest} />
    : <PackagerWorkspace manifest={manifest} initialInputPath={initialInputPath} />
}

export function PackagerHero({ manifest }: { manifest: ToolManifest }) {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const pathKey = Object.keys(manifest.parameters_schema ?? {}).find((key) => key === 'paths') ?? Object.keys(manifest.parameters_schema ?? {})[0]
  const choose = async (file?: File) => {
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      const uploaded = await api.uploadFile(file)
      navigate('/t/packager/workspace', { state: { inputPath: uploaded.path, inputName: uploaded.name, inputSize: uploaded.size, inputKind: uploaded.kind } })
    } catch (cause: unknown) {
      setUploadError(errorMessage(cause))
      setUploading(false)
    }
  }
  return (
    <main className="pk-root pk-hero">
      <div className="pk-hero__paper">
        <div className="pk-hero__mast"><span>NEAL’S LITTLE FILE SHED</span><span>ARCHIVE / ZIP</span></div>
        <div className="pk-hero__body">
          <div className="pk-hero__copy">
            <p className="pk-kicker">Put the loose files together</p>
            <h1>Make a tidy<br /><em>little bundle.</em></h1>
            <p className="pk-lede">{manifest.description} Pick files already here or add one, then pack them into a ZIP.</p>
            <div className="pk-actions">
              <button className="pk-button pk-button--filled" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? 'Adding file…' : 'Choose a file'}
              </button>
              <button className="pk-button" onClick={() => navigate('/t/packager/workspace')}>Open an empty workspace</button>
              <input ref={fileRef} className="pk-sr" type="file" data-param-key={pathKey} aria-label="Choose a file to add to the archive" onChange={(event) => { void choose(event.target.files?.[0]); event.currentTarget.value = '' }} />
            </div>
            {uploadError && <p className="pk-error" role="alert">{uploadError}</p>}
          </div>
          <div className="pk-hero__drawing" aria-hidden="true">
            <span className="pk-doodle pk-doodle--folder">▱</span>
            <span className="pk-doodle pk-doodle--file">▤</span>
            <span className="pk-doodle pk-doodle--leaf">✳</span>
            <div className="pk-carton"><span>FILES</span><span>FILES</span><span>FILES</span></div>
            <span className="pk-hero__caption">A small box for your files</span>
          </div>
        </div>
        <div className="pk-hero__foot"><span>Pick a few things.</span><span>Get one ZIP back.</span></div>
      </div>
    </main>
  )
}

export function PackagerWorkspace({ manifest, initialInputPath }: { manifest: ToolManifest; initialInputPath?: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const uploadInfo = location.state as { inputName?: string; inputSize?: number; inputKind?: string } | null
  const execute = useToolExecute('packager')
  const deps = useToolDeps('packager')
  const schema = manifest.parameters_schema as Record<string, ParamSpec>
  const pathsKey = Object.keys(schema).find((key) => key === 'paths') ?? Object.keys(schema)[0]
  const pathsSpec = schema[pathsKey] ?? {}
  const [params, setParams] = useState<Record<string, unknown>>(() => ({ [pathsKey]: initialInputPath ? [initialInputPath] : (pathsSpec.default ?? []) }))
  const [artifacts, setArtifacts] = useState<Artifact[]>(() => initialInputPath && uploadInfo?.inputName && typeof uploadInfo.inputSize === 'number'
    ? [{ name: uploadInfo.inputName, path: initialInputPath, size: uploadInfo.inputSize, kind: uploadInfo.inputKind ?? '' }]
    : [])
  const [indexError, setIndexError] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [packedPaths, setPackedPaths] = useState<string[]>([])
  const [replaceApproved, setReplaceApproved] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const chosen = Array.isArray(params[pathsKey]) ? (params[pathsKey] as unknown[]).map(String) : []
  const setChosen = (next: string[]) => {
    setParams((previous) => ({ ...previous, [pathsKey]: next }))
    setReplaceApproved(false)
  }
  const refresh = useCallback(async () => {
    try {
      const response = await api.getRecentArtifacts()
      const initialUpload = initialInputPath && uploadInfo?.inputName && typeof uploadInfo.inputSize === 'number'
        ? { name: uploadInfo.inputName, path: initialInputPath, size: uploadInfo.inputSize, kind: uploadInfo.inputKind ?? '' }
        : null
      setArtifacts(initialUpload && !response.artifacts.some((entry) => entry.path === initialUpload.path)
        ? [initialUpload, ...response.artifacts]
        : response.artifacts)
      setIndexError('')
    } catch (cause: unknown) {
      setIndexError(errorMessage(cause))
    }
  }, [initialInputPath, uploadInfo?.inputName, uploadInfo?.inputSize, uploadInfo?.inputKind])
  useEffect(() => { void refresh() }, [refresh])
  const byPath = useMemo(() => new Map(artifacts.map((entry) => [entry.path, entry])), [artifacts])
  const returned = execute.state.phase === 'completed' ? execute.state.result?.artifacts : undefined
  const archive = returned?.length === 1 && returned[0].name === 'bundle.zip' ? returned[0] : undefined
  const existingBundle = artifacts.find((file) => file.name === 'bundle.zip' && file.path.replaceAll('\\', '/').endsWith('/downloads/packager/bundle.zip'))
  const zipped = archive ? packedPaths.map((path) => byPath.get(path)).filter((file): file is Artifact => Boolean(file)) : []
  const resultIsStale = Boolean(archive && (chosen.length !== packedPaths.length || chosen.some((path, index) => path !== packedPaths[index])))
  const upload = async (file?: File) => {
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      const uploaded = await api.uploadFile(file)
      await refresh()
      setArtifacts((previous) => [{ name: uploaded.name, path: uploaded.path, size: uploaded.size, kind: uploaded.kind }, ...previous.filter((entry) => entry.path !== uploaded.path)])
      setChosen([...chosen, uploaded.path])
    } catch (cause: unknown) {
      setUploadError(errorMessage(cause))
    } finally {
      setUploading(false)
    }
  }
  const dropFiles = (event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    setDragging(false)
    void upload(event.dataTransfer.files?.[0])
  }
  const run = async () => {
    const submittedPaths = [...chosen]
    const result = await execute.run(params)
    if (result?.status === 'completed') {
      setPackedPaths(submittedPaths)
      setReplaceApproved(false)
      await refresh()
    }
  }

  return (
    <div className="pk-root pk-work">
      <header className="pk-head">
        <button className="pk-home" onClick={() => navigate('/')}>← All tools</button>
        <span className="pk-wordmark">{manifest.name}</span>
        <span className="pk-label">ZIP SHED</span>
      </header>
      <main className="pk-main">
        <section className="pk-picker">
          <div className="pk-section-title"><span>THE FILE PILE</span><span>{artifacts.length} in the index</span></div>
          <h1>Choose what<br />goes in the box.</h1>
          <p className="pk-intro">Select files to include, or add one from your computer.</p>
          <button className="pk-button pk-add" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? 'Adding file…' : '+ Add a file'}</button>
          <input className="pk-sr" ref={fileRef} type="file" aria-label="Upload a file to bundle" onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = '' }} />
          {uploadError && <p className="pk-error" role="alert">{uploadError}</p>}
          {indexError && <p className="pk-error" role="alert">{indexError}</p>}
          <div className={`pk-tree${dragging ? ' is-dragging' : ''}`} role="group" aria-label={pathsSpec.title ?? 'Files to bundle'} data-param-key={pathsKey} title={pathsKey} onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes('Files')) { event.preventDefault(); setDragging(true) } }} onDragLeave={() => setDragging(false)} onDrop={dropFiles}>
            {artifacts.length === 0 && !indexError && <p className="pk-empty">No files in the index yet.</p>}
            {artifacts.map((file) => (
              <label className="pk-file" key={file.path}>
                <input type="checkbox" checked={chosen.includes(file.path)} onChange={(event) => setChosen(event.target.checked ? [...chosen, file.path] : chosen.filter((path) => path !== file.path))} />
                <span className="pk-file__icon" aria-hidden="true">▤</span>
                <span className="pk-file__name" title={file.path}>{file.name}<small>{file.kind.toUpperCase()}</small></span>
                <span className="pk-file__size">{formatBytes(file.size)}</span>
              </label>
            ))}
          </div>
          <p className="pk-selected">{chosen.length} {chosen.length === 1 ? 'file' : 'files'} selected</p>
        </section>
        <section className="pk-box" aria-label="Archive preview">
          <div className="pk-section-title"><span>YOUR BOX</span><span>01 / ZIP</span></div>
          {archive ? (
            <div className="pk-result">
              <div className="pk-stamp" aria-label="ZIP ready"><span>ZIP</span><span>READY</span></div>
              <h2>{archive.name}</h2>
              {resultIsStale && <p className="pk-stale">The selection changed. This download is from the previous selection.</p>}
              <a className="pk-download" href={resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(archive.path)}`)} download={archive.name}>Download bundle.zip ↓</a>
              <div className="pk-zipped"><h3>In this bundle</h3>{zipped.map((file) => <p key={file.path}><span>▤ {file.name}</span><span>{formatBytes(file.size)}</span></p>)}</div>
            </div>
          ) : (
            <div className="pk-box__empty"><div className="pk-box__drawing" aria-hidden="true"><span>FILES</span><span>FILES</span><span>FILES</span></div><p>Your box is waiting for files.</p></div>
          )}
          {execute.state.error && <pre className="pk-error" role="alert">{execute.state.error}</pre>}
          {existingBundle && <div className="pk-overwrite"><p>A previous <strong>bundle.zip</strong> is already here. Packing again replaces it.</p><a href={resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(existingBundle.path)}`)} download={existingBundle.name}>Download the current archive first</a><label><input type="checkbox" checked={replaceApproved} onChange={(event) => setReplaceApproved(event.target.checked)} /> I saved a copy and approve replacing it</label></div>}
          <button className="pk-button pk-pack" onClick={() => void run()} disabled={execute.busy || !deps.ready || chosen.length === 0 || Boolean(existingBundle && !replaceApproved)}>{execute.busy ? 'Packing…' : 'Pack files into ZIP →'}</button>
        </section>
      </main>
      <footer className="pk-gate" data-tool-gate-region="packager"><DependencyGate toolId="packager" state={deps} accent="#D86C3C" /></footer>
    </div>
  )
}
