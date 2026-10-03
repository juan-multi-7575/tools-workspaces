import assert from 'node:assert/strict'
import { test } from 'node:test'
import { api } from '../lib/api.ts'

const encoder = new TextEncoder()
function response(text: string) { return new Response(encoder.encode(text)) }
const payload = { nodes: [] }

test('premature SSE closure rejects rather than leaving nodes running', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => response('data: {"type":"node_started","node_id":"a"}\n\n')
  try { await assert.rejects(api.runPipelineStream('a', payload, () => {}), { code: 'STREAM_INTERRUPTED' }) }
  finally { globalThis.fetch = original }
})

test('SSE consumer failures propagate and reader is cancelled', async () => {
  const original = globalThis.fetch
  let cancelled = false
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(encoder.encode('data: {"type":"node_started"}\n\n')) },
    cancel() { cancelled = true },
  }))
  try {
    const work = api.runPipelineStream('a', payload, () => { throw new Error('consumer failure') })
    await assert.rejects(Promise.race([work, new Promise((_, reject) => setTimeout(() => reject(new Error('consumer swallowed')), 50))]), /consumer failure/)
    assert.equal(cancelled, true)
  } finally { globalThis.fetch = original }
})

test('HTTP errors preserve status and structured code', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({error: {code: 'RUN_NOT_FOUND', message: 'Run not found.'}}), {status: 404})
  try { await assert.rejects(api.listRuns('a'), {status: 404, code: 'RUN_NOT_FOUND', message: 'Run not found.'}) }
  finally { globalThis.fetch = original }
})

test('idle streams time out and clean up their reader', async () => {
  const original = globalThis.fetch
  let cancelled = false
  globalThis.fetch = async () => new Response(new ReadableStream({cancel() { cancelled = true }}))
  try {
    await assert.rejects(api.runPipelineStream('a', payload, () => {}, {idleTimeoutMs: 15}), {code: 'STREAM_STALLED'})
    assert.equal(cancelled, true)
  } finally { globalThis.fetch = original }
})

test('heartbeats reset idle timeout and multiline terminal event completes', async () => {
  const original = globalThis.fetch
  let timer: ReturnType<typeof setInterval>
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      let i = 0
      timer = setInterval(() => {
        controller.enqueue(encoder.encode(i++ < 4 ? ': heartbeat\r\n\r\n' : 'data: {"type":"pipeline_finished",\r\ndata: "status":"completed"}\r\n\r\n'))
        if (i > 4) { clearInterval(timer); controller.close() }
      }, 8)
    }, cancel() { clearInterval(timer) },
  }))
  const events: string[] = []
  try {
    await api.runPipelineStream('a', payload, event => events.push(event.type), {idleTimeoutMs: 25})
    assert.deepEqual(events, ['pipeline_finished'])
  } finally { globalThis.fetch = original }
})

test('caller abort interrupts reads even when fetch stream ignores the signal', async () => {
  const original = globalThis.fetch
  let cancelled = false
  globalThis.fetch = async () => new Response(new ReadableStream({cancel() { cancelled = true }}))
  const controller = new AbortController()
  try {
    const work = api.runPipelineStream('a', payload, () => {}, {signal: controller.signal})
    setTimeout(() => controller.abort(), 5)
    await assert.rejects(work, {name: 'AbortError'})
    assert.equal(cancelled, true)
  } finally { globalThis.fetch = original }
})

test('workspace reads forward AbortSignal and catalog consumers share one fetch', async () => {
  const original = globalThis.fetch
  const controller = new AbortController()
  let reads = 0
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.signal, controller.signal)
    return Response.json({runs: []})
  }
  try { await api.listRuns('a', controller.signal) } finally { globalThis.fetch = original }
  globalThis.fetch = async () => { reads++; return Response.json({tools: []}) }
  try {
    await Promise.all([api.listTools(), api.listTools(), api.listTools(controller.signal)])
    await api.listTools()
    assert.equal(reads, 1)
  } finally { globalThis.fetch = original }
})

test('network reader failures are actionable disconnect errors', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('network dropped')) } }))
  try { await assert.rejects(api.runPipelineStream('a', payload, () => {}), { code: 'STREAM_INTERRUPTED' }) }
  finally { globalThis.fetch = original }
})
