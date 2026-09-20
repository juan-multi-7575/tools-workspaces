import test from 'node:test'
import assert from 'node:assert'
import { downloadProgressStore, artifactsStore } from '../lib/activityStore.ts'

test('activityStore - progress store subscribes to specific download ID', () => {
  let callCount = 0
  const unsubscribe = downloadProgressStore.subscribe('task-123', () => {
    callCount++
  })

  downloadProgressStore.setProgress('task-123', { percent: 45, speed: '1.2MB/s', eta: '00:30' })
  assert.strictEqual(callCount, 1)
  assert.deepStrictEqual(downloadProgressStore.getProgress('task-123'), {
    percent: 45,
    speed: '1.2MB/s',
    eta: '00:30',
  })

  // Independent task should not trigger listener for task-123
  downloadProgressStore.setProgress('task-456', { percent: 10, speed: '500KB/s', eta: '01:00' })
  assert.strictEqual(callCount, 1)

  unsubscribe()
  downloadProgressStore.setProgress('task-123', { percent: 90 })
  assert.strictEqual(callCount, 1) // Did not fire after unsubscribe
})

test('activityStore - artifacts store caches data with SWR', () => {
  const mockArtifacts = [{ name: 'audio.mp3', path: 'downloads/audio.mp3', kind: 'audio', size: 1000, mtime: 12345 }]
  artifactsStore.setCached(mockArtifacts)
  assert.strictEqual(artifactsStore.isStale(), false)
  assert.deepStrictEqual(artifactsStore.getCached(), mockArtifacts)

  artifactsStore.invalidate()
  assert.strictEqual(artifactsStore.isStale(), true)
})
