type SourceMode = 'text' | 'file'
export type SummarizerParams = { text: string; input_path: string; max_bullets: unknown; format: unknown }
export interface CompletedRun { result: import('../../lib/toolPageTypes').ToolExecuteResult; params: SummarizerParams; identity: number }

export function retainCompletedRun(current: CompletedRun | null, result: CompletedRun['result'] | null, params: SummarizerParams, identity: number): CompletedRun | null {
  return result?.status === 'completed' ? { result, params, identity } : current
}

export function artifactPreviewKey(path: string, runIdentity: number) {
  return `${runIdentity}:${path}`
}

const TEXT_EXTENSIONS = ['.txt', '.md', '.srt', '.vtt'] as const
const TEXT_FILE_ERROR = 'Choose a UTF-8 text file with a .txt, .md, .srt, or .vtt extension.'

export function isSupportedSummarizerTextFile(name: string) {
  const lowerName = name.toLowerCase()
  return TEXT_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

export async function validateSummarizerFile(file: Pick<File, 'name' | 'arrayBuffer'>): Promise<string | null> {
  if (!isSupportedSummarizerTextFile(file.name)) return TEXT_FILE_ERROR
  let content: string
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
  } catch {
    return 'The selected file is not valid UTF-8 text. Choose a UTF-8 .txt, .md, .srt, or .vtt file.'
  }
  if (content.includes('\0')) return 'The selected file contains binary data. Choose a plain text file.'
  return null
}

/** The backend prefers an existing input_path over text, so submit exactly one source. */
export function summarizerRunParams(params: Record<string, unknown>, mode: SourceMode): SummarizerParams {
  return {
    text: mode === 'text' ? String(params.text ?? '') : '',
    input_path: mode === 'file' ? String(params.input_path ?? '') : '',
    max_bullets: params.max_bullets ?? 5,
    format: 'markdown',
  }
}

export function summarizerParamsChanged(previous: SummarizerParams, current: SummarizerParams) {
  return previous.text !== current.text
    || previous.input_path !== current.input_path
    || previous.max_bullets !== current.max_bullets
    || previous.format !== current.format
}
