import { useEffect, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SiteProps } from '../types'
import type { ToolManifest } from '../../lib/api'
import { api, errorMessage } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'
import './pandoc.css'

type Spec = { title?: string; description?: string; default?: unknown; enum?: unknown[] }
export default function PandocSite({ siteState, initialInputPath }: SiteProps) {
 const [manifest,setManifest]=useState<ToolManifest|null>(null),[loadError,setLoadError]=useState('')
 useEffect(()=>{api.getTool('pandoc').then(setManifest).catch(e=>setLoadError(errorMessage(e)))},[])
 if(loadError) return <main className="pd-root pd-message"><h1>Document converter</h1><pre>{loadError}</pre></main>
 if(!manifest) return <main className="pd-root pd-message">Loading converter…</main>
 return siteState==='hero'?<PandocHero manifest={manifest}/>:<PandocWork manifest={manifest} initialInputPath={initialInputPath}/>
}
export function PandocHero({manifest}:{manifest:ToolManifest}) {
 const nav=useNavigate(), [busy,setBusy]=useState(false), [err,setErr]=useState(''), schema=manifest.parameters_schema as Record<string,Spec>, fileKey=Object.hasOwn(schema,'input_path')?'input_path':Object.keys(schema)[0]
 const choose=async(f?:File)=>{if(!f)return;setBusy(true);try{const u=await api.uploadFile(f);nav('/t/pandoc/workspace',{state:{inputPath:u.path}})}catch(e){setErr(errorMessage(e));setBusy(false)}}
 const drop=(event:DragEvent<HTMLElement>)=>{if(Array.from(event.dataTransfer.types).includes('Files')){event.preventDefault();void choose(event.dataTransfer.files?.[0])}}
 return <main className="pd-root pd-hero" onDragOver={event=>{if(Array.from(event.dataTransfer.types).includes('Files'))event.preventDefault()}} onDrop={drop}><div className="pd-hero__mast"><span>THE DOCUMENT PUDDING</span><span>CONVERSION / 12</span></div><div className="pd-hero__center"><p className="pd-kicker">A small desk for changing forms</p><h1>One document,<br/><em>another language.</em></h1><p>{manifest.description}</p><div className="pd-actions"><label className="pd-primary">{busy?'Opening document…':'Choose a document'}<input data-param-key={fileKey} type="file" onChange={e=>{void choose(e.target.files?.[0]);e.currentTarget.value=''}}/></label><button onClick={()=>nav('/t/pandoc/workspace')}>Open an empty workspace</button></div>{err&&<p role="alert">{err}</p>}</div><aside className="pd-hero__note">A source on one side.<br/>A new form on the other.</aside></main>
}
export function PandocWork({manifest,initialInputPath}:{manifest:ToolManifest;initialInputPath?:string}) {
 const nav=useNavigate(), exec=useToolExecute('pandoc'), deps=useToolDeps('pandoc'), schema=manifest.parameters_schema as Record<string,Spec>
 const [params,setParams]=useState<Record<string,unknown>>(()=>({input_path:initialInputPath??schema.input_path?.default??'',to:schema.to?.default??'html'})), [src,setSrc]=useState(''),[output,setOutput]=useState(''),[name,setName]=useState(''),[path,setPath]=useState(''),[error,setError]=useState(''),[ranInput,setRanInput]=useState(''),[ranTarget,setRanTarget]=useState('')
 const sourcePath=String(params.input_path??''), target=String(params.to??'html'), artifact=exec.state.result?.artifacts[0], artifactPath=artifact?.path
 useEffect(()=>{if(!sourcePath){setSrc('');return}api.getArtifactContent(sourcePath).then(r=>setSrc(r.content)).catch(e=>setSrc(errorMessage(e)))},[sourcePath])
 useEffect(()=>{if(exec.state.phase==='completed'&&artifactPath){api.getArtifactContent(artifactPath).then(r=>{setOutput(r.content);setName(r.name);setPath(artifactPath)}).catch(e=>setError(errorMessage(e))) }else if(exec.state.phase==='executing'){setOutput('');setPath('')}},[exec.state.phase,artifactPath])
 const set=(key:string,val:unknown)=>setParams(p=>({...p,[key]:val}))
 const run=async()=>{setError('');setOutput('');setPath('');setName('');const result=await exec.run(params);if(result?.status==='completed'){setRanInput(sourcePath);setRanTarget(target)}}
 const copy=()=>navigator.clipboard.writeText(output).catch(e=>setError(errorMessage(e)))
 const targets=(schema.to?.enum??['html','markdown','plain']).map(String)
 return <div className="pd-root pd-work"><header className="pd-head"><button onClick={()=>nav('/')}>← All tools</button><span>DOCUMENT CONVERTER</span><span>AN EDITORIAL DESK</span></header><main className="pd-spread"><section className="pd-source" onDragOver={event=>{if(Array.from(event.dataTransfer.types).includes('Files'))event.preventDefault()}} onDrop={async event=>{if(!Array.from(event.dataTransfer.types).includes('Files'))return;event.preventDefault();const f=event.dataTransfer.files?.[0];if(f)try{const u=await api.uploadFile(f);set('input_path',u.path)}catch(c){setError(errorMessage(c))}}}><div className="pd-section-head"><span>01 / SOURCE</span><span>{sourcePath.split('/').pop()||'No document'}</span></div><label className="pd-field" data-param-key="input_path">{schema.input_path?.title??'Input document'}<input type="text" value={sourcePath} onChange={e=>set('input_path',e.target.value)} placeholder="Path to a readable document" title="input_path"/></label><label className="pd-upload">Choose file<input type="file" onChange={async e=>{const f=e.target.files?.[0];if(f)try{const u=await api.uploadFile(f);set('input_path',u.path)}catch(c){setError(errorMessage(c))}}}/></label><pre className="pd-paper">{src||'Choose a document to read its source.'}</pre></section><aside className="pd-marginalia"><span>THE MARGIN</span><p>{schema.to?.description??'Choose the form for the converted document.'}</p><ul>{targets.map(x=><li key={x}><button data-param-key="to" aria-pressed={target===x} onClick={()=>set('to',x)}>{x}</button></li>)}</ul><button className="pd-convert" disabled={exec.busy||!deps.ready} onClick={()=>void run()}>{exec.busy?'Converting…':'Convert →'}</button><p className="pd-param">to = <strong>{target}</strong></p></aside><section className="pd-result"><div className="pd-section-head"><span>02 / RENDERED · {ranTarget||target}</span><span>{name}</span></div><div className="pd-result__tools"><button disabled={!output} onClick={()=>void copy()}>Copy result</button><a href={path?`/api/artifacts/content?path=${encodeURIComponent(path)}`:undefined} download={name||undefined} aria-disabled={!path}>Download artifact</a></div>{ranInput && (ranInput!==sourcePath || ranTarget!==target) && <p className="pd-stale">The source or target changed. Convert again to update this result.</p>}{ranTarget==='html'&&output?<iframe title="Converted HTML" sandbox="" srcDoc={output}/>:<pre className="pd-paper pd-paper--output">{output||'Your converted document appears here.'}</pre>}{exec.state.error&&<pre className="pd-error" role="alert">{exec.state.error}</pre>}{error&&<pre className="pd-error" role="alert">{error}</pre>}</section></main><footer className="pd-gate" data-tool-gate-region="pandoc"><DependencyGate toolId="pandoc" state={deps}/></footer></div>
}
