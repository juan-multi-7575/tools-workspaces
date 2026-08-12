export type PortKind = 'any' | 'audio' | 'video' | 'text' | 'folder'

export interface ToolManifest {
  id: string
  name: string
  description: string
  input_kinds: PortKind[]
  output_kinds: PortKind[]
  parameters_schema: Record<string, { type: string; enum?: (string | number)[] }>
}

export interface Workspace {
  id: string
  name: string
  templates: unknown[]
  runs: unknown[]
}

export interface RunArtifact {
  name: string
  path: string
  size: number
}

export interface Run {
  id: string
  artifacts: RunArtifact[]
}

export interface ArtifactFile {
  name: string
  path: string
  size: number
}

export interface ProviderInfo {
  name: string
  type: 'local' | 'cloud'
  models: string[]
  needs_key: boolean
}

export interface DownloadTask {
  id: string
  status: string
  progress: Record<string, unknown>
  error?: string | null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`)
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
  listArtifacts: (workspaceId: string, runId: string) =>
    request<{ run_id: string; artifacts: ArtifactFile[] }>(
      `/api/workspaces/${workspaceId}/runs/${runId}/artifacts`,
    ),
  deleteRun: (workspaceId: string, runId: string) =>
    request<{ deleted: boolean }>(`/api/workspaces/${workspaceId}/runs/${runId}`, {
      method: 'DELETE',
    }),
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
    `/api/workspaces/${workspaceId}/export`,
  artifactPreviewUrl: (workspaceId: string, runId: string, name: string) =>
    `/api/workspaces/${workspaceId}/runs/${runId}/artifacts/${encodeURIComponent(name)}/preview`,
  artifactDownloadUrl: (workspaceId: string, runId: string, name: string) =>
    `/api/workspaces/${workspaceId}/runs/${runId}/artifacts/${encodeURIComponent(name)}/download`,
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
    request<{ status: string; artifacts: { name: string; path: string }[]; error?: string | null }>(
      `/api/tools/${toolId}/execute`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    ),
  validatePipeline: (workspaceId: string, chain: string[]) =>
    request<{ valid: boolean; error?: string | null }>(
      `/api/workspaces/${workspaceId}/pipeline/validate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain }),
      },
    ),
  runPipeline: (workspaceId: string, steps: unknown[]) =>
    request<{ results: unknown[] }>(`/api/workspaces/${workspaceId}/pipeline/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps }),
    }),
  listTemplates: (workspaceId: string) =>
    request<{ templates: { name: string; chain: string[] }[] }>(
      `/api/workspaces/${workspaceId}/templates`,
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
  getDownloadSettings: () =>
    request<{ max_concurrent: number; persisted: number }>('/api/settings/download'),
  updateDownloadSettings: (maxConcurrent: number) =>
    request<{ max_concurrent: number }>('/api/settings/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_concurrent: maxConcurrent }),
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
  downloadStreamUrl: (taskId: string) => `/api/downloads/${taskId}/stream`,
  getDeps: () =>
    request<{ dependencies: { name: string; installed?: string | null; latest?: string | null }[] }>(
      '/api/settings/deps',
    ),
  checkDeps: () =>
    request<{ dependencies: { name: string; installed?: string | null; latest?: string | null }[] }>(
      '/api/settings/deps/check',
      { method: 'POST' },
    ),
  updateDep: (packageName: string) =>
    request<{ ok: boolean; package?: string; error?: string }>('/api/settings/deps/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: packageName, approved: true }),
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
}
