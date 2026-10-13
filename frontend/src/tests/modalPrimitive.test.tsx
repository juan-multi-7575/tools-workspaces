import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { renderToStaticMarkup } from 'react-dom/server'
import Modal from '../components/common/Modal'
import { trappedTabTarget } from '../lib/modalFocus'
import ArtifactViewerModal from '../components/artifacts/ArtifactViewerModal'
import AudioPlayerModal from '../components/audio/AudioPlayerModal'
import VideoSubtitlePlayerModal from '../components/media/VideoSubtitlePlayerModal'
import RunDetailsModal from '../components/workspaces/RunDetailsModal'

const src = (rel: string) => readFile(new URL(`../${rel}`, import.meta.url), 'utf8')
const noClose = () => {}

// ── the focus-trap algorithm (pure, no DOM needed) ────────────────────────────

test('the trap only takes over Tab at the focus boundaries', () => {
  const fake = (id: string) => ({ id } as unknown as HTMLElement)
  const [first, mid, last] = [fake('a'), fake('b'), fake('c')]
  const stops = [first, mid, last]
  assert.equal(trappedTabTarget(stops, last, false), first, 'forward Tab on the last stop wraps to the first')
  assert.equal(trappedTabTarget(stops, first, true), last, 'shift+Tab on the first stop wraps to the last')
  assert.equal(trappedTabTarget(stops, mid, false), null, 'a mid-dialog Tab is left to the browser')
  assert.equal(trappedTabTarget(stops, mid, true), null, 'a mid-dialog shift+Tab is left to the browser')
  assert.equal(trappedTabTarget(stops, first, false), null, 'forward Tab from the top is not intercepted')
  assert.equal(trappedTabTarget(stops, last, true), null, 'shift+Tab from the bottom is not intercepted')
})

test('a dialog with no focusable stops has no trap target', () => {
  assert.equal(trappedTabTarget([], null, false), null)
  assert.equal(trappedTabTarget([], null, true), null)
})

// ── the primitive emits the dialog contract ───────────────────────────────────

test('the Modal primitive renders role=dialog + aria-modal + aria-labelledby on a decorative overlay', () => {
  const html = renderToStaticMarkup(
    <Modal labelledBy="demo-title" onClose={noClose} className="p-4 bg-black/30" panelClassName="panel">
      <h2 id="demo-title">Demo</h2>
      <button aria-label="Close">x</button>
    </Modal>,
  )
  assert.match(html, /role="dialog"/)
  assert.match(html, /aria-modal="true"/)
  assert.match(html, /aria-labelledby="demo-title"/)
  assert.match(html, /tabindex="-1"/, 'the panel must be programmatically focusable')
  assert.match(html, /fixed inset-0 z-modal/, 'the overlay carries the z-modal layer')
  assert.match(html, /class="panel"/, 'the panel className is preserved verbatim')
})

test('aria-describedby is emitted only when a description id is supplied', () => {
  const withDesc = renderToStaticMarkup(
    <Modal labelledBy="t" describedBy="d" onClose={noClose}>body</Modal>,
  )
  assert.match(withDesc, /aria-describedby="d"/)
  const without = renderToStaticMarkup(
    <Modal labelledBy="t" onClose={noClose}>body</Modal>,
  )
  assert.doesNotMatch(without, /aria-describedby/, 'no describedby is invented when none is apt')
})

test('the primitive wires Escape, the Tab trap, focus restore and the scroll lock', async () => {
  const source = await src('components/common/Modal.tsx')
  assert.match(source, /e\.key === 'Escape'/, 'Escape must close the dialog')
  assert.match(source, /e\.key === 'Tab'/, 'Tab drives the focus trap')
  assert.match(source, /trappedTabTarget/, 'the trap uses the tested boundary decision')
  assert.match(source, /stops\[0\]\.focus\(\)/, 'initial focus lands on the first real stop')
  assert.match(source, /document\.body\.style\.overflow/, 'background scroll is locked while open')
  assert.match(source, /prevFocusRef\.current\?\.focus\(\)/, 'focus returns to the opening trigger')
})

// ── each migrated modal renders as a labelled dialog with a named close ───────

