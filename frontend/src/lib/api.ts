export type PortKind =
  | 'any'
  | 'audio'
  | 'video'
  | 'text'
  | 'folder'
  | 'image'
  | 'document'
  | 'code'
  | 'binary'
  | 'json'
  | 'csv'
  | 'stream'
  | string

export interface ToolManifest {
  id: string
  name: string
  description: string
  category?: string
  tags?: string[]
  input_kinds: PortKind[]
  output_kinds: PortKind[]
  parameters_schema: Record<string, unknown>
}

export interface Workspace {
  id: string
  name: string
  templates: unknown[]
  runs: unknown[]
  pipeline_runs?: number
}

export interface RunArtifact {
  name: string
  path: string
  size: number
}

export interface Run {
  id: string
  artifacts: RunArtifact[]
  tool_id?: string
  status?: string
  error?: string | null
  timestamp?: number
}

export interface ArtifactFile {
  name: string
  path: string
  size: number
  kind?: string
}

export interface YtdlpSettings {
  cookies_from_browser: string
  cookies_file_path: string
  extractor_args: string
  user_agent: string
  update_channel: string
}

export interface ProviderInfo {
  name: string
  type: 'local' | 'cloud'
  models: string[]
  needs_key: boolean
}

export interface DetectedModelProvider {
  id: string
  name: string
  description: string
  models: string[]
  has_key: boolean
  source: string
  env_vars: string[]
  is_custom?: boolean
}

export interface DownloadTask {
  id: string
  status: string
  progress: Record<string, unknown>
  error?: string | null
  params?: {
    url?: string
    format_preset?: string
    download_mode?: string
    [key: string]: unknown
  }
  result?: {
    status?: string
    artifacts?: { name: string; path: string; kind?: string }[]
    error?: string | null
    output_text?: string | null
    [key: string]: unknown
  } | null
  created_at?: number
  started_at?: number | null
  completed_at?: number | null
}

export interface DAGNode {
  id: string
  tool_id: string
  params?: Record<string, unknown>
  position?: { x: number; y: number }
}

export interface DAGEdge {
  id?: string
  source_node: string
  source_port?: string
  target_node: string
  target_port?: string
}

export interface DAGPipelineSpec {
  nodes: DAGNode[]
  edges?: DAGEdge[]
  error_policy?: 'fail_fast' | 'branch_pruning'
  cache_policy?: 'reuse' | 'recompute'
}

export interface CanvasNodeState {
  id: string
  type?: string
  position: { x: number; y: number }
  data: {
    label: string
    toolId: string
    category?: string
    inputKinds?: string[]
    outputKinds?: string[]
    params: Record<string, unknown>
    status?: 'idle' | 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
    errorMessage?: string
    durationSeconds?: number
    cached?: boolean
  }
}

export interface CanvasEdgeState {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  type?: string
  animated?: boolean
  style?: any
}

export interface CanvasState {
  workspace_id?: string
  updated_at?: number
  nodes: CanvasNodeState[]
  edges: CanvasEdgeState[]
  viewport?: { x: number; y: number; zoom: number }
}

export const API_BASE =
  typeof window !== 'undefined' &&
  window.location.port !== '8000' &&
  (window.location.port === '5173' ||
    window.location.port === '3000' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1')
    ? `http://${window.location.hostname || '127.0.0.1'}:8000`
    : ''

export function resolveUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  return `${API_BASE}${path}`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = resolveUrl(path)
  const res = await fetch(url, init)
  if (!res.ok) {
    let errorMsg = `${res.status} ${res.statusText}`
    try {
      const data = await res.json()
      if (data && typeof data === 'object') {
        errorMsg = data.detail || data.error || data.message || errorMsg
      }
    } catch {
      try {
        const text = await res.text()
        if (text) errorMsg = text
      } catch {
        /* ignore */
      }
    }
    throw new Error(errorMsg)
  }
  return (await res.json()) as T
}

