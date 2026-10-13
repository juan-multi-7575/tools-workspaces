import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookMarked,
  Download,
  FileText,
  Layers,
  Loader2,
  ScanText,
  Search,
  TriangleAlert,
  UploadCloud,
} from 'lucide-react'
import { api, errorMessage, resolveUrl } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import DependencyGate from '../../components/deps/DependencyGate'
import { useToolDeps } from '../../hooks/useToolDeps'
import ToolPageShell from '../../components/tools/ToolPageShell'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import type { ToolPageProps } from '../../lib/toolPageTypes'

interface FieldSpec {
  type?: string
  title?: string
  description?: string
}

interface OcrRun {
  path: string
  name: string
  size: number | undefined
  source: string
  ocrElapsed: number
  readElapsed: number
  pages: string[]
}

function contentUrl(path: string): string {
  return resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(path)}`)
}

/**
 * OCR pipeline reader. The searchable text column is produced by running the
 * backend's own `pdf_tools / extract_text` over the OCR artifact — the content
 * endpoint streams a PDF as binary, so the text has to come from a real
 * extractor. Pages are split on the form feeds pdftotext emits.
 */
export default function OcrMyPdfPage({
  manifest,
  initialParams,
  initialInputPath,
  onComplete,
  onSendToTool,
}: ToolPageProps) {
  const schema = manifest.parameters_schema as Record<string, FieldSpec>
  const ocr = useToolExecute('ocrmypdf')
  const deps = useToolDeps('ocrmypdf')
  const read = useToolExecute('pdf_tools')

  const fileRef = useRef<HTMLInputElement>(null)
  const [params, setParams] = useState<Record<string, unknown>>(() =>
    initialInputPath ? { ...initialParams, input_pdf: initialInputPath } : initialParams,
  )
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [runInfo, setRunInfo] = useState<OcrRun | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [activePage, setActivePage] = useState(0)

  const inputPdf = String(params.input_pdf ?? '')
  const setKey = (key: string, value: unknown) => setParams((prev) => ({ ...prev, [key]: value }))

  // Drop a fresh run (and its text) as soon as a new OCR completes.
  useEffect(() => {
    if (ocr.state.phase !== 'completed') return
    const artifact = ocr.state.result?.artifacts[0]
    setRunInfo(null)
    setReadError(null)
    setActivePage(0)
    setQuery('')
    if (!artifact) return
    void (async () => {
      const started = Date.now()
      try {
        const listing = await api.getRecentArtifacts()
        const size = listing.artifacts.find((a) => a.path === artifact.path)?.size
        setRunInfo({
          path: artifact.path,
          name: artifact.name,
          size,
          source: inputPdf,
          ocrElapsed: ocr.state.elapsedSeconds,
          readElapsed: 0,
          pages: [],
        })
        const extracted = await read.run({ input_path: artifact.path, action: 'extract_text' })
        const elapsed = (Date.now() - started) / 1000
        if (extracted?.status === 'completed') {
          const text = extracted.outputText ?? ''
          const pages = text.split('\f')
          while (pages.length > 1 && pages[pages.length - 1].trim() === '') pages.pop()
          setRunInfo({
            path: artifact.path,
            name: artifact.name,
            size,
            source: inputPdf,
            ocrElapsed: ocr.state.elapsedSeconds,
            readElapsed: elapsed,
            pages,
          })
        } else {
          setReadError(
            extracted?.error
              ? `The OCR file was produced, but reading its text layer failed: ${extracted.error}`
              : 'The OCR file was produced, but the text read did not complete.',
          )
        }
      } catch (err) {
        setReadError(`Could not read the OCR artifact: ${errorMessage(err)}`)
      }
    })()
  }, [ocr.state.phase, ocr.state.result])

  const upload = async (file: File) => {
    setUploading(true)
    setUploadError(null)
    try {
      const res = await api.uploadFile(file)
      setKey('input_pdf', res.path)
    } catch (err) {
      setUploadError(`Upload failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUploading(false)
    }
  }

  const needle = query.trim().toLowerCase()
  const pageHits = useMemo(() => {
    if (!runInfo || !needle) return null
    return runInfo.pages.map((p) => p.toLowerCase().split(needle).length - 1)
  }, [runInfo, needle])
  const totalHits = pageHits ? pageHits.reduce((a, b) => a + b, 0) : null
  const currentPage = runInfo ? runInfo.pages[activePage] : undefined
  const visiblePage =
    currentPage !== undefined && needle
      ? currentPage.split('\n').filter((line) => line.toLowerCase().includes(needle)).join('\n')
      : currentPage

  const run = async () => {
    const result = await ocr.run(params)
    if (result && result.status === 'completed') onComplete?.(result, params)
  }

  const busy = ocr.busy || read.busy
  const ocrError = ocr.state.error
  const missingInput = Boolean(ocrError && ocrError.includes('input file not found'))

  return (
    <ToolPageShell
      manifest={manifest}
      gate={<DependencyGate toolId="ocrmypdf" state={deps} />}
      headerActions={
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-espresso px-2.5 py-1 font-mono text-[12px] uppercase tracking-[0.2em] text-brand-cream-light">
          <ScanText className="size-3" /> ocr pipeline
        </span>
      }
    >
      <div className="space-y-4">
        <div
          data-param-key="input_pdf"
          className="rounded-2xl border border-brand-sage bg-surface-white p-4"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label htmlFor="ocr-input" className="flex items-center gap-2 text-xs font-bold text-brand-espresso">
              <UploadCloud className="size-3.5 text-brand-caramel" />
              {schema.input_pdf?.title ?? 'input_pdf'}
            </label>
            <span className="rounded bg-brand-sage/30 px-1.5 py-0.5 font-mono text-[12px] text-brand-espresso">input_pdf</span>
            <span className="text-xs text-brand-caramel-text">
              {schema.input_pdf?.description ?? 'Scanned PDF or image to OCR.'}
            </span>
          </div>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const file = e.dataTransfer.files?.[0]
              if (file) void upload(file)
            }}
            onClick={() => fileRef.current?.click()}
            className="cursor-pointer rounded-xl border-2 border-dashed border-brand-sage bg-brand-cream/40 px-3 py-3 text-center text-xs text-brand-caramel-text transition-colors hover:border-brand-caramel"
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,application/pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void upload(file)
              }}
            />
            {uploading ? (
              <span className="inline-flex items-center gap-1.5 font-bold text-brand-caramel">
                <Loader2 className="size-3.5 animate-spin" /> Uploading to the server…
              </span>
            ) : (
              <>Click to browse or drop the scanned PDF — it is uploaded for real.</>
            )}
          </div>
          <input
            id="ocr-input"
            type="text"
            value={inputPdf}
            onChange={(e) => setKey('input_pdf', e.target.value)}
            placeholder="Absolute path on the server, e.g. /path/to/scan.pdf"
            className="mt-2 w-full rounded-xl border border-brand-sage bg-brand-cream/60 px-3 py-2 font-mono text-xs text-brand-espresso focus:border-brand-caramel focus:outline-none"
          />
          {uploadError && (
            <p role="alert" className="mt-2 rounded-lg bg-accent-contrast/10 px-2.5 py-1.5 text-xs text-accent-contrast">
              {uploadError}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-sage bg-brand-cream-dark/40 p-3.5">
          <span className="font-mono text-[12px] uppercase tracking-[0.22em] text-brand-caramel-text">
            {Object.keys(schema).length} manifest {Object.keys(schema).length === 1 ? 'key' : 'keys'} · the only one this tool declares is <code>input_pdf</code>
          </span>
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy || !deps.ready}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-brand-caramel px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-brand-cream-light disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ScanText className="size-3.5" />}
            {ocr.busy ? `OCR running · ${ocr.state.elapsedSeconds.toFixed(1)}s measured` : read.busy ? `Reading text layer · ${read.state.elapsedSeconds.toFixed(1)}s measured` : 'Run OCR'}
          </button>
        </div>

        {ocrError && (
          <div role="alert" className="rounded-2xl border-2 border-accent-contrast/50 bg-accent-contrast/10 p-4">
            <p className="mb-1 flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.2em] text-accent-contrast">
              <TriangleAlert className="size-3.5" /> ocrmypdf said — verbatim
            </p>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-brand-espresso">{ocrError}</pre>
            {missingInput && (
              <p className="mt-2 text-xs text-brand-caramel-text">
                This is the backend&rsquo;s own guard: the file at the path above does not exist on the server, so no
                OCR was attempted and no output file was invented.
              </p>
            )}
          </div>
        )}

        {readError && (
          <div role="alert" className="rounded-2xl border border-brand-caramel/50 bg-brand-caramel-muted p-3.5">
            <p className="font-mono text-xs leading-relaxed text-brand-espresso">{readError}</p>
          </div>
        )}

        {runInfo && (
          <section className="space-y-3">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.2em] text-brand-espresso">
                <BookMarked className="size-4 text-brand-caramel" /> OCR result
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-[12px] text-brand-caramel-text">
                  {runInfo.size === undefined ? 'size not indexed yet' : `${runInfo.size} bytes`} · ocr {runInfo.ocrElapsed.toFixed(1)}s · text read {runInfo.readElapsed.toFixed(1)}s
                </span>
                <a
                  href={contentUrl(runInfo.path)}
                  download={runInfo.name}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-sage bg-surface-white px-2.5 py-1 font-mono text-[12px] text-brand-espresso"
                >
                  <Download className="size-3" /> {runInfo.name}
                </a>
              </div>
            </header>

            {runInfo.pages.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-[230px_1fr]">
                <aside className="max-h-[30rem] space-y-1.5 overflow-y-auto rounded-2xl border border-brand-sage bg-brand-cream-dark/30 p-3">
                  <p className="flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.2em] text-brand-caramel-text">
                    <Layers className="size-3" /> {runInfo.pages.length} {runInfo.pages.length === 1 ? 'page' : 'pages'}
                  </p>
                  {runInfo.pages.map((_page, index) => {
                    const hit = pageHits?.[index] ?? 0
                    const isActive = index === activePage
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setActivePage(index)}
                        aria-pressed={isActive}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                          isActive ? 'border-brand-espresso bg-brand-espresso text-brand-cream-light' : 'border-brand-sage bg-surface-white text-brand-espresso hover:border-brand-caramel'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 font-mono text-[12px] font-bold">
                          <FileText className="size-3" /> p{index + 1}
                        </span>
                        {needle && (
                          <span className={`font-mono text-[12px] ${hit ? 'font-bold text-brand-caramel' : 'opacity-50'}`}>
                            {hit} hit{hit === 1 ? '' : 's'}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </aside>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-brand-caramel-text" />
                      <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search the OCR text across every page…"
                        aria-label="Search OCR text"
                        className="w-full rounded-xl border border-brand-sage bg-surface-white pl-9 pr-3 py-2 font-mono text-xs text-brand-espresso focus:border-brand-caramel focus:outline-none"
                      />
                    </div>
                    {totalHits !== null && (
                      <span className="font-mono text-[12px] text-brand-caramel-text">
                        {totalHits} matching {totalHits === 1 ? 'occurrence' : 'occurrences'} across the document
                      </span>
                    )}
                  </div>
                  <div className="min-h-[20rem] rounded-2xl border border-brand-sage bg-brand-cream-light p-4">
                    <p className="mb-2 font-mono text-[12px] uppercase tracking-[0.2em] text-brand-caramel-text">
                      page {activePage + 1} of {runInfo.pages.length} · read from {runInfo.name} with the backend pdftotext extractor
                    </p>
                    {visiblePage === undefined || visiblePage.trim() === '' ? (
                      <p className="font-mono text-xs text-brand-caramel-text">
                        {needle ? `Page ${activePage + 1} contains no "${query}".` : `Page ${activePage + 1} produced no text layer.`}
                      </p>
                    ) : (
                      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-brand-espresso">{visiblePage}</pre>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="rounded-2xl border border-brand-sage bg-brand-cream-light p-4 font-mono text-xs text-brand-caramel-text">
                {read.busy
                  ? `Reading the text layer out of ${runInfo.name}… ${read.state.elapsedSeconds.toFixed(1)}s measured.`
                  : `${runInfo.name} exists, but no text layer was read yet. The content endpoint streams PDFs as binary, so the text comes from a real pdftotext run.`}
              </p>
            )}
          </section>
        )}

        {ocr.state.phase !== 'idle' && (
          <ToolResultPanel
            state={ocr.state}
            toolId="ocrmypdf"
            toolName={manifest.name}
            onRerun={ocr.reset}
            onSendToTool={onSendToTool}
          />
        )}
        {read.state.phase !== 'idle' && read.state.result && (
          <ToolResultPanel
            state={read.state}
            toolId="pdf_tools"
            toolName="PDF Text & Page Utilities (text-layer read)"
            onRerun={read.reset}
          />
        )}
      </div>
    </ToolPageShell>
  )
}
