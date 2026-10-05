import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import Hero from '../sites/streamlink/Hero'
import Workspace, { StatusBoard } from '../sites/streamlink/Workspace'
import type { ToolManifest } from '../lib/api'
const manifest = JSON.parse(readFileSync(new URL('../../../docs/research/batch-A/streamlink/manifest.json', import.meta.url), 'utf8')) as ToolManifest
const render = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)
test('streamlink hero offers exactly two entry actions with no shell', () => {
 const html=render(<Hero manifest={manifest} />); assert.equal(html.match(/<button/g)?.length,2)
 assert.match(html,/Use this URL/);assert.match(html,/Open an empty workspace/)
 assert.doesNotMatch(html,/Tools Garage|Workspaces|Remote|ENGINE STATUS/)
})
test('streamlink workspace binds every manifest parameter and links home', () => {
 const html=render(<Workspace manifest={manifest} />)
 for(const key of Object.keys(manifest.parameters_schema)) assert.ok(html.includes(`data-param-key="${key}"`))
 assert.match(html,/All tools/);assert.doesNotMatch(html,/Tools Garage|Workspaces|Remote|ENGINE STATUS/)
})
test('streamlink cannot say captured without a verified artifact', () => {
 const html=renderToStaticMarkup(<StatusBoard phase="completed" verified={false} error={null} />)
 assert.doesNotMatch(html,/CAPTURED/);assert.match(html,/VERIFYING/)
 assert.match(renderToStaticMarkup(<StatusBoard phase="completed" verified error={null} />),/CAPTURED/)
})
test('streamlink failure owns the screen with one verbatim error', () => {
 const html=renderToStaticMarkup(<StatusBoard phase="failed" verified={false} error={'yt-dlp not installed'} />)
 assert.match(html,/OFF AIR/);assert.match(html,/Both the capture and the yt-dlp fallback failed/)
 assert.equal(html.match(/yt-dlp not installed/g)?.length,1)
})
test('streamlink OFF AIR displays the actual failed run response verbatim', () => {
 const response = JSON.parse(readFileSync(new URL('../../../docs/research/batch-A/streamlink/real-run.json', import.meta.url), 'utf8'))
 assert.equal(response.status, 'failed'); assert.equal(response.artifacts.length, 0)
 const html = renderToStaticMarkup(<StatusBoard phase="failed" verified={false} error={response.error.message} />)
 assert.match(html, /OFF AIR/);assert.match(html, /ModuleNotFoundError: No module named &#x27;yt_dlp&#x27;/)
})
