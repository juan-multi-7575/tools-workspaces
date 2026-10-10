import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { BESPOKE_PAGES } from '../lib/toolPageModules'

test('downloader page is registered under its canonical id', () => {
  assert.ok(BESPOKE_PAGES['media.download.yt-dlp'], 'media.download.yt-dlp must have a bespoke page')
})

test('downloader page offers the url probe instead of a fake submit', async () => {
  const source = await readFile(new URL('../pages/tools/DownloaderPage.tsx', import.meta.url), 'utf8')
  assert.match(source, /getVideoInfo/, 'the page must probe real metadata before running')
  assert.doesNotMatch(source, /setTimeout\(.*(simulate|fake|progress)/i, 'no simulated work is allowed')
})

test('downloader page drives the download queue and the four atomic media helpers', async () => {
  const source = await readFile(new URL('../pages/tools/DownloaderPage.tsx', import.meta.url), 'utf8')
  for (const helper of ['media.download.resolve', 'media.download.format_select', 'media.subtitle.fetch', 'media.thumbnail.get']) {
    assert.ok(source.includes(helper), `the page must expose the ${helper} helper`)
  }
})
