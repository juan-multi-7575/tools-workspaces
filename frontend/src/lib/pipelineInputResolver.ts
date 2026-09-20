import type { Edge, Node } from '@xyflow/react'
import type { ToolManifest } from './api'

export interface PipelineEntryInput {
  nodeId: string
  toolId: string
  toolName: string
  paramKey: string
  title: string
  description?: string
  type: string
  defaultVal?: unknown
  currentVal?: unknown
  isUrl: boolean
  isFilePath: boolean
  isRootInput?: boolean
  isOption?: boolean
  enumOptions?: (string | number)[]
  enumLabels?: Record<string, string>
}

export interface PipelineNodeConfigGroup {
  nodeId: string
  toolId: string
  toolName: string
  category?: string
  isRoot: boolean
  parameters: PipelineEntryInput[]
}

export interface ResolvedPipelineFlow {
  entryInputs: PipelineEntryInput[]
  nodeConfigs: PipelineNodeConfigGroup[]
  hasTranslationNode: boolean
  translationNodeId?: string
  translationToolId?: string
  isTranslationEnabled?: boolean
}

/**
 * Resolves entry inputs and configurable parameters across all nodes in a pipeline DAG.
 */
export function resolvePipelineFlow(
  nodes: Node<{ toolId: string; params: Record<string, unknown>; label?: string }>[],
  edges: Edge[],
  tools: ToolManifest[],
): ResolvedPipelineFlow {
  if (!nodes || nodes.length === 0) {
    return {
      entryInputs: [],
      nodeConfigs: [],
      hasTranslationNode: false,
    }
  }

  // 1. Calculate in-degree for every node
  const inDegrees: Record<string, number> = {}
  for (const n of nodes) {
    inDegrees[n.id] = 0
  }
  for (const e of edges) {
    if (inDegrees[e.target] !== undefined) {
      inDegrees[e.target] += 1
    }
  }

  const entryInputs: PipelineEntryInput[] = []
  const nodeConfigs: PipelineNodeConfigGroup[] = []

  let hasTranslationNode = false
  let translationNodeId: string | undefined = undefined
  let translationToolId: string | undefined = undefined
  let isTranslationEnabled = false

  for (const node of nodes) {
    const isRoot = (inDegrees[node.id] || 0) === 0
    const tool = tools.find((t) => t.id === node.data.toolId)
    const schema = (tool?.parameters_schema || {}) as Record<string, any>
    const currentParams = node.data.params || {}
    const nodeParams: PipelineEntryInput[] = []

    // Detect translation nodes
    if (node.data.toolId === 'transcriber' || node.data.toolId === 'subtitle_translator') {
      hasTranslationNode = true
      translationNodeId = node.id
      translationToolId = node.data.toolId
      if (node.data.toolId === 'transcriber') {
        isTranslationEnabled = currentParams['task'] === 'translate'
      } else if (node.data.toolId === 'subtitle_translator') {
        isTranslationEnabled = currentParams['target_lang'] === 'English' || !currentParams['target_lang']
      }
    }

    const schemaKeys = Object.keys(schema)

    for (const key of schemaKeys) {
      // Exclude low-level internal flags
      if (
        key === 'raw_args' ||
        key === 'output_template' ||
        key === 'cookies_file' ||
        key === 'extractor_args'
      ) {
        continue
      }

      // If downstream (inDegree > 0), exclude inputs that are fed by upstream nodes
      const isPipedInput =
        !isRoot &&
        (key === 'input_path' ||
          key === 'input_paths' ||
          key === 'file' ||
          key === 'files' ||
          key === 'audio_path' ||
          key === 'video_path')

      if (isPipedInput) {
        continue
      }

      const spec = schema[key] || {}
      const isBooleanType = spec.type === 'boolean'
      const isUrl =
        !isBooleanType &&
        (key.toLowerCase().includes('url') ||
          spec.widget === 'url' ||
          String(spec.title || '').toLowerCase().includes('url'))
      // isFilePath must be type-aware: booleans like `restrict_filenames` contain "file" but are NOT files.
      // Only treat as file if widget is artifact_picker OR key is a known file/path param and type is string.
      const isFilePath =
        !isBooleanType &&
        (spec.widget === 'artifact_picker' ||
          ['input_path', 'input_paths', 'file', 'files', 'audio_path', 'video_path', 'cookies_file', 'input_pdf'].includes(
            key,
          ) ||
          key.toLowerCase().endsWith('_path') ||
          key.toLowerCase().endsWith('_file'))

      const item: PipelineEntryInput = {
        nodeId: node.id,
        toolId: node.data.toolId,
        toolName: tool?.name || node.data.label || node.data.toolId,
        paramKey: key,
        title: spec.title || key,
        description: spec.description,
        type: spec.type || 'string',
        defaultVal: spec.default,
        currentVal: currentParams[key] ?? spec.default,
        isUrl,
        isFilePath,
        isRootInput: isRoot && (isUrl || isFilePath || key === 'prompt' || key === 'code' || key === 'script'),
        enumOptions: spec.enum,
        enumLabels: spec.enumLabels,
      }

      if (item.isRootInput) {
        entryInputs.push(item)
      } else {
        nodeParams.push(item)
      }
    }

    if (nodeParams.length > 0) {
      nodeConfigs.push({
        nodeId: node.id,
        toolId: node.data.toolId,
        toolName: tool?.name || node.data.label || node.data.toolId,
        category: tool?.category,
        isRoot,
        parameters: nodeParams,
      })
    }
  }

  // Fallback: If no root entry input was categorized, pick the first parameter from root node
  if (entryInputs.length === 0) {
    for (const node of nodes) {
      if ((inDegrees[node.id] || 0) === 0) {
        const group = nodeConfigs.find((g) => g.nodeId === node.id)
        if (group && group.parameters.length > 0) {
          const first = group.parameters.shift()!
          first.isRootInput = true
          entryInputs.push(first)
        }
      }
    }
  }

  return {
    entryInputs,
    nodeConfigs,
    hasTranslationNode,
    translationNodeId,
    translationToolId,
    isTranslationEnabled,
  }
}

/**
 * Backward-compatible helper that returns required entry inputs for the pipeline.
 */
export function resolvePipelineEntryInputs(
  nodes: Node<{ toolId: string; params: Record<string, unknown>; label?: string }>[],
  edges: Edge[],
  tools: ToolManifest[],
): PipelineEntryInput[] {
  return resolvePipelineFlow(nodes, edges, tools).entryInputs
}
