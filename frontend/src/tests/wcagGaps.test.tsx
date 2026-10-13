import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import AppShell from '../sites/AppShell'
import { DEFAULT_DOCUMENT_TITLE } from '../hooks/useDocumentTitle'
import { isEscapeKey } from '../hooks/useEscapeToClose'
import RequiredFieldError from '../components/common/RequiredFieldError'
import WorkspaceSwitcherDropdown from '../components/workspaces/WorkspaceSwitcherDropdown'
import { ActivityProvider } from '../components/activity/ActivityContext'
import ActivitySidebar from '../components/activity/ActivitySidebar'
import { ToolForm } from '../lib/toolForms'
import {
  isRequiredKey,
  isRequiredValueMissing,
  missingRequiredFields,
  missingRequiredMessage,
} from '../lib/requiredFields'

const src = (rel: string) => readFile(new URL(`../${rel}`, import.meta.url), 'utf8')
const srcDir = (dir: string) => new URL(`../${dir}/`, import.meta.url)
const noop = () => {}

/**
 * Every site's registered `title`, read off disk.
 *
 * The browser discovers the sites with `import.meta.glob` in `siteModules.ts`,
 * a Vite transform that cannot run under `node:test`, so the titles are read
 * from each `site.ts` the same way `siteParity.ts` reads the tool ids. The
 * registration is what the route feeds to `useDocumentTitle`, so this is the
 * wording the window would actually carry.
 */
async function siteTitlesOnDisk(): Promise<Record<string, string>> {
  const titles: Record<string, string> = {}
  for (const entry of await readdir(srcDir('sites'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    let source: string
    try {
      source = await src(`sites/${entry.name}/site.ts`)
    } catch {
      continue // a directory without site.ts is not a site
    }
    const toolId = source.match(/toolId:\s*'([^']+)'/)?.[1]
    const title = source.match(/title:\s*'([^']+)'/)?.[1]
    if (!toolId || !title) continue
    titles[toolId] = title
  }
  return titles
}

/** Every source file under a directory tree, as paths relative to `src/`. */
async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(srcDir(dir), { withFileTypes: true })
  const found: string[] = []
  for (const entry of entries) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name
    if (entry.isDirectory()) found.push(...(await sourceFiles(rel)))
    else if (/\.tsx?$/.test(entry.name)) found.push(rel)
  }
  return found
}

