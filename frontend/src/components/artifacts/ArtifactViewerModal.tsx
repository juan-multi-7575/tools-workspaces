import { useEffect, useState } from 'react'
import { X, Download, Copy, Check, FileText, Image as ImageIcon, Music, Video, FileCode } from 'lucide-react'
import Modal from '../common/Modal'

export default function ArtifactViewerModal({
  name,
  previewUrl,
  downloadUrl,
  size,
  onClose,
}: {
  name: string
  previewUrl: string
  downloadUrl: string
  size?: number
  onClose: () => void
}) {
  const [textContent, setTextContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const ext = name.split('.').pop()?.toLowerCase() || ''

  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'bmp'].includes(ext)
  const isAudio = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext)
  const isVideo = ['mp4', 'webm', 'mkv', 'mov'].includes(ext)
  const isPdf = ext === 'pdf'
  const isTextual = ['txt', 'md', 'json', 'html', 'css', 'js', 'ts', 'py', 'sh', 'log', 'csv', 'xml', 'yaml', 'yml'].includes(ext)

  useEffect(() => {
    if (isTextual) {
      setLoading(true)
      fetch(previewUrl)
        .then((res) => res.text())
        .then((text) => {
          if (ext === 'json') {
            try {
              setTextContent(JSON.stringify(JSON.parse(text), null, 2))
            } catch {
              setTextContent(text)
            }
          } else {
            setTextContent(text)
          }
        })
        .catch(() => setTextContent('Failed to load text content.'))
        .finally(() => setLoading(false))
    }
  }, [previewUrl, isTextual, ext])

  const copyText = () => {
    if (textContent) {
      navigator.clipboard.writeText(textContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const formatSize = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <Modal
      labelledBy="artifact-viewer-title"
      onClose={onClose}
      className="p-4 bg-brand-espresso/30 backdrop-blur-[3px]"
      panelClassName="relative flex flex-col w-full max-w-4xl max-h-[88vh] rounded-2xl border-2 border-brand-sage bg-brand-cream shadow-2xl overflow-hidden text-brand-espresso"
    >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-brand-sage/60 px-5 py-3.5 bg-brand-cream-dark/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-8 items-center justify-center rounded-xl bg-brand-caramel text-brand-cream-light shrink-0 shadow-xs">
              {isImage ? (
                <ImageIcon className="size-4" />
              ) : isAudio ? (
                <Music className="size-4" />
              ) : isVideo ? (
                <Video className="size-4" />
              ) : (
                <FileCode className="size-4" />
              )}
            </div>
            <div className="min-w-0">
              <h3 id="artifact-viewer-title" className="text-xs font-bold text-brand-espresso font-mono truncate">{name}</h3>
              {size ? (
                <p className="text-xs text-brand-caramel-text font-mono">{formatSize(size)}</p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {textContent && (
              <button
                onClick={copyText}
                className="inline-flex items-center gap-1.5 rounded-xl border border-brand-sage bg-surface-white px-3 py-1.5 text-xs font-bold text-brand-espresso hover:bg-brand-cream-dark transition-all shadow-xs"
              >
                {copied ? <Check className="size-3.5 text-brand-caramel" /> : <Copy className="size-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            <a
              href={downloadUrl}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-caramel px-3 py-1.5 text-xs font-bold text-brand-cream-light shadow-xs hover:bg-brand-caramel-hover transition-all"
            >
              <Download className="size-3.5" /> Download
            </a>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-brand-caramel-text hover:bg-brand-sage/30 hover:text-brand-espresso transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 overflow-auto p-5 bg-brand-cream">
          {isImage ? (
            <div className="flex items-center justify-center min-h-[300px] rounded-xl border border-brand-sage bg-surface-white p-4 shadow-sm">
              <img
                src={previewUrl}
                alt={name}
                className="max-h-[60vh] max-w-full rounded-lg object-contain shadow-md"
              />
            </div>
          ) : isAudio ? (
            <div className="flex flex-col items-center justify-center p-8 space-y-4 rounded-xl border border-brand-sage bg-surface-white shadow-sm">
              <div className="flex size-14 items-center justify-center rounded-full bg-brand-cream-dark text-brand-caramel">
                <Music className="size-7" />
              </div>
              <p className="font-mono text-xs font-bold text-brand-espresso">{name}</p>
              <audio controls className="w-full max-w-md" src={previewUrl}>
                Your browser does not support audio playback.
              </audio>
            </div>
          ) : isVideo ? (
            <div className="flex items-center justify-center rounded-xl border border-brand-sage bg-surface-white p-3 shadow-sm">
              <video controls className="max-h-[60vh] max-w-full rounded-lg" src={previewUrl}>
                Your browser does not support video playback.
              </video>
            </div>
          ) : isPdf ? (
            <div className="h-[65vh] w-full rounded-xl border border-brand-sage overflow-hidden shadow-sm">
              <iframe src={previewUrl} className="w-full h-full" title={name} />
            </div>
          ) : isTextual ? (
            loading ? (
              <div className="flex items-center justify-center py-16 text-brand-caramel-text font-mono text-xs animate-pulse">
                Loading content...
              </div>
            ) : (
              <pre className="p-4 font-mono text-xs text-brand-espresso bg-surface-white border border-brand-sage rounded-xl overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[60vh] shadow-inner font-medium">
                {textContent}
              </pre>
            )
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <FileText className="size-10 text-brand-caramel-text" />
              <p className="text-xs text-brand-caramel-text">Binary or unsupported preview format.</p>
              <a
                href={downloadUrl}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-caramel px-4 py-2 text-xs font-bold text-brand-cream-light hover:bg-brand-caramel-hover transition-all shadow-md"
              >
                <Download className="size-3.5" /> Download to view locally
              </a>
            </div>
          )}
        </div>
    </Modal>
  )
}
