import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import Hero from '../sites/gallery-dl/Hero'
import Workspace, { ArchiveFrame } from '../sites/gallery-dl/Workspace'
import type { ToolManifest } from '../lib/api'
const manifest = JSON.parse(readFileSync(new URL('../../../docs/research/batch-A/gallery-dl/manifest.json', import.meta.url), 'utf8')) as ToolManifest
const render = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)
test('gallery-dl hero has two entry actions with no platform chrome', () => {
 const html=render(<Hero manifest={manifest} />);assert.equal(html.match(/<button/g)?.length,2)
 assert.match(html,/Use this URL/);assert.match(html,/Open an empty workspace/)
 assert.doesNotMatch(html,/Tools Garage|Workspaces|Remote|ENGINE STATUS/)
})
test('gallery-dl exposes all real parameter keys and home navigation', () => {
 const html=render(<Workspace manifest={manifest} />)
 for(const key of Object.keys(manifest.parameters_schema)) assert.ok(html.includes(`data-param-key="${key}"`))
 assert.match(html,/All tools/);assert.doesNotMatch(html,/Tools Garage|Workspaces|Remote|ENGINE STATUS/)
})
test('gallery-dl shows a returned zip as a download without inventing thumbnails', () => {
 const html=renderToStaticMarkup(<ArchiveFrame name="gallery.zip" path="/downloads/gallery.zip" url="blob:actual-archive" bytes={12} />)
 assert.match(html,/gallery.zip/);assert.match(html,/Download archive/);assert.match(html,/download=/)
 assert.doesNotMatch(html,/<img|<canvas|image-\d/)
})