// ── WCAG relative luminance, so the token is checked against the surfaces it
// ── is actually used on rather than against a hand-copied ratio ─────────────
const channels = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16))
const luminance = (hex: string) => {
  const [r, g, b] = channels(hex)
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
/** A custom property's declared value, read straight out of a stylesheet. */
function token(sheet: string, name: string): string {
  const match = sheet.match(new RegExp(`--${name}:\\s*([^;]+);`))
  assert.ok(match, `index.css must declare --${name}`)
  return match[1].trim()
}

// ─── gap 1 · placeholder ink ─────────────────────────────────────────────────

test('the placeholder token clears 4.5:1 on every cream surface it is used on', async () => {
  const css = await src('index.css')
  const placeholder = token(css, 'color-placeholder')
  // The colour itself, not an alpha: any alpha over a cream surface is what
  // took the old 60% caramel to 2.59:1.
  assert.match(placeholder, /^#[0-9A-Fa-f]{6}$/, `--color-placeholder must be an opaque hex, got ${placeholder}`)
  const surfaces = ['color-brand-cream', 'color-brand-cream-dark', 'color-surface-white']
  for (const surface of surfaces) {
    const ratio = contrast(placeholder, token(css, surface))
    assert.ok(
      ratio >= 4.5,
      `--color-placeholder (${placeholder}) is ${ratio.toFixed(2)}:1 on --${surface}`,
    )
  }
})

test('the audit\'s measured ratio is reproduced, and the token clears what it missed', async () => {
  const css = await src('index.css')
  // Proof the ratio this guard computes is the one the audit measured: the
  // caramel at 60% alpha over cream, re-derived here, is the 2.59:1 the issue
  // reported. If this arithmetic drifts, the guard above is not measuring what
  // it claims to measure.
  const caramel = token(css, 'color-brand-caramel-text')
  const cream = token(css, 'color-brand-cream')
  const mixed = channels(caramel)
    .map((v, i) => Math.round(v * 0.6 + channels(cream)[i] * 0.4))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
  assert.ok(Math.abs(contrast(`#${mixed}`, cream) - 2.59) < 0.01)
  assert.ok(contrast(token(css, 'color-placeholder'), cream) > 4.5, 'the replacement must clear the bar the old value missed')
})

/**
 * The cream-shell placeholder inputs the audit measured a ratio for. The
 * token-level fix is only real if the inputs actually point at the token, so
 * these are named rather than discovered.
 */
const CREAM_PLACEHOLDER_SITES = [
  'pages/ToolsPage.tsx', // catalog search
  'components/activity/ActivitySidebar.tsx', // the drawer's filter box
  'components/workspaces/WorkspaceSwitcherDropdown.tsx', // the switcher's quick search
  'pages/tools/SummarizerPage.tsx', // the summarizer's text area
]

test('no placeholder site reaches for the caramel at an alpha again', async () => {
  // The measured regression was the caramel text colour under an opacity, not
  // a colour swap, so an alpha is what has to stay gone.
  for (const rel of await sourceFiles('')) {
    const source = await src(rel)
    const alpha = source.match(/placeholder:?brand-caramel(?:-text)?\/\d+/)
    assert.equal(alpha?.[0], undefined, `${rel} must point at --color-placeholder instead of an alpha utility`)
  }
})

test('every cream-shell placeholder input points at the placeholder token', async () => {
  for (const rel of CREAM_PLACEHOLDER_SITES) {
    const source = await src(rel)
    // Either spelling of the same token: the bare utility or the `text-` one.
    assert.match(source, /(?:placeholder-placeholder|placeholder:text-placeholder)\b/, `${rel} must use --color-placeholder`)
    assert.doesNotMatch(source, /placeholder:?brand-caramel(?:-text)?/, `${rel} must not carry its own caramel placeholder colour`)
  }
})

test('the tool form reads its placeholder ink from the same token', async () => {
  const css = await src('index.css')
  assert.match(css, /--tool-ink-placeholder:\s*var\(--color-placeholder\)/)
  assert.match(css, /\.tool-well::placeholder\s*\{[^}]*color:\s*var\(--tool-ink-placeholder\)/)
})

// ─── gap 3 · skip to content ─────────────────────────────────────────────────

test('the shell opens with a skip link that names the <main> it targets', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <AppShell />
    </MemoryRouter>,
  )
  // An `<a href>` is focusable by default, so it is the first tab stop, and it
  // is the shell's first child — nothing sits in front of it.
  assert.match(
    html,
    /^<div[^>]*><a href="#main-content" class="skip-link">Skip to main content<\/a>/,
    'the skip link must be the shell container\'s first focusable element',
  )
  // `tabindex="-1"` is what lets the browser move focus onto the jump target.
  assert.match(html, /<main id="main-content" tabindex="-1"/, 'the jump target must be the <main> and must be programmatically focusable')
})

test('the skip link stays off-screen until it takes focus', async () => {
  const css = await src('index.css')
  const rule = css.slice(css.indexOf('.skip-link {'))
  assert.match(rule, /position:\s*fixed/, 'the link is lifted over the page rather than pushing it down')
  assert.match(rule, /z-index:\s*var\(--z-modal\)/, 'it must sit above every overlay it jumps past')
  assert.match(rule, /transform:\s*translateY\(-120%\)/, 'it is parked out of view for pointer users')
  assert.match(css, /\.skip-link:focus-visible\s*\{[^}]*transform:\s*translateY\(0\)/, 'focus brings it back into view')
})

// ─── gaps 4 + 5 + 6 · Escape and overlay semantics ───────────────────────────

