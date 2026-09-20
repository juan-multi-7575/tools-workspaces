export interface ToolCompatibilityResult {
  toolId: string
  toolName: string
  compatible: boolean
  badge: string
  description: string
  incompatibleReason?: string
}

export interface ToolSpec {
  id: string
  name: string
  supportedExtensions: string[]
  badge: string
  description: string
  inputParamName: string
}

export const SUPPORTED_TOOLS: ToolSpec[] = [
  {
    id: 'transcriber',
    name: 'Audio Transcriber',
    supportedExtensions: ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'opus', 'aac'],
    badge: 'Speech to Text',
    description: 'Transcribe audio speech to subtitles & timestamps with Whisper',
    inputParamName: 'input_path',
  },
  {
    id: 'trimmer',
    name: 'Audio & Video Trimmer',
    supportedExtensions: ['mp4', 'mkv', 'webm', 'mov', 'mp3', 'wav', 'flac', 'm4a'],
    badge: 'Lossless Cut',
    description: 'Trim or split media file with millisecond waveform precision',
    inputParamName: 'input_path',
  },
  {
    id: 'translator',
    name: 'Subtitle Translator',
    supportedExtensions: ['srt', 'vtt', 'txt', 'json'],
    badge: 'Translate Subtitles',
    description: 'Translate SRT, VTT, or text files into 50+ languages',
    inputParamName: 'input_path',
  },
  {
    id: 'downloader',
    name: 'Media Downloader',
    supportedExtensions: ['url', 'txt'],
    badge: 'Fetch URL',
    description: 'Download online video/audio streams via yt-dlp',
    inputParamName: 'url',
  },
]

export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return ''
  return filename.slice(lastDot + 1).toLowerCase()
}

export function isToolCompatible(toolId: string, filename: string): boolean {
  const ext = getFileExtension(filename)
  const tool = SUPPORTED_TOOLS.find((t) => t.id === toolId)
  if (!tool) return false
  return tool.supportedExtensions.includes(ext)
}

export function getCompatibleTools(filename: string): ToolCompatibilityResult[] {
  const ext = getFileExtension(filename)
  return SUPPORTED_TOOLS.map((tool) => {
    const compatible = tool.supportedExtensions.includes(ext)
    return {
      toolId: tool.id,
      toolName: tool.name,
      compatible,
      badge: tool.badge,
      description: tool.description,
      incompatibleReason: compatible
        ? undefined
        : `Requires .${tool.supportedExtensions.slice(0, 3).join(', .')} files`,
    }
  })
}