export const api = {
  listTools: () => request<{ tools: ToolManifest[] }>('/api/tools'),
  listWorkspaces: () => request<{ workspaces: Workspace[] }>('/api/workspaces'),
  createWorkspace: (name: string) =>
    request<Workspace>('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  deleteWorkspace: (id: string) =>
    request<{ deleted: boolean }>(`/api/workspaces/${id}`, { method: 'DELETE' }),
  listRuns: (workspaceId: string) =>
    request<{ runs: Run[] }>(`/api/workspaces/${workspaceId}/runs`),
  getRunManifest: (workspaceId: string, runId: string) =>
    request<{ manifest: Record<string, unknown> }>(`/api/workspaces/${workspaceId}/runs/${runId}/manifest`),
  getRunLogs: (workspaceId: string, runId: string) =>
    request<{ logs: string }>(`/api/workspaces/${workspaceId}/runs/${runId}/logs`),
  listArtifacts: (workspaceId: string, runId: string) =>
    request<{ run_id: string; artifacts: ArtifactFile[] }>(
      `/api/workspaces/${workspaceId}/runs/${runId}/artifacts`,
    ),
  deleteRun: (workspaceId: string, runId: string) =>
    request<{ deleted: boolean }>(`/api/workspaces/${workspaceId}/runs/${runId}`, {
      method: 'DELETE',
    }),
  branchRun: (workspaceId: string, runId: string) =>
    request<{ run_id: string; tool_id?: string; artifacts: { name: string; path: string; size: number }[]; params: Record<string, unknown> }>(
      `/api/workspaces/${workspaceId}/runs/${runId}/branch`,
      { method: 'POST' },
    ),
  deleteArtifact: (workspaceId: string, runId: string, name: string) =>
    request<{ deleted: boolean }>(
      `/api/workspaces/${workspaceId}/runs/${runId}/artifacts/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    ),
  trimArtifact: (workspaceId: string, runId: string, name: string, regions: { start: number; end: number }[]) =>
    request<{ artifacts: string[] }>(
      `/api/workspaces/${workspaceId}/runs/${runId}/artifacts/${encodeURIComponent(name)}/trim`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regions }),
      },
    ),
  exportWorkspace: (workspaceId: string) =>
    resolveUrl(`/api/workspaces/${workspaceId}/export`),
  artifactPreviewUrl: (workspaceId: string, runId: string, name: string) =>
    resolveUrl(`/api/workspaces/${workspaceId}/runs/${runId}/artifacts/${encodeURIComponent(name)}/preview`),
  artifactDownloadUrl: (workspaceId: string, runId: string, name: string) =>
    resolveUrl(`/api/workspaces/${workspaceId}/runs/${runId}/artifacts/${encodeURIComponent(name)}/download`),
  getDetectedModelProviders: () =>
    request<{ providers: DetectedModelProvider[] }>('/api/tools/ai_model_health_check/providers'),
  getProviderModels: (provider: string, apiKey?: string) => {
    const q = new URLSearchParams({ provider })
    if (apiKey) q.set('api_key', apiKey)
    return request<{
      provider: string
      models: string[]
      source: string
      count: number
      error?: string
    }>(`/api/tools/ai_model_health_check/models?${q.toString()}`)
  },
  listProviders: () =>
    request<{ providers: Record<string, ProviderInfo>; local_models: string[] }>('/api/providers'),
  listKeys: () => request<{ providers: string[] }>('/api/providers/keys'),
  saveKey: (providerId: string, key: string) =>
    request<{ saved: boolean }>(`/api/providers/${providerId}/key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    }),
  executeTool: (toolId: string, payload: unknown) =>
    request<{
      status: string
      artifacts: { name: string; path: string; kind?: string }[]
      error?: string | null
      duration_seconds?: number | null
      data?: Record<string, any> | null
      output_text?: string | null
    }>(`/api/tools/${toolId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  getArtifactContent: (path: string) =>
    request<{ content: string; name: string; size: number; kind: string }>(
      `/api/artifacts/content?path=${encodeURIComponent(path)}`,
    ),
  validatePipeline: (workspaceId: string, payload: { chain?: string[]; nodes?: DAGNode[]; edges?: DAGEdge[] } | string[]) => {
    const body = Array.isArray(payload) ? { chain: payload } : payload
    return request<{ valid: boolean; error?: string | null; topological_order?: string[] }>(
      `/api/workspaces/${workspaceId}/pipeline/validate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )
  },
  runPipeline: (workspaceId: string, payload: { steps?: unknown[]; nodes?: DAGNode[]; edges?: DAGEdge[]; error_policy?: string } | unknown[]) => {
    const body = Array.isArray(payload) ? { steps: payload } : payload
    return request<{ results: unknown[] }>(`/api/workspaces/${workspaceId}/pipeline/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  },
  checkExistingPipelineInputs: (
    workspaceId: string,
    payload: { nodes: DAGNode[]; params_by_node: Record<string, Record<string, unknown>> },
  ) =>
    request<{
      has_existing: boolean
      matches: {
        node_id: string
        tool_id: string
        artifacts: { name: string; path: string; size: number }[]
        summary: string
      }[]
    }>(`/api/workspaces/${workspaceId}/pipeline/check-existing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  stopPipeline: (workspaceId: string) =>
    request<{ stopped: boolean }>(`/api/workspaces/${workspaceId}/pipeline/stop`, {
      method: 'POST',
    }),
  resolvePipelineUrl: (workspaceId: string, url: string) =>
    request<{
      ok: boolean
      title?: string
      duration_seconds?: number | null
      uploader?: string | null
      extractor?: string | null
      thumbnail?: string | null
      is_live?: boolean
      error?: string
    }>(`/api/workspaces/${workspaceId}/pipeline/resolve-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }),
  deleteWorkspaceMedia: (workspaceId: string, filename: string) =>
    request<{ deleted: boolean }>(`/api/workspaces/${workspaceId}/media/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    }),
  runPipelineStream: async (
    workspaceId: string,
    payload: { nodes: DAGNode[]; edges?: DAGEdge[]; error_policy?: string; cache_policy?: 'reuse' | 'recompute' },
    onEvent: (event: {
      type: string
      node_id?: string
      tool_id?: string
      tool_name?: string
      status?: string
      duration?: number
      error?: string
      reason?: string
      results?: unknown[]
    }) => void,
  ) => {
    const url = resolveUrl(`/api/workspaces/${workspaceId}/pipeline/run-stream`)
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      let errorMsg = `${response.status} ${response.statusText}`
      try {
        const data = await response.json()
        errorMsg = data.detail || data.error || errorMsg
      } catch {
        /* ignore */
      }
      throw new Error(errorMsg)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('ReadableStream not supported on this browser')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6))
            onEvent(data)
          } catch {
            /* ignore JSON parse errors */
          }
        }
      }
    }
  },
  listTemplates: (workspaceId: string, starters = true) =>
    request<{ templates: { name: string; chain: string[] }[] }>(
      `/api/workspaces/${workspaceId}/templates?starters=${starters}`,
    ),
  saveTemplate: (workspaceId: string, name: string, chain: string[]) =>
    request<{ name: string; chain: string[] }>(`/api/workspaces/${workspaceId}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, chain }),
    }),
  deleteTemplate: (workspaceId: string, name: string) =>
    request<{ ok: boolean }>(
      `/api/workspaces/${workspaceId}/templates/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    ),
  getWorkspaceCanvas: (workspaceId: string) =>
    request<CanvasState>(`/api/workspaces/${workspaceId}/canvas`),
  saveWorkspaceCanvas: (workspaceId: string, state: Partial<CanvasState>) =>
    request<CanvasState>(`/api/workspaces/${workspaceId}/canvas`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    }),
  resetWorkspaceCanvas: (workspaceId: string) =>
    request<CanvasState>(`/api/workspaces/${workspaceId}/canvas/reset`, {
      method: 'POST',
    }),
  getDownloadSettings: () =>
    request<{ max_concurrent: number; persisted: number }>('/api/settings/download'),
  updateDownloadSettings: (maxConcurrent: number) =>
    request<{ max_concurrent: number }>('/api/settings/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_concurrent: maxConcurrent }),
    }),
  getYtdlpSettings: () => request<YtdlpSettings>('/api/settings/ytdlp'),
  updateYtdlpSettings: (settings: Partial<YtdlpSettings>) =>
    request<YtdlpSettings>('/api/settings/ytdlp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }),
  listDownloads: () =>
    request<{ downloads: DownloadTask[] }>(
      '/api/downloads',
    ),
  enqueueDownload: (params: Record<string, unknown>) =>
    request<{ id: string; status: string }>('/api/downloads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }),
  cancelDownload: (taskId: string) =>
    request<{ cancelled: boolean }>(`/api/downloads/${taskId}/cancel`, { method: 'POST' }),
  removeDownload: (taskId: string) =>
    request<{ deleted: boolean }>(`/api/downloads/${taskId}`, { method: 'DELETE' }),
  clearDownloads: () =>
    request<{ cleared: number }>('/api/downloads', { method: 'DELETE' }),
  downloadStreamUrl: (taskId: string) => resolveUrl(`/api/downloads/${taskId}/stream`),
  getDeps: () =>
    request<{ dependencies: { name: string; installed?: string | null; latest?: string | null }[] }>(
      '/api/settings/deps',
    ),
  checkDeps: () =>
    request<{ dependencies: { name: string; installed?: string | null; latest?: string | null }[] }>(
      '/api/settings/deps/check',
      { method: 'POST' },
    ),
  updateDep: (packageName: string, channel: string = 'stable') =>
    request<{ ok: boolean; package?: string; channel?: string; error?: string }>('/api/settings/deps/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: packageName, approved: true, channel }),
    }),
  getRemoteInfo: () =>
    request<{ token: string; connect_url: string; host: string }>('/api/remote/info'),
  remoteEnqueue: (payload: Record<string, unknown>) =>
    request<{ id: string; status: string }>('/api/remote/downloads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  remoteCancel: (taskId: string, token: string) =>
    request<{ cancelled: boolean }>(`/api/remote/downloads/${taskId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }),
  getVideoInfo: (url: string) =>
    request<{
      title?: string | null
      author_name?: string | null
      thumbnail_url?: string | null
      duration?: number | null
      provider_name?: string | null
    }>(`/api/tools/downloader/info?url=${encodeURIComponent(url)}`),
  getRecentArtifacts: () =>
    request<{
      artifacts: { name: string; path: string; kind: string; size: number; mtime: number }[]
    }>('/api/artifacts/recent'),
  uploadFile: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      throw new Error(`Upload failed: ${res.statusText || res.status}`)
    }
    return res.json() as Promise<{ name: string; path: string; size: number; kind: string }>
  },
  listWorkspaceMedia: (workspaceId: string) =>
    request<WorkspaceMediaResponse>(`/api/workspaces/${workspaceId}/media`),
  listPipelineRuns: (workspaceId: string) =>
    request<{ pipeline_runs: PipelineRunGroup[] }>(`/api/workspaces/${workspaceId}/pipeline-runs`),
  muxSubtitles: (
    workspaceId: string,
    videoPath: string,
    subtitlePath: string,
    burnIn: boolean = false,
    outputName?: string
  ) =>
    request<{
      run_id: string
      name: string
      path: string
      size: number
      preview_url: string
      download_url: string
    }>(`/api/workspaces/${workspaceId}/mux-subtitles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_path: videoPath,
        subtitle_path: subtitlePath,
        burn_in: burnIn,
        output_name: outputName,
      }),
    }),
  downloadPipelineRunUrl: (workspaceId: string, pipelineRunId: string) =>
    resolveUrl(`/api/workspaces/${workspaceId}/pipeline_runs/${pipelineRunId}/download`),
}

export interface MediaItem {
  name: string
  path: string
  size: number
  mtime: number
  category: 'video' | 'subtitle' | 'audio' | 'document' | 'image' | 'package' | 'other'
  run_id?: string
  tool_id?: string
  pipeline_run_id?: string
  bundle_name?: string
  preview_url: string
  download_url: string
}

export interface MediaPackage {
  title: string
  video: MediaItem | null
  subtitles: MediaItem[]
  transcripts: MediaItem[]
  audio: MediaItem[]
  all_files: MediaItem[]
}

export interface WorkspaceMediaResponse {
  workspace_id: string
  total_files: number
  categories: Record<string, MediaItem[]>
  packages: MediaPackage[]
  all_files: MediaItem[]
}

export interface PipelineRunGroup {
  pipeline_run_id: string
  pipeline_name: string
  bundle_name?: string
  status: string
  timestamp: number
  steps: Run[]
  media: {
    video: MediaItem | null
    subtitles: MediaItem[]
    transcripts: MediaItem[]
    audio: MediaItem[]
    all_artifacts: MediaItem[]
  }
}