test('ArtifactViewerModal renders as a labelled dialog with a named close button', () => {
  const html = renderToStaticMarkup(
    <ArtifactViewerModal name="clip.mp4" previewUrl="/preview" downloadUrl="/dl" size={2048} onClose={noClose} />,
  )
  assert.match(html, /role="dialog"/)
  assert.match(html, /aria-modal="true"/)
  assert.match(html, /aria-labelledby="artifact-viewer-title"/)
  assert.ok(html.includes('id="artifact-viewer-title"'), 'the heading the label points at must exist')
  assert.match(html, /aria-label="Close"/, 'the icon-only close button must be named')
})

test('AudioPlayerModal renders as a labelled dialog with a named close button', () => {
  const html = renderToStaticMarkup(
    <AudioPlayerModal media={{ name: 'song.mp3', path: '/a/song.mp3' }} onClose={noClose} />,
  )
  assert.match(html, /role="dialog"/)
  assert.match(html, /aria-modal="true"/)
  assert.match(html, /aria-labelledby="audio-player-title"/)
  assert.ok(html.includes('id="audio-player-title"'))
  assert.match(html, /aria-label="Close"/)
})

test('VideoSubtitlePlayerModal renders as a labelled dialog with a named close button', () => {
  const video = {
    name: 'movie.mp4', path: '/v/movie.mp4', size: 4096, mtime: 0,
    category: 'video', preview_url: '/pv', download_url: '/dl',
  }
  const html = renderToStaticMarkup(
    <VideoSubtitlePlayerModal workspaceId="w1" video={video} onClose={noClose} />,
  )
  assert.match(html, /role="dialog"/)
  assert.match(html, /aria-modal="true"/)
  assert.match(html, /aria-labelledby="video-subtitle-title"/)
  assert.ok(html.includes('id="video-subtitle-title"'))
  assert.match(html, /aria-label="Close"/)
})

test('RunDetailsModal renders as a labelled dialog with a named close button', () => {
  const html = renderToStaticMarkup(
    <RunDetailsModal workspaceId="w1" runId="run-1" onClose={noClose} />,
  )
  assert.match(html, /role="dialog"/)
  assert.match(html, /aria-modal="true"/)
  assert.match(html, /aria-labelledby="run-details-title"/)
  assert.ok(html.includes('id="run-details-title"'))
  assert.match(html, /aria-label="Close"/)
})

// ── migration + regression guards ─────────────────────────────────────────────

const MIGRATED = [
  'components/artifacts/ArtifactViewerModal.tsx',
  'components/audio/AudioPlayerModal.tsx',
  'components/media/VideoSubtitlePlayerModal.tsx',
  'components/workspaces/RunDetailsModal.tsx',
]

test('each migrated modal delegates its overlay to the shared primitive', async () => {
  for (const rel of MIGRATED) {
    const source = await src(rel)
    assert.match(source, /import Modal from '.*common\/Modal'/, `${rel} must import the shared primitive`)
    assert.match(source, /<Modal\b/, `${rel} must render <Modal>`)
    assert.doesNotMatch(source, /fixed inset-0 z-modal/, `${rel} must not render a raw z-modal overlay`)
  }
})

test('the trim studio overlay migrated onto the primitive with a named close', async () => {
  const source = await src('pages/WorkspaceDetailPage.tsx')
  assert.match(source, /labelledBy="trim-studio-title"/, 'the trim overlay must render through the primitive')
  assert.ok(source.includes('id="trim-studio-title"'), 'the trim heading the label points at must exist')
})

test('non-dialog dismiss buttons gain accessible names', async () => {
  const source = await src('pages/WorkspaceDetailPage.tsx')
  assert.match(source, /aria-label="Dismiss output banner"/, 'the output-banner dismiss button must be named')
})

// Every centered modal overlay the app still renders inline (the documented
// references) or through the primitive must carry the full dialog trio. A file
// that regresses on any one of role/aria-modal/aria-labelledby fails here.
test('every owned modal overlay carries role=dialog + aria-modal + aria-labelledby', async () => {
  const owned = [
    'components/common/Modal.tsx',
    'components/pipeline/UniversalPipelineRunModal.tsx',
    'pages/WorkspacesPage.tsx',
    'pages/WorkspaceDetailPage.tsx',
  ]
  for (const rel of owned) {
    const source = await src(rel)
    if (!source.includes('z-modal')) continue
    assert.match(source, /role="dialog"/, `${rel} renders a z-modal overlay without role="dialog"`)
    assert.match(source, /aria-modal="true"/, `${rel} renders a z-modal overlay without aria-modal`)
    assert.match(source, /aria-labelledby=/, `${rel} renders a z-modal overlay without aria-labelledby`)
  }
})
