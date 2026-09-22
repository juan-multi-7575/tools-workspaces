import test from 'node:test'
import assert from 'node:assert'
import { resolvePipelineFlow } from '../lib/pipelineInputResolver.ts'
import type { ToolManifest } from '../lib/api.ts'

function node(id: string, toolId: string, params: Record<string, unknown> = {}) {
  return {
    id,
    type: 'toolNode',
    position: { x: 0, y: 0 },
    data: { label: toolId, toolId, inputKinds: ['any'], outputKinds: ['any'], params },
  }
}

function edge(source: string, target: string) {
  return { id: `e-${source}-${target}`, source, target, type: 'deletableEdge' }
}

const tools: ToolManifest[] = [
  {
    id: 'downloader',
    name: 'Video & Media Downloader',
    description: 'Downloads media from URLs.',
    input_kinds: ['any'],
    output_kinds: ['video', 'audio'],
    parameters_schema: {
      url: { type: 'string', title: 'Media URL', widget: 'url' },
      format_preset: { type: 'string', default: 'best' },
    },
  },
  {
    id: 'audio_processor',
    name: 'Audio Extractor',
    description: 'Extracts audio.',
    input_kinds: ['video'],
    output_kinds: ['audio'],
    parameters_schema: {
      format: { type: 'string', enum: ['wav', 'mp3'], default: 'wav' },
      sample_rate: { type: 'number', enum: [44100, 48000], default: 44100, unit: 'Hz' },
    },
  },
]

test('resolvePipelineFlow exposes root URL entry input and per-node params', () => {
  const flow = resolvePipelineFlow(
    [node('n1', 'downloader', { url: 'https://example.com/v' }), node('n2', 'audio_processor', { format: 'mp3' })],
    [edge('n1', 'n2')],
    tools,
  )
  // The downloader's URL is the root entry input; other root params are
  // surfaced as a per-node config group, and downstream nodes skip piped
  // inputs (input_path/file) fed by upstream edges.
  const urlInput = flow.entryInputs.find((i) => i.paramKey === 'url')
  assert.ok(urlInput, 'expected a URL entry input')
  assert.strictEqual(urlInput.isUrl, true)
  assert.strictEqual(urlInput.isRootInput, true)
  const downloaderGroup = flow.nodeConfigs.find((g) => g.nodeId === 'n1')
  assert.ok(downloaderGroup)
  assert.strictEqual(downloaderGroup.parameters.length, 1)
  assert.strictEqual(downloaderGroup.parameters[0].paramKey, 'format_preset')
  const audioGroup = flow.nodeConfigs.find((g) => g.nodeId === 'n2')
  assert.ok(audioGroup)
  assert.strictEqual(audioGroup.parameters.length, 2)
})

test('resolvePipelineFlow treats translation toggle as a run option, not an override', () => {
  const transcriber: ToolManifest = {
    id: 'transcriber',
    name: 'Audio Transcriber',
    description: 'Transcribes audio.',
    input_kinds: ['audio'],
    output_kinds: ['text'],
    parameters_schema: { task: { type: 'string', enum: ['transcribe', 'translate'], default: 'transcribe' } },
  }
  const flow = resolvePipelineFlow(
    [node('n1', 'downloader', { url: 'https://example.com/v' }), node('n2', 'transcriber', { task: 'translate' })],
    [edge('n1', 'n2')],
    [...tools, transcriber],
  )
  assert.strictEqual(flow.hasTranslationNode, true)
  assert.strictEqual(flow.translationToolId, 'transcriber')
  assert.strictEqual(flow.isTranslationEnabled, true)
  // Translation toggle is surfaced as a run option on the transcriber node,
  // not as a separate root entry input.
  assert.strictEqual(flow.entryInputs.find((i) => i.paramKey === 'task'), undefined)
  const transGroup = flow.nodeConfigs.find((g) => g.nodeId === 'n2')
  assert.ok(transGroup)
  assert.ok(transGroup.parameters.some((p) => p.paramKey === 'task'))
})

test('resolvePipelineFlow skips piped inputs on downstream nodes', () => {
  const flow = resolvePipelineFlow(
    [node('n1', 'downloader', { url: 'https://example.com/v' }), node('n2', 'audio_processor', { format: 'wav' })],
    [edge('n1', 'n2')],
    tools,
  )
  const audioGroup = flow.nodeConfigs.find((g) => g.nodeId === 'n2')
  assert.ok(audioGroup)
  // Downstream nodes must not re-surface upstream-fed input_path/file params.
  assert.ok(!audioGroup.parameters.some((p) => p.paramKey === 'input_path'))
})