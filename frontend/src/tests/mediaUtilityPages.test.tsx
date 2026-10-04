import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { BESPOKE_PAGES } from '../lib/toolPageModules'
import MediainfoPage from '../pages/tools/MediainfoPage'
import StreamlinkPage from '../pages/tools/StreamlinkPage'
import SoxPage from '../pages/tools/SoxPage'
import DemucsPage from '../pages/tools/DemucsPage'
import GalleryDlPage from '../pages/tools/GalleryDlPage'

const MEDIA_UTILITY_IDS = ['mediainfo', 'streamlink', 'sox', 'demucs', 'gallery-dl'] as const

test('the five media utility tools each have a bespoke page', () => {
  for (const id of MEDIA_UTILITY_IDS) {
    assert.ok(BESPOKE_PAGES[id], `${id} must have a bespoke page`)
  }
})

test('each media utility id maps to the page written for it', () => {
  assert.equal(BESPOKE_PAGES.mediainfo, MediainfoPage)
  assert.equal(BESPOKE_PAGES.streamlink, StreamlinkPage)
  assert.equal(BESPOKE_PAGES.sox, SoxPage)
  assert.equal(BESPOKE_PAGES.demucs, DemucsPage)
  // The registry key is the hyphenated backend id, not gallery_dl.
  assert.equal(BESPOKE_PAGES['gallery-dl'], GalleryDlPage)
  assert.equal(BESPOKE_PAGES.gallery_dl, undefined)
})

test('the five pages render server-side without a network call and expose every schema key', () => {
  const manifestFor = (id: string, keys: string[]) => ({
    id,
    name: id,
    description: `${id} manifest`,
    category: 'Media',
    tags: [id],
    input_kinds: ['any'],
    output_kinds: ['any'],
    parameters_schema: Object.fromEntries(keys.map((key) => [key, { type: 'string', title: key }])),
  })

  const cases = [
    { id: 'mediainfo', keys: ['input_path'], Component: MediainfoPage },
    { id: 'streamlink', keys: ['url'], Component: StreamlinkPage },
    { id: 'sox', keys: ['effect'], Component: SoxPage },
    { id: 'demucs', keys: ['input_path'], Component: DemucsPage },
    { id: 'gallery-dl', keys: ['url'], Component: GalleryDlPage },
  ] as const

  for (const { id, keys, Component } of cases) {
    const html = renderToStaticMarkup(
      <Component manifest={manifestFor(id, [...keys])} initialParams={{}} />,
    )
    assert.ok(html.length > 0, `${id} must render markup`)
    for (const key of keys) {
      assert.ok(
        html.includes(`data-param-key="${key}"`),
        `${id} must expose a control bound to the "${key}" manifest key`,
      )
    }
  }
})