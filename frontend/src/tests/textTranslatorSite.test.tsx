import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { ToolManifest } from '../lib/api'
import { pairGalleyText } from '../sites/text-translator/galleyDiff'

const MANIFEST = JSON.parse(readFileSync(new URL('./fixtures/textTranslatorManifest.json', import.meta.url), 'utf8')) as ToolManifest

test('pairs source and translated sentences by order and marks only unequal real text', () => {
  assert.deepEqual(pairGalleyText('Same line. Hello world!', 'Same line. Hola mundo.'), [
    { index: 1, source: 'Same line.', translation: 'Same line.', changed: false },
    { index: 2, source: 'Hello world!', translation: 'Hola mundo.', changed: true },
  ])
  assert.deepEqual(pairGalleyText('One. Two.', 'Uno.'), [
    { index: 1, source: 'One.', translation: 'Uno.', changed: true },
    { index: 2, source: 'Two.', translation: '', changed: true },
  ])
})

test('hero provides the two entry actions and workspace exposes every manifest key', async () => {
  const [heroModule, workspaceModule] = await Promise.all([
    import('../sites/text-translator/TextTranslatorHero'),
    import('../sites/text-translator/TextTranslatorWorkspace'),
  ])
  const Hero = heroModule.TextTranslatorHero as (props: { manifest: ToolManifest }) => React.ReactNode
  const Workspace = workspaceModule.TextTranslatorWorkspace as (props: { manifest: ToolManifest }) => React.ReactNode
  const hero = renderToStaticMarkup(<MemoryRouter><Hero manifest={MANIFEST}/></MemoryRouter>)
  const workspace = renderToStaticMarkup(<MemoryRouter><Workspace manifest={MANIFEST}/></MemoryRouter>)
  assert.match(hero, /Open the galley/)
  assert.match(hero, /Choose a text file/)
  assert.equal((hero.match(/class="txt-action /g) ?? []).length, 2)
  for (const key of Object.keys(MANIFEST.parameters_schema)) assert.ok(workspace.includes(`data-param-key="${key}"`), `missing ${key}`)
  assert.match(workspace, /textarea id="txt-source-buffer"/)
  const siteSource = readFileSync(new URL('../sites/text-translator/TextTranslatorWorkspace.tsx', import.meta.url), 'utf8')
  assert.match(siteSource, /Upload edited source/)
  assert.match(siteSource, /Save key/)
  assert.doesNotMatch(`${hero}${workspace}`, /Tools Garage|ENGINE STATUS|Workspaces|Remote/)
})

test('manifest is file-first and the live proof reads both actual artifact paths', () => {
  assert.deepEqual(Object.keys(MANIFEST.parameters_schema), ['input_path', 'target_lang', 'source_lang', 'provider', 'model'])
  assert.equal('text' in MANIFEST.parameters_schema, false)
  const workspace = readFileSync(new URL('../sites/text-translator/TextTranslatorWorkspace.tsx', import.meta.url), 'utf8')
  assert.match(workspace, /api\.uploadFile\(file\)/)
  assert.match(workspace, /api\.getArtifactContent\(resultSource\)/)
  assert.match(workspace, /api\.getArtifactContent\(artifact\.path\)/)
  assert.match(workspace, /api\.getProviderModels\(provider, keyDraft \|\| undefined\)/)
  assert.match(workspace, /api\.saveKey\(provider, keyDraft\)/)
  assert.doesNotMatch(workspace, /api\.executeTool\([^\n]*text\s*:/)
})

test('provider options use detected providers and retain auto', () => {
  const workspace = readFileSync(new URL('../sites/text-translator/TextTranslatorWorkspace.tsx', import.meta.url), 'utf8')
  assert.match(workspace, /providers\.filter\(\(item\) => item\.id !== 'auto'\)\.map/)
  assert.match(workspace, /<option key=\{item\.id\} value=\{item\.id\}>\{item\.name\}<\/option>/)
  assert.doesNotMatch(workspace, /schema\.provider\?\.enum\s*\?\?/)
  assert.match(workspace, /api\.getDetectedModelProviders\(\)/)
  assert.match(workspace, /value="auto"/)
})

test('site registration is scoped to the text translator route and its own color system', () => {
  const site = readFileSync(new URL('../sites/text-translator/site.ts', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../sites/text-translator/text-translator.css', import.meta.url), 'utf8')
  assert.match(site, /toolId: 'text\.translate\.llm'/)
  assert.match(site, /path: 'text\.translate\.llm'/)
  assert.match(css, /Source\+Serif\+4/)
  assert.match(css, /Libre\+Franklin/)
  assert.match(css, /prefers-reduced-motion/)
})
