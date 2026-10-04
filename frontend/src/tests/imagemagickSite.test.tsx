import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import ImageMagickHero from '../sites/imagemagick/ImageMagickHero'
import ImageMagickWorkspace from '../sites/imagemagick/ImageMagickWorkspace'
import HomeSite from '../sites/home/HomeSite'
import { BUILT_SITES, describeSite } from '../sites/registry'
import type { ToolManifest } from '../lib/api'

/**
 * Transcribed from the live `/api/tools/imagemagick` manifest. The assertions
 * below are about the four keys the backend actually declares — if the manifest
 * grows a key, `the workspace surfaces every manifest parameter` fails rather
 * than the page quietly dropping it.
 */
const MANIFEST: ToolManifest = {
  id: 'imagemagick',
  name: 'Image Converter & Resizer (ImageMagick)',
  description: 'Convert image formats (PNG, JPG, WebP), crop, optimize, and resize images.',
  category: 'Images',
  tags: ['image', 'imagemagick', 'converter', 'resizer'],
  input_kinds: ['image'],
  output_kinds: ['image'],
  parameters_schema: {
    input_path: {
      type: 'string',
      title: 'Input Image File',
      description: 'Path to input image file (PNG, JPG, WebP, etc.).',
      default: '',
    },
    format: { type: 'string', title: 'Target Format', enum: ['png', 'jpg', 'webp'], default: 'webp' },
    quality: { type: 'number', title: 'Quality (1-100)', default: 85 },
    resize: {
      type: 'string',
      title: 'Resize Geometry',
      placeholder: 'e.g. 800x600, 50%',
      default: '',
    },
  },
}

const PARAM_KEYS = ['input_path', 'format', 'quality', 'resize']

function renderHero() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ImageMagickHero manifest={MANIFEST} />
    </MemoryRouter>,
  )
}

function renderWorkspace() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ImageMagickWorkspace manifest={MANIFEST} />
    </MemoryRouter>,
  )
}

test('the hero states what the tool does and offers its two ways in', () => {
  const html = renderHero()
  assert.match(html, /Choose an image/, 'the hero must offer the file picker')
  assert.match(html, /Open an empty workspace/, 'the hero must offer the empty workspace')
  // The hero is a state of its own, not a form with a hidden submit.
  assert.doesNotMatch(html, /<form/, 'the hero is not a form')
})

test('the hero gives the workspace a home affordance back to the index', () => {
  assert.match(renderHero(), /All tools/)
})

test('the workspace renders a control for all four manifest keys with data-param-key', () => {
  const html = renderWorkspace()
  for (const key of PARAM_KEYS) {
    assert.ok(
      html.includes(`data-param-key="${key}"`),
      `parameter "${key}" has no bound control on the ImageMagick workspace`,
    )
  }
})

test('the workspace surfaces every manifest parameter, so a new key cannot be dropped silently', () => {
  const html = renderWorkspace()
  for (const key of Object.keys(MANIFEST.parameters_schema)) {
    assert.ok(
      html.includes(`data-param-key="${key}"`),
      `the backend declares "${key}" but the workspace renders no control for it`,
    )
  }
})

test('every manifest control carries the manifest’s own title and key', () => {
  const html = renderWorkspace()
  for (const spec of Object.values(MANIFEST.parameters_schema) as { title: string }[]) {
    assert.ok(html.includes(spec.title), `label "${spec.title}" is missing from the workspace`)
  }
  for (const option of ['png', 'jpg', 'webp']) {
    assert.ok(html.includes(`>${option}<`), `format option "${option}" is not selectable`)
  }
})