test('a transient surface closes on Escape and on nothing else', () => {
  for (const key of ['Escape', 'Esc']) {
    assert.equal(isEscapeKey({ key }), true, `${key} closes the surface`)
    assert.equal(isEscapeKey({ key, keyCode: 0 }), true)
  }
  // Some synthetic keyboard events only carry the legacy code.
  assert.equal(isEscapeKey({ keyCode: 27 }), true, 'the legacy keyCode still closes')
  for (const key of ['a', 'Enter', ' ', 'Tab', 'Delete', 'Backspace', 'escape']) {
    assert.equal(isEscapeKey({ key }), false, `"${key}" must not close the surface`)
    assert.equal(isEscapeKey({ key, keyCode: 27 }), true, 'a real code outranks a wrong key name')
  }
})

const ESCAPE_SURFACES = [
  {
    rel: 'components/activity/ActivitySidebar.tsx',
    open: /useEscapeToClose\(open, \(\) => setOpen\(false\)\)/,
    why: 'the activity & records drawer',
  },
  {
    rel: 'components/studio/BottomArtifactsDock.tsx',
    open: /useEscapeToClose\(dockExpanded, onToggleExpand\)/,
    why: 'the artifacts dock',
  },
  {
    rel: 'components/workspaces/WorkspaceSwitcherDropdown.tsx',
    open: /useEscapeToClose\(open, \(\) => setOpen\(false\)\)/,
    why: 'the workspace switcher',
  },
]

test('every click-dismissed surface is also keyboard-dismissed through the one hook', async () => {
  for (const surface of ESCAPE_SURFACES) {
    const source = await src(surface.rel)
    assert.match(source, /import \{ useEscapeToClose \} from ['"][^'"]*hooks\/useEscapeToClose['"]/, `${surface.why} must use the shared hook`)
    assert.match(source, surface.open, `${surface.why} must close on Escape while it is open`)
  }
})

test('the activity drawer is a labelled modal dialog with a named close', async () => {
  const source = await src('components/activity/ActivitySidebar.tsx')
  assert.match(source, /role="dialog"/)
  assert.match(source, /aria-modal="true"/)
  assert.match(source, /aria-labelledby="activity-drawer-title"/)
  assert.ok(source.includes('id="activity-drawer-title"'), 'the heading the label points at must exist')
  // The full-viewport scrim is decoration, so it must not be a tab stop.
  assert.match(source, /<div className="absolute inset-0" onClick=\{\(\) => setOpen\(false\)\} aria-hidden="true" \/>/)
  assert.match(source, /aria-label="Close activity panel"/, 'the icon-only close button must be named')
})

test('the activity trigger announces the dialog it opens', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <ActivityProvider>
        <ActivitySidebar onOpenAudioPlayer={noop} />
      </ActivityProvider>
    </MemoryRouter>,
  )
  assert.match(html, /aria-haspopup="dialog"/)
  assert.match(html, /aria-expanded="false"/)
})

test('the workspace switcher trigger announces its menu and names the panel it opens', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <WorkspaceSwitcherDropdown />
    </MemoryRouter>,
  )
  assert.match(html, /aria-haspopup="menu"/)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /aria-controls="workspace-switcher-panel"/)
})

test('the workspace switcher panel is a menu of menuitems', async () => {
  const source = await src('components/workspaces/WorkspaceSwitcherDropdown.tsx')
  const panel = source.slice(source.indexOf('id="workspace-switcher-panel"'))
  assert.match(panel, /<div role="menu" aria-label="Workspace sessions"/)
  assert.match(panel, /role="menuitem"/, 'each workspace row must be a menu item')
})

