import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import ExifScrubberHero from '../sites/exif_scrubber/ExifScrubberHero'
import ExifScrubberWorkspace from '../sites/exif_scrubber/ExifScrubberWorkspace'
import type { ToolManifest } from '../lib/api'

const MANIFEST: ToolManifest = {
  id: 'exif_scrubber',
  name: 'EXIF Metadata Privacy Scrubber (ExifTool)',
  description: 'Extract and scrub private EXIF, GPS location, and camera metadata from images and media.',
  input_kinds: ['image', 'video', 'any'],
  output_kinds: ['image', 'json'],
  parameters_schema: {
    input_path: { type: 'string', title: 'Input Media / Image File', description: 'Path to file to scrub or inspect.', default: '' },
    action: { type: 'string', title: 'Operation', enum: ['scrub', 'inspect'], default: 'scrub' },
  },
}

const render = (node: ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)

test('the hero has a title, short description and exactly two ways into the workspace', () => {
  const html = render(<ExifScrubberHero manifest={MANIFEST} />)
  assert.match(html, /<h1>/)
  assert.match(html, /Extract and scrub private EXIF/)
  assert.match(html, /Choose a media file/)
  assert.match(html, /Open the workspace/)
  assert.equal(html.match(/<button/g)?.length, 2)
})

test('workspace binds a labelled control to every manifest parameter and links home', () => {
  const html = render(<ExifScrubberWorkspace manifest={MANIFEST} />)
  for (const key of Object.keys(MANIFEST.parameters_schema)) {
    assert.ok(html.includes(`data-param-key="${key}"`), `missing control for ${key}`)
  }
  assert.match(html, /Input Media \/ Image File/)
  assert.match(html, /Operation/)
  assert.match(html, /All tools/)
})

test('the workspace exposes both manifest actions and searchable privacy filtering', () => {
  const html = render(<ExifScrubberWorkspace manifest={MANIFEST} />)
  assert.match(html, /\/> scrub</)
  assert.match(html, /\/> inspect</)
  assert.match(html, /Search fields/)
  assert.match(html, /Privacy-relevant only/)
})

test('the site uses the plain CERN palette and contains no platform chrome', () => {
  const html = render(<ExifScrubberHero manifest={MANIFEST} />) + render(<ExifScrubberWorkspace manifest={MANIFEST} />)
  assert.match(html, /exif-site/)
  assert.doesNotMatch(html, /Tools Garage|Workspaces|ENGINE STATUS/)
})
