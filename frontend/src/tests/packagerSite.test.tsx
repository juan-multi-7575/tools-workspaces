import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { PackagerHero, PackagerWorkspace } from '../sites/packager/PackagerSite'
import type { ToolManifest } from '../lib/api'

const MANIFEST: ToolManifest = {
  id: 'packager',
  name: 'Archive Packager (ZIP)',
  description: 'Bundle workspace outputs and artifacts into a compressed ZIP archive.',
  category: 'General',
  tags: ['archive', 'zip', 'packager', 'bundle'],
  input_kinds: ['any'],
  output_kinds: ['any', 'binary'],
  parameters_schema: { paths: { type: 'array' } },
}

function render(component: ReactNode) {
  return renderToStaticMarkup(<MemoryRouter>{component}</MemoryRouter>)
}

test('hero explains the tool and offers exactly two ways in', () => {
  const html = render(<PackagerHero manifest={MANIFEST} />)
  assert.match(html, /Choose a file/)
  assert.match(html, /Open an empty workspace/)
  assert.equal(html.match(/<button/g)?.length, 2)
  assert.match(html, /<h1/)
})

test('workspace renders a control bound to every manifest parameter', () => {
  const html = render(<PackagerWorkspace manifest={MANIFEST} />)
  for (const key of Object.keys(MANIFEST.parameters_schema)) {
    assert.ok(html.includes(`data-param-key="${key}"`), `parameter ${key} has no bound control`)
  }
})

test('workspace has a home affordance and no Tools Garage chrome', () => {
  const html = render(<PackagerWorkspace manifest={MANIFEST} />)
  assert.match(html, /All tools/)
  for (const phrase of ['Tools Garage', 'Workspaces', 'Remote', 'ENGINE STATUS']) {
    assert.ok(!html.includes(phrase), `found forbidden chrome: ${phrase}`)
  }
})

test('ZIP READY is only shown after an actual completed bundle.zip artifact', () => {
  const html = render(<PackagerWorkspace manifest={MANIFEST} />)
  assert.doesNotMatch(html, /ZIP READY/)
  assert.match(html, /Pack files into ZIP/)
})