test('the artifacts dock is a disclosure, not a modal dialog it does not have', async () => {
  // The dock collapses over the workbench without covering it, so a dialog
  // role would mute a page that is still usable. It carries the disclosure
  // contract instead — the naming of the panel plus the expanded state — and
  // it closes on Escape like the drawer beside it.
  const source = await src('components/studio/BottomArtifactsDock.tsx')
  assert.match(source, /aria-expanded=\{dockExpanded\}/)
  assert.match(source, /aria-controls=\{dockExpanded \? 'artifacts-dock-body' : undefined\}/)
  assert.ok(source.includes('id="artifacts-dock-body"'), 'the body the toggle points at must exist')
})

// ─── gap 2 · 24px minimum touch targets ──────────────────────────────────────

test('every audited control reaches the 24px WCAG 2.5.8 minimum', async () => {
  const dock = await src('components/studio/BottomArtifactsDock.tsx')
  const detail = await src('pages/WorkspaceDetailPage.tsx')
  const canvas = await src('components/pipeline/CanvasRenderers.tsx')
  const edges = canvas.slice(canvas.indexOf('function DeletableEdge'), canvas.indexOf('function ToolNode'))
  const nodes = canvas.slice(canvas.indexOf('function ToolNode'))

  // Icon + `text-xs` label is a 16px row, so `py-1` reaches 24px; `-my-1`
  // returns the padding to the header so the dock does not grow.
  assert.match(dock, /gap-1\.5 py-1 -my-1 text-xs font-bold text-brand-espresso hover:text-brand-caramel/)
  // 12px icon + `p-1.5` is 24px; `-m-0.5` keeps the original 20px footprint.
  assert.match(dock, /className="p-1\.5 -m-0\.5 rounded-lg border border-brand-sage\/60 bg-surface-white/)
  // The reconnect row is `text-xs`, so it needs vertical padding to reach 24px
  // without growing the status row.
  assert.match(detail, /className="font-bold text-brand-caramel px-1\.5 -mx-1\.5 py-1 -my-1"/)
  // The two canvas circles sit on a dense surface, so they are 24px outright.
  for (const [rel, region] of [['edge disconnect', edges], ['node delete', nodes]] as const) {
    assert.match(region, /flex size-6 items-center justify-center rounded-full/, `${rel} must be 24px, not the 20px circle it used to be`)
    assert.doesNotMatch(region, /flex size-5 items-center/, `${rel} must not fall back to a 20px circle`)
  }
})

// ─── gap 7 · the QR code's accessible name ───────────────────────────────────

test('the QR code carries the accessible name the library honours', () => {
  const label = 'QR code for the remote client at http://localhost:8000/remote'
  const html = renderToStaticMarkup(
    <QRCodeSVG value="http://localhost:8000/remote" size={140} title={label} role="img" aria-label={label} />,
  )
  assert.match(html, /role="img"/)
  assert.match(html, /aria-label="QR code for the remote client at http:\/\/localhost:8000\/remote"/)
  // `title` is what the library turns into the <title> child of the <svg>.
  assert.match(html, /<svg[^>]*><title>QR code for the remote client at http:\/\/localhost:8000\/remote<\/title>/)
})

test('the remote page names its own QR code with the connection URL', async () => {
  const source = await src('pages/RemoteControlPage.tsx')
  assert.match(source, /<QRCodeSVG/)
  assert.match(source, /title=\{`QR code for the remote client at \$\{connectUrl\}`\}/)
  assert.match(source, /role="img"/)
  assert.match(source, /aria-label=\{`QR code for the remote client at \$\{connectUrl\}`\}/)
})

// ─── gap 8 · per-route document title ────────────────────────────────────────

test('every registered site declares its own document title', async () => {
  const titles = await siteTitlesOnDisk()
  const entries = Object.entries(titles)
  assert.ok(entries.length >= 21, `expected every tool site to be registered, found ${entries.length}`)
  const seen = new Set<string>()
  for (const [toolId, title] of entries) {
    assert.ok(title.trim().length > 0, `${toolId} declares no document title`)
    assert.ok(!seen.has(title), `${toolId} shares the title "${title}" with another site`)
    seen.add(title)
  }
})

test('the tool route titles itself from the registration, not from the static <title>', async () => {
  const source = await src('sites/App.tsx')
  assert.match(source, /useDocumentTitle\(SITE_TITLES\[toolId\] \?\? DEFAULT_DOCUMENT_TITLE\)/, 'a tool route must set its title the moment the route matches')
  assert.equal(DEFAULT_DOCUMENT_TITLE, 'Tools Garage')
  const shell = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
  assert.match(shell, /<title>Tools Garage<\/title>/, 'the fallback and the static shell title must agree')
})

test('the hook writes document.title', async () => {
  const source = await src('hooks/useDocumentTitle.ts')
  assert.match(source, /document\.title = title/)
  assert.match(source, /\}, \[title\]\)/, 'a route parameter driving the title must re-apply it')
})