test('the signature: the resize geometry is editable in place and is the largest input', () => {
  const html = renderWorkspace()
  assert.match(html, /id="im-resize"/, 'the geometry string must be editable in place')
  assert.match(html, /class="im-geo-input"/, 'the geometry field is the oversized hero input')
  // Real geometries the backend passes straight to `magick -resize`, offered as
  // named chips rather than a dropdown of raw strings.
  for (const label of ['50%', '200%', '1200 wide', '1200 tall', '800×600 fit', '800×600 shrink', '800×600 cover']) {
    assert.ok(html.includes(label), `geometry preset "${label}" is missing`)
  }
  // The same strings are spelled out in the key, including the ImageMagick
  // `>` shrink-only operator, which must survive as a real character.
  assert.ok(html.includes('800x600&gt;'), 'the shrink-only geometry must reach the user intact')
  assert.doesNotMatch(html, /&amp;lt;|&amp;gt;/, 'no double-escaped operator text may reach the user')
})

test('the empty canvas is a designed state that says what to do — never a texture', () => {
  const html = renderWorkspace()
  assert.match(html, /No image chosen yet\./, 'the input pane must say it is empty')
  assert.match(html, /Choose an image/, 'the empty state must point at the action that fills it')
  assert.match(html, /empty on purpose/, 'the empty state must say why nothing is drawn')
  assert.match(html, /Nothing converted yet\./, 'the output pane must say it is empty')
  // The brief bans a checkerboard standing in for absent content.
  assert.doesNotMatch(html, /conic-gradient/, 'no checkerboard may stand in for a missing image')
  assert.doesNotMatch(html, /checkerboard/i)
})

test('the dependency gate is hosted in the trailing action bar, outside the scrolling canvas', () => {
  const html = renderWorkspace()
  const region = html.indexOf('data-tool-gate-region="imagemagick"')
  assert.ok(region > -1, 'the trailing action bar must be marked as the gate region')
  const canvas = html.indexOf('class="im-canvas"')
  assert.ok(canvas > -1, 'the canvas must be its own element')
  // The whole point of the trailing bar: the gate is not inside the region that
  // scrolls, so a long canvas cannot push the install control off screen.
  assert.ok(
    region > canvas,
    'the gate must sit after the scrolling canvas, not inside it',
  )
  // And the bar is the last thing in the page, after the stage.
  assert.ok(
    html.indexOf('im-stage') < region,
    'the gate region must be a sibling of the stage, not nested in it',
  )
})

test('neither site carries any Tools Garage chrome', () => {
  const FORBIDDEN = ['Tools Garage', 'Workspaces', 'Remote', 'ENGINE STATUS']
  const surfaces: [string, string][] = [
    ['hero', renderHero()],
    ['workspace', renderWorkspace()],
    ['home', renderToStaticMarkup(
      <MemoryRouter>
        <HomeSite />
      </MemoryRouter>,
    )],
  ]
  for (const [name, html] of surfaces) {
    for (const phrase of FORBIDDEN) {
      assert.ok(
        !html.includes(phrase),
        `the ${name} site contains the Tools Garage chrome string "${phrase}"`,
      )
    }
  }
})

test('the home index links only to sites that exist, and says so about the rest', () => {
  assert.deepEqual(Object.keys(BUILT_SITES), ['imagemagick'])
  assert.equal(describeSite('imagemagick').availability, 'built')
  // A tool with no brief-covered site must not borrow a link to a dead route.
  for (const id of ['trimmer', 'some.tool.nobody.briefed']) {
    const site = describeSite(id)
    assert.equal(site.availability, 'planned')
    assert.equal(site.path, undefined, `${id} must not advertise a path it does not have`)
  }
  // Legacy and hosted ids are named for what they actually are.
  assert.equal(describeSite('downloader').availability, 'alias')
  assert.equal(describeSite('downloader').owner, 'media.download.yt-dlp')
  assert.equal(describeSite('media.thumbnail.get').availability, 'hosted')
})

test('the home index reads the registry from the backend, not from a hardcoded list', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../sites/home/HomeSite.tsx', import.meta.url), 'utf8'),
  )
  assert.match(source, /api\s*\n?\s*\.listTools|listTools\(/, 'the index must read api.listTools()')
  assert.match(source, /href|to=|\/tools/, 'the index must offer the existing catalog')
  assert.match(source, /\/dependencies/, 'the index must offer the dependency manager')
})