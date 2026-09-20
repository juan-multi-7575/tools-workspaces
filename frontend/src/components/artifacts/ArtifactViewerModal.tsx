import { useEffect, useState } from 'react'
import { X, Download, Copy, Check, FileText, Image as ImageIcon, Music, Video, FileCode } from 'lucide-react'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#4E220F]/30 backdrop-blur-[3px]">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[88vh] rounded-2xl border-2 border-[#B0BA99] bg-[#F7F1DE] shadow-2xl overflow-hidden text-[#4E220F]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#B0BA99]/60 px-5 py-3.5 bg-[#EDE5CD]/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-8 items-center justify-center rounded-xl bg-[#9D6638] text-[#FDFBF7] shrink-0 shadow-xs">
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
              <h3 className="text-xs font-bold text-[#4E220F] font-mono truncate">{name}</h3>
              {size ? (
                <p className="text-[10px] text-[#7C5339] font-mono">{formatSize(size)}</p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {textContent && (
              <button
                onClick={copyText}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#B0BA99] bg-[#FFFFFF] px-3 py-1.5 text-xs font-bold text-[#4E220F] hover:bg-[#EDE5CD] transition-all shadow-xs"
              >
                {copied ? <Check className="size-3.5 text-[#9D6638]" /> : <Copy className="size-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            <a
              href={downloadUrl}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#9D6638] px-3 py-1.5 text-xs font-bold text-[#FDFBF7] shadow-xs hover:bg-[#86542C] transition-all"
            >
              <Download className="size-3.5" /> Download
            </a>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#7C5339] hover:bg-[#B0BA99]/30 hover:text-[#4E220F] transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 overflow-auto p-5 bg-[#F7F1DE]">
          {isImage ? (
            <div className="flex items-center justify-center min-h-[300px] rounded-xl border border-[#B0BA99] bg-[#FFFFFF] p-4 shadow-sm">
              <img
                src={previewUrl}
                alt={name}
                className="max-h-[60vh] max-w-full rounded-lg object-contain shadow-md"
              />
            </div>
          ) : isAudio ? (
            <div className="flex flex-col items-center justify-center p-8 space-y-4 rounded-xl border border-[#B0BA99] bg-[#FFFFFF] shadow-sm">
              <div className="flex size-14 items-center justify-center rounded-full bg-[#EDE5CD] text-[#9D6638]">
                <Music className="size-7" />
              </div>
              <p className="font-mono text-xs font-bold text-[#4E220F]">{name}</p>
              <audio controls className="w-full max-w-md" src={previewUrl}>
                Your browser does not support audio playback.
              </audio>
            </div>
          ) : isVideo ? (
            <div className="flex items-center justify-center rounded-xl border border-[#B0BA99] bg-[#FFFFFF] p-3 shadow-sm">
              <video controls className="max-h-[60vh] max-w-full rounded-lg" src={previewUrl}>
                Your browser does not support video playback.
              </video>
            </div>
          ) : isPdf ? (
            <div className="h-[65vh] w-full rounded-xl border border-[#B0BA99] overflow-hidden shadow-sm">
              <iframe src={previewUrl} className="w-full h-full" title={name} />
            </div>
          ) : isTextual ? (
            loading ? (
              <div className="flex items-center justify-center py-16 text-[#7C5339] font-mono text-xs animate-pulse">
                Loading content...
              </div>
            ) : (
              <pre className="p-4 font-mono text-xs text-[#4E220F] bg-[#FFFFFF] border border-[#B0BA99] rounded-xl overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[60vh] shadow-inner font-medium">
                {textContent}
              </pre>
            )
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <FileText className="size-10 text-[#7C5339]" />
              <p className="text-xs text-[#7C5339]">Binary or unsupported preview format.</p>
              <a
                href={downloadUrl}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#9D6638] px-4 py-2 text-xs font-bold text-[#FDFBF7] hover:bg-[#86542C] transition-all shadow-md"
              >
                <Download className="size-3.5" /> Download to view locally
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