test('every shell route names itself', async () => {
  // The regexp-meta characters of a quoted literal, escaped; a RegExp entry is
  // used exactly as written, because some routes build their title from a
  // manifest field rather than from a fixed string.
  const escaped = (literal: string) => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const routes: [string, string | RegExp][] = [
    ['pages/ToolsPage.tsx', 'Tools Garage — tool catalog'],
    ['pages/ToolPageRouter.tsx', /Tools Garage — \$\{manifest\.name\}/],
    ['pages/WorkspacesPage.tsx', 'Tools Garage — workspaces'],
    ['pages/WorkspaceDetailPage.tsx', 'Tools Garage — workspace pipeline'],
    ['pages/SettingsPage.tsx', 'Tools Garage — settings'],
    ['pages/RemoteControlPage.tsx', 'Tools Garage — remote control'],
    ['components/deps/DependencyManagerPanel.tsx', 'Tools Garage — dependencies'],
    ['sites/home/HomeSite.tsx', 'Tools Garage — tool index'],
  ]
  for (const [rel, title] of routes) {
    const source = await src(rel)
    const pattern =
      typeof title === 'string'
        ? new RegExp(`useDocumentTitle\\((['"])${escaped(title)}\\1\\)`)
        : title
    assert.match(source, pattern, `${rel} must set its own document.title`)
  }
})

// ─── the partially-fixed item · a client-side required-field gate ─────────────

test('a required parameter is decided by the schema and by the backend list', () => {
  assert.equal(isRequiredKey('media.download.yt-dlp', 'url'), true, 'the backend rejects an empty url')
  assert.equal(isRequiredKey('downloader', 'url'), true, 'the legacy alias resolves to the same tool')
  assert.equal(isRequiredKey('sox', 'input_path'), true, 'the rack input path is rejected when empty')
  assert.equal(isRequiredKey('media.download.yt-dlp', 'format'), false, 'nothing is inferred from a key name')
  assert.equal(isRequiredKey('unknown.tool', 'url'), false, 'a tool with no known required params gates nothing')
  const declared = { type: 'string', required: true }
  assert.equal(isRequiredKey('unknown.tool', 'anything', declared), true, 'the manifest\'s own flag wins')
});

test('only a real value satisfies a required field', () => {
  assert.equal(isRequiredValueMissing(undefined), true)
  assert.equal(isRequiredValueMissing(null), true)
  assert.equal(isRequiredValueMissing(''), true)
  assert.equal(isRequiredValueMissing('   '), true)
  assert.equal(isRequiredValueMissing('/tmp/a.wav'), false)
  assert.equal(isRequiredValueMissing(0), false, 'a number is a value even when it is zero')
})

test('an empty required parameter is reported by label, in one sentence', () => {
  const schema = {
    input_path: { type: 'string', title: 'Input path' },
    url: { type: 'string', title: 'Target URL' },
    format: { type: 'string', title: 'Format' },
  }
  assert.deepEqual(
    missingRequiredFields(schema, { input_path: 'a.wav', url: '  ' }, 'media.download.yt-dlp'),
    [{ key: 'url', label: 'Target URL' }],
  )
  assert.equal(
    missingRequiredMessage(missingRequiredFields(schema, {}, 'media.download.yt-dlp')),
    'Target URL is required before this tool can run.',
  )
  assert.equal(
    missingRequiredMessage(missingRequiredFields(schema, {}, 'sox')),
    'Input path is required before this tool can run.',
  )
  assert.equal(missingRequiredMessage([]), '', 'nothing missing says nothing')
})

