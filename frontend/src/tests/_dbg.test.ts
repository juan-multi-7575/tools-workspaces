import test from 'node:test'
import { resolvePipelineFlow } from '../lib/pipelineInputResolver.ts'
import type { ToolManifest } from '../lib/api.ts'

function node(id: string, toolId: string, params: Record<string, unknown> = {}) {
  return { id, type: 'toolNode', position: { x: 0, y: 0 }, data: { label: toolId, toolId, inputKinds: ['any'], outputKinds: ['any'], params } }
}
function edge(s: string, t: string) { return { id: `e-${s}-${t}`, source: s, target: t, type: 'deletableEdge' } }

const tools: ToolManifest[] = [
  { id: 'downloader', name: 'Video & Media Downloader', description: 'd', input_kinds: ['any'], output_kinds: ['video', 'audio'], parameters_schema: { url: { type: 'string', title: 'Media URL', widget: 'url' }, format_preset: { type: 'string', default: 'best' } } },
  { id: 'audio_processor', name: 'Audio Extractor', description: 'd', input_kinds: ['video'], output_kinds: ['audio'], parameters_schema: { format: { type: 'string', enum: ['wav', 'mp3'], default: 'wav' }, sample_rate: { type: 'number', enum: [44100, 48000], default: 44100, unit: 'Hz' } } },
]

test('dbg', () => {
  const flow = resolvePipelineFlow([node('n1', 'downloader', { url: 'https://example.com/v' }), node('n2', 'audio_processor', { format: 'mp3' })], [edge('n1', 'n2')], tools)
  console.log('ENTRY', flow.entryInputs.map(i => ({ key: i.paramKey, url: i.isUrl, root: i.isRootInput })))
  console.log('CONFIGS', flow.nodeConfigs.map(g => ({ nodeId: g.nodeId, params: g.parameters.map(p => p.paramKey) })))
})