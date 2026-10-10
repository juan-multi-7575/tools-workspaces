import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { PandocHero, PandocWork } from '../sites/pandoc/PandocSite'
import type { ToolManifest } from '../lib/api'
const manifest: ToolManifest = { id:'pandoc', name:'Universal Document Converter', description:'Convert documents.', input_kinds:['document'], output_kinds:['document'], parameters_schema:{ input_path:{type:'string',title:'Input Document File',default:''},to:{type:'string',title:'Target Format',enum:['html','markdown','plain'],default:'html'} } }
test('Pandoc hero offers its two entry actions without platform chrome',()=>{const html=renderToStaticMarkup(<MemoryRouter><PandocHero manifest={manifest}/></MemoryRouter>);assert.match(html,/Choose a document/);assert.match(html,/Open an empty workspace/);assert.doesNotMatch(html,/Tools Garage|Workspaces|Remote|ENGINE STATUS/)})
test('Pandoc workspace binds every manifest key and sandboxes HTML output',async()=>{const html=renderToStaticMarkup(<MemoryRouter><PandocWork manifest={manifest}/></MemoryRouter>);for(const key of Object.keys(manifest.parameters_schema))assert.ok(html.includes(`data-param-key="${key}"`));const source=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../sites/pandoc/PandocSite.tsx',import.meta.url),'utf8'));assert.match(source,/<iframe[^>]+sandbox=""/);assert.doesNotMatch(source,/dangerouslySetInnerHTML/);assert.match(html,/All tools/);assert.doesNotMatch(html,/Tools Garage|Workspaces|Remote|ENGINE STATUS/)})
