import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import Hero from '../sites/sox/Hero'
import Workspace from '../sites/sox/Workspace'
import type { ToolManifest } from '../lib/api'
const manifest = { id: 'sox', name: 'SoX', description: 'Apply audio effects.', parameters_schema: { effect: { type: 'string' } } } as ToolManifest
const render = (element: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>)
test('sox hero has exactly two entry actions and no shell', () => {
  const html = render(<Hero manifest={manifest} />)
  assert.equal(html.match(/<button/g)?.length, 2)
  assert.match(html, /Choose audio/)
  assert.match(html, /Open an empty workspace/)
  assert.doesNotMatch(html, /Tools Garage|Workspaces|Remote|ENGINE STATUS/)
})
test('sox workspace surfaces every declared parameter and required input path', () => {
  const html = render(<Workspace manifest={manifest} />)
  for (const key of [...Object.keys(manifest.parameters_schema), 'input_path']) assert.ok(html.includes(`data-param-key="${key}"`))
  assert.match(html, /All tools/)
  assert.match(html, /required.*schema/)
  assert.doesNotMatch(html, /&amp;lt;|&amp;gt;|Tools Garage|Workspaces|Remote|ENGINE STATUS/)
  assert.match(html, /sox &lt;input&gt;/)
})