test('a schema-declared required field renders as required on the control itself', () => {
  const html = renderToStaticMarkup(
    <ToolForm
      toolId="unknown.tool"
      schema={{ input_path: { type: 'string', title: 'Input path', required: true } }}
      value={{}}
      onChange={noop}
    />,
  )
  assert.match(html, /<input type="text" required="" aria-required="true"/, 'the control carries both the native and the ARIA spelling')
  // A field nobody has been in yet stays quiet: an unvisited form must not
  // shout at someone who has not typed anything.
  assert.doesNotMatch(html, /aria-invalid/, 'a touched-else error is not announced on mount')
})

test('the announced half of the gate is a live region wired to its field', () => {
  const html = renderToStaticMarkup(
    <RequiredFieldError id="demo-required" message="Input path is required before this tool can run." />,
  )
  assert.match(html, /role="alert"/, 'the message is announced the moment it appears')
  assert.match(html, /id="demo-required"/, 'the id is what the control\'s aria-describedby points at')
})

test('the shared form wires aria-invalid and aria-describedby onto the faulted field', async () => {
  const source = await src('components/common/DynamicForm.tsx')
  assert.match(source, /'aria-invalid': invalid \|\| undefined/)
  assert.match(source, /'aria-describedby': invalid \? requiredErrorIdValue : undefined/)
  assert.match(source, /requiredState\(key, field\)/, 'one gate for every control in the card')
  assert.match(source, /invalid && \([\s\S]*RequiredFieldError/, 'the announced half follows the same gate')
  assert.match(source, /const \[touchedRequired, setTouchedRequired\] = useState/, 'the error only fires once the field has been left')
})

test('a hand-rolled required field uses the same announced wording as the shared form', async () => {
  const downloader = await src('pages/tools/DownloaderPage.tsx')
  assert.match(downloader, /aria-required="true"/)
  assert.match(downloader, /aria-invalid=\{urlInvalid \|\| undefined\}/)
  assert.match(downloader, /aria-describedby=\{urlInvalid \? urlErrorId : undefined\}/)
  assert.match(downloader, /<RequiredFieldError[\s\S]*id=\{urlErrorId\}/)
  assert.match(downloader, /^\s+required$/m, 'the native attribute rides the same input')

  const sox = await src('pages/tools/SoxPage.tsx')
  assert.match(sox, /isRequiredKey\('sox', 'input_path'\)/)
  assert.match(sox, /aria-invalid=\{inputInvalid \|\| undefined\}/)
  assert.match(sox, /aria-describedby=\{inputInvalid \? inputErrorId : undefined\}/)
  assert.match(sox, /message=\{missingRequiredMessage\(\[\{ key: 'input_path', label: 'input_path' \}\]\)\}/)
})

// ─── reuse of the issue-#2 modal primitive ───────────────────────────────────

test('an overlay added by this issue carries the dialog contract the primitive owns', async () => {
  // The activity drawer is a slide-over, not a centered modal, so it does not
  // take the primitive's layout — but it owes the same trio rather than
  // re-inventing a weaker version of it.
  const source = await src('components/activity/ActivitySidebar.tsx')
  const overlay = source.slice(
    source.indexOf('fixed inset-0 z-modal'),
    source.indexOf('aria-labelledby="activity-drawer-title"'),
  )
  assert.match(overlay, /fixed inset-0 z-modal flex justify-end/, 'the overlay is a slide-over, so it parks right rather than centring')
  assert.doesNotMatch(overlay, /items-center justify-center/, "a slide-over is not the primitive's centered layout")
  assert.match(source, /role="dialog"/)
  assert.match(source, /aria-modal="true"/)
  assert.match(source, /aria-labelledby=/)
})