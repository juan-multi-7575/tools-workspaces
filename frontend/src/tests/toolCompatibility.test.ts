import test from 'node:test'
import assert from 'node:assert'
import { getCompatibleTools, isToolCompatible } from '../lib/toolCompatibility.ts'

test('toolCompatibility - detects audio files for transcriber and trimmer', () => {
  const result = getCompatibleTools('lecture.mp3')
  const transcriber = result.find(t => t.toolId === 'transcriber')
  const trimmer = result.find(t => t.toolId === 'trimmer')
  const translator = result.find(t => t.toolId === 'translator')

  assert.strictEqual(transcriber?.compatible, true)
  assert.strictEqual(trimmer?.compatible, true)
  assert.strictEqual(translator?.compatible, false)
  assert.strictEqual(isToolCompatible('transcriber', 'lecture.mp3'), true)
})

test('toolCompatibility - detects subtitle files for translator', () => {
  const result = getCompatibleTools('subtitles.en.srt')
  const translator = result.find(t => t.toolId === 'translator')
  assert.strictEqual(translator?.compatible, true)
  assert.strictEqual(isToolCompatible('translator', 'subtitles.en.srt'), true)
})

test('toolCompatibility - detects video files for trimmer', () => {
  const result = getCompatibleTools('recording.mp4')
  const trimmer = result.find(t => t.toolId === 'trimmer')
  assert.strictEqual(trimmer?.compatible, true)
})
