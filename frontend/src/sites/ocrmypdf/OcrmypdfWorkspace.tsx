import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useToolExecute } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'
import type { ToolManifest } from '../../lib/api'

export default function OcrmypdfWorkspace({ manifest, initialInputPath }: { manifest: ToolManifest; initialInputPath?: string }) {
  const location = useLocation()
  const [inputPdf, setInputPdf] = useState(initialInputPath ?? (location.state as { inputPath?: string } | null)?.inputPath ?? '')
  const ocrDeps = useToolDeps('ocrmypdf')
  const textDeps = useToolDeps('pdf_tools')
  const ocr = useToolExecute('ocrmypdf')
  const text = useToolExecute('pdf_tools')
  const key = 'input_pdf'
  const runOcr = async () => {
    const result = await ocr.run({ [key]: inputPdf })
    if (result?.status === 'completed' && result.artifacts[0]?.path && textDeps.ready) {
      await text.run({ input_path: result.artifacts[0].path, action: 'extract_text' })
    }
  }
  const reading = text.state.result?.outputText ?? ''
  const artwork = ocr.state.result?.artifacts[0]
  return <div className="om-workspace">
    <header className="om-header"><Link to="/" className="om-home">← All tools</Link><strong className="om-header__brand">OCRmyPDF</strong><span className="om-header__id">EXHIBIT / OCR</span></header>
    <main className="om-work"><div className="om-title-row"><div><p className="om-kicker">DOCUMENT CONSERVATION · WORKSPACE</p><h1>Make a scan searchable.</h1></div><span className="om-mark">01</span></div>
      <section className="om-input"><label htmlFor="om-input-pdf">{(manifest.parameters_schema[key] as { title?: string })?.title ?? 'Input PDF'}<span className="om-req">REQUIRED</span></label><input id="om-input-pdf" data-param-key={key} value={inputPdf} onChange={(event) => setInputPdf(event.target.value)} placeholder="Path to PDF" autoComplete="off"/><p>Choose a PDF on this machine, or paste its file path.</p></section>
      <div className="om-actions om-work-actions"><button className="om-button om-button--cyan" onClick={() => void runOcr()} disabled={!ocrDeps.ready || ocr.busy}>Run OCR</button><button className="om-button" onClick={() => { if (artwork?.path) void text.run({ input_path: artwork.path, action: 'extract_text' }) }} disabled={!artwork?.path || !textDeps.ready || ocr.busy || text.busy}>Read text layer</button></div>
      {ocr.state.error && <pre className="om-error-text" role="alert">{ocr.state.error}</pre>}
      <section className="om-exhibits"><article className="om-page"><p className="om-section-label">PAGE / 001</p>{artwork ? <a href={`/api/artifacts/content?path=${encodeURIComponent(artwork.path)}`} target="_blank" rel="noreferrer" className="om-preview">Open processed PDF ↗</a> : <div className="om-thumbnail" aria-label="PDF page preview unavailable until OCR completes"><span>PAGE<br/>PREVIEW</span></div>}<p className="om-caption">{artwork?.name ?? 'Input document'}</p></article><article className="om-reading"><p className="om-section-label">RECOGNISED TEXT <span>TEXT LAYER</span></p>{text.state.error && <pre className="om-error-text" role="alert">{text.state.error}</pre>}{text.busy ? <p>Reading the text layer…</p> : reading ? <pre className="om-text">{String(reading)}</pre> : <p className="om-empty">Run OCR to read the searchable text beside its page.</p>}</article></section>
    </main>
    <footer className="om-gates"><div className="om-gate" data-tool-gate-region="ocrmypdf"><span>OCR ENGINE</span><DependencyGate toolId="ocrmypdf" state={ocrDeps} accent="#00A0E9"/></div><div className="om-gate" data-tool-gate-region="pdf_tools"><span>TEXT READER</span><DependencyGate toolId="pdf_tools" state={textDeps} accent="#00A0E9"/></div></footer>
  </div>
}
