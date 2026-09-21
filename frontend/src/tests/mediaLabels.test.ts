import test from 'node:test'
import assert from 'node:assert'
import { describeSubtitleTrack, subtitleTrackLabel, runDisplayName } from '../lib/mediaLabels.ts'

test('mediaLabels - detects subtitle language without inventing a role', () => {
  assert.deepStrictEqual(describeSubtitleTrack('talk.ko.srt'), { language: 'Korean', role: null })
  assert.deepStrictEqual(describeSubtitleTrack('talk.en.srt'), { language: 'English', role: null })
  assert.deepStrictEqual(describeSubtitleTrack('notes.txt'), { language: null, role: null })
})

test('mediaLabels - claims translated/original only when the name says so', () => {
  assert.deepStrictEqual(describeSubtitleTrack('talk_translated.en.srt'), { language: 'English', role: 'translated' })
  assert.deepStrictEqual(describeSubtitleTrack('talk.orig.ko.srt'), { language: 'Korean', role: 'original' })
})

test('mediaLabels - subtitleTrackLabel falls back to filename with size', () => {
  assert.strictEqual(subtitleTrackLabel('talk.ko.srt', 45056), 'Korean · 44.0 KB')
  assert.strictEqual(subtitleTrackLabel('talk_translated.en.srt', 45056), 'English · translated · 44.0 KB')
  assert.strictEqual(subtitleTrackLabel('mystery.xyz', 100), 'mystery.xyz · 100 B')
})

test('mediaLabels - runDisplayName prefers human names over hashes', () => {
  assert.strictEqual(
    runDisplayName({ pipeline_name: 'My Pipe', bundle_name: 'Big Talk', pipeline_run_id: 'abc12345' }),
    'Big Talk',
  )
  assert.strictEqual(
    runDisplayName({ pipeline_name: 'My Pipe', pipeline_run_id: 'abc12345' }),
    'My Pipe',
  )
  assert.strictEqual(runDisplayName({ pipeline_name: 'abc12345', pipeline_run_id: 'abc12345' }), 'Run abc12345')
})
