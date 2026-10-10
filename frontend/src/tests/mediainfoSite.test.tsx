import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import Hero from '../sites/mediainfo/Hero'
import Workspace, { ProbeData } from '../sites/mediainfo/Workspace'
import type { ToolManifest } from '../lib/api'
const manifest = JSON.parse(readFileSync(new URL('../../../docs/research/batch-A/mediainfo/manifest.json', import.meta.url), 'utf8')) as ToolManifest
const render = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)
test('mediainfo hero offers exactly two ways in without platform chrome', () => {
  const html = render(<Hero manifest={manifest} />)
  assert.equal(html.match(/<button/g)?.length, 2)
  assert.match(html, /Choose media/); assert.match(html, /Open an empty workspace/)
  assert.doesNotMatch(html, /Tools Garage|Workspaces|Remote|ENGINE STATUS/)
})
test('mediainfo workspace exposes every live manifest key and home navigation', () => {
  const html = render(<Workspace manifest={manifest} />)
  for (const key of Object.keys(manifest.parameters_schema)) assert.ok(html.includes(`data-param-key="${key}"`))
  assert.match(html, /All tools/); assert.doesNotMatch(html, /Tools Garage|Workspaces|Remote|ENGINE STATUS/)
})
test('mediainfo shows returned fields without filling missing stream bitrate', () => {
  const html = renderToStaticMarkup(<ProbeData data={{ format: { duration: '1.0' }, streams: [{ codec_type: 'audio', codec_name: 'pcm_s16le' }] }} />)
  assert.match(html, /duration/); assert.match(html, /1.0/); assert.match(html, /pcm_s16le/)
  assert.doesNotMatch(html, /bit_rate|sample_rate|channels/)
  assert.match(renderToStaticMarkup(<ProbeData data={{}} />), /probe returned nothing/i)
})
test('mediainfo renderer includes exactly the leaf keys in a real ffprobe response', () => {
  const response = JSON.parse(readFileSync(new URL('../../../docs/research/batch-A/mediainfo/real-run.json', import.meta.url), 'utf8'))
  const leafKeys = (value: unknown, prefix = ''): string[] => value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, item]) => leafKeys(item, prefix ? `${prefix}.${key}` : key)) : [prefix]
  const expected = [...leafKeys(response.data.format), ...response.data.streams.flatMap((stream: unknown) => leafKeys(stream))].sort()
  const html = renderToStaticMarkup(<ProbeData data={response.data} />)
  const actual = [...html.matchAll(/data-probe-key="([^"]+)"/g)].map(match => match[1]).sort()
  assert.deepEqual(actual, expected)
})
