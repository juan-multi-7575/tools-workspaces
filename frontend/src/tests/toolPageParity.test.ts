import test from 'node:test'
import assert from 'node:assert/strict'
import { BESPOKE_PAGES } from '../lib/toolPageModules'

const HELPERS_HOSTED_BY_DOWNLOADER = new Set([
  'media.download.resolve',
  'media.download.format_select',
  'media.subtitle.fetch',
  'media.thumbnail.get',
])

const EXPECTED_PAGE_IDS = [
  'media.download.yt-dlp', 'trimmer', 'transcriber', 'audio_processor',
  'mediainfo', 'streamlink', 'sox', 'demucs', 'gallery-dl',
  'imagemagick', 'exif_scrubber', 'pandoc', 'pdf_tools', 'ocrmypdf', 'packager',
  'summarizer', 'subtitle.translate.srt', 'text.translate.llm',
  'codec_tool', 'script_runner', 'sys.health.check',
]

test('every tool has a bespoke page and no page is orphaned', () => {
  assert.deepEqual(Object.keys(BESPOKE_PAGES).sort(), [...EXPECTED_PAGE_IDS].sort())
})

test('the four media helpers are intentionally not standalone pages', () => {
  for (const id of HELPERS_HOSTED_BY_DOWNLOADER) {
    assert.equal(BESPOKE_PAGES[id], undefined, `${id} lives inside the downloader page`)
  }
})
