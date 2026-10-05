import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SiteProps } from '../types'
import type { ToolManifest } from '../../lib/api'
import { api, errorMessage } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'
import './pandoc.css'

type Spec = { title?: string; description?: string; default?: unknown; enum?: unknown[] }
export default function PandocSite({ siteState }: SiteProps) {
 const [manifest,setManifest]=useState<ToolManifest|null>(null),[loadError,setLoadError]=useState('')
 useEffect(()=>{api.getTool('pandoc').then(setManifest).catch(e=>setLoadError(errorMessage(e)))},[])
 if(loadError) return <main className="pd-root pd-message"><h1>Document converter</h1><pre>{loadError}</pre></main>
 if(!manifest) return <main className="pd-root pd-message">Loading converter…</main>
 return siteState==='hero'?<PandocHero manifest={manifest}/>:<PandocWork manifest={manifest}/>
}
export function PandocHero({manifest}:{manifest:ToolManifest}) {
 const nav=useNavigate(), [busy,setBusy]=useState(false), [err,setErr]=useState(''), input=Object.entries(manifest.parameters_schema as Record<string,Spec>), [fileKey]=[input.find(([k])=>k==='input_path')?.[0]??'input_path']
 const choose=async(f?:File)=>{if(!f)return;setBusy(true);try{const u=await api.uploadFile(f);nav('/t/pandoc/workspace',{state:{inputPath:u.path}})}catch(e){setErr(errorMessage(e));setBusy(false)}}
 return <main className="pd-root pd-hero"><div className="pd-hero__mast"><span>THE DOCUMENT PUDDING</span><span>CONVERSION / 12</span></div><div className="pd-hero__center"><p className="pd-kicker">A small desk for changing forms</p><h1>One document,<br/><em>another language.</em></h1><p>{manifest.description}</p><div className="pd-actions"><label className="pd-primary">{busy?'Opening document…':'Choose a document'}<input data-param-key={fileKey} type="file" onChange={e=>{void choose(e.target.files?.[0]);e.currentTarget.value=''}}/></label><button onClick={()=>nav('/t/pandoc/workspace')}>Open an empty workspace</button></div>{err&&<p role="alert">{err}</p>}</div><aside className="pd-hero__note">A source on one side.<br/>A new form on the other.</aside></main>
}
export function PandocWork({manifest}:{manifest:ToolManifest}) {
 const nav=useNavigate(), exec=useToolExecute('pandoc'), deps=useToolDeps('pandoc'), schema=manifest.parameters_schema as Record<string,Spec>
 const [params,setParams]=useState<Record<string,unknown>>(()=>({input_path:schema.input_path?.default??'',to:schema.to?.default??'html'})), [src,setSrc]=useState(''),[output,setOutput]=useState(''),[name,setName]=useState(''),[path,setPath]=useState(''),[find,setFind]=useState(''),[error,setError]=useState('')
 const sourcePath=String(params.input_path??''), target=String(params.to??'html'), artifact=exec.state.result?.artifacts[0]
 useEffect(()=>{if(!sourcePath){setSrc('');return}api.getArtifactContent(sourcePath).then(r=>setSrc(r.content)).catch(e=>setSrc(errorMessage(e)))},[sourcePath])
 useEffect(()=>{if(exec.state.phase==='completed'&&artifact){api.getArtifactContent(artifact.path).then(r=>{setOutput(r.content);setName(r.name);setPath(artifact.path)}).catch(e=>setError(errorMessage(e))) }else if(exec.state.phase==='executing'){setOutput('');setPath('')}},[exec.state.phase,artifact?.path])
 const set=(key:string,val:unknown)=>setParams(p=>({...p,[key]:val}))
 const run=async()=>{setError('');await exec.run(params)}
 const copy=()=>navigator.clipboard.writeText(output).catch(e=>setError(errorMessage(e)))
 const targets=(schema.to?.enum??['html','markdown','plain']).map(String)
 return <div className="pd-root pd-work"><header className="pd-head"><button onClick={()=>nav('/')}>← All tools</button><span>DOCUMENT CONVERTER</span><span>AN EDITORIAL DESK</span></header><main className="pd-spread"><section className="pd-source"><div className="pd-section-head"><span>01 / SOURCE</span><span>{sourcePath.split('/').pop()||'No document'}</span></div><label className="pd-field" data-param-key="input_path">{schema.input_path?.title??'Input document'}<input type="text" value={sourcePath} onChange={e=>set('input_path',e.target.value)} placeholder="Path to a readable document" title="input_path"/></label><label className="pd-upload">Choose file<input type="file" onChange={async e=>{const f=e.target.files?.[0];if(f)try{const u=await api.uploadFile(f);set('input_path',u.path)}catch(c){setError(errorMessage(c))}}}/></label><pre className="pd-paper">{src||'Choose a document to read its source.'}</pre></section><aside className="pd-marginalia"><span>THE MARGIN</span><p>{schema.to?.description??'Choose the form for the converted document.'}</p><ul>{targets.map(x=><li key={x}><button data-param-key="to" aria-pressed={target===x} onClick={()=>set('to',x)}>{x}</button></li>)}</ul><button className="pd-convert" disabled={exec.busy||!deps.ready} onClick={()=>void run()}>{exec.busy?'Converting…':'Convert →'}</button><p className="pd-param">to = <strong>{target}</strong></p></aside><section className="pd-result"><div className="pd-section-head"><span>02 / RENDERED</span><span>{name}</span></div><div className="pd-result__tools"><button disabled={!output} onClick={()=>void copy()}>Copy result</button><a href={path?`/api/artifacts/content?path=${encodeURIComponent(path)}`:undefined} download={name||undefined} aria-disabled={!path}>Download artifact</a></div>{target==='html'&&output?<iframe title="Converted HTML" sandbox="" srcDoc={output}/>:<pre className="pd-paper pd-paper--output">{output||'Your converted document appears here.'}</pre>}{exec.state.error&&<pre className="pd-error" role="alert">{exec.state.error}</pre>}{error&&<pre className="pd-error" role="alert">{error}</pre>}</section></main><footer className="pd-gate" data-tool-gate-region="pandoc"><DependencyGate toolId="pandoc" state={deps}/></footer></div>
}
