import test from 'node:test'
import assert from 'node:assert/strict'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import OcrmypdfHero from '../sites/ocrmypdf/OcrmypdfHero'
import OcrmypdfWorkspace from '../sites/ocrmypdf/OcrmypdfWorkspace'
import type { ToolManifest } from '../lib/api'

const MANIFEST: ToolManifest = {
  id: 'ocrmypdf', name: 'OCR Document Scanner (OCRmyPDF)',
  description: 'Apply Optical Character Recognition (OCR) to scanned PDFs and images to generate searchable text PDFs.',
  category: 'Documents', tags: ['document', 'pdf'], input_kinds: ['document'], output_kinds: ['document'],
  parameters_schema: { input_pdf: { type: 'string', title: 'Input PDF' } },
}

const render = (element: ReactNode) => renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>)

test('hero provides its two entry actions without application chrome', () => {
  const html = render(<OcrmypdfHero manifest={MANIFEST} />)
  assert.equal(html.match(/class="om-button/g)?.length, 2)
  assert.match(html, /Choose a PDF/)
  assert.match(html, /Open an empty workspace/)
  assert.doesNotMatch(html, /Tools Garage|Workspaces|Remote|ENGINE STATUS/)
})

test('workspace binds the declared PDF input, offers independently gated OCR and text actions', () => {
  const html = render(<OcrmypdfWorkspace manifest={MANIFEST} />)
  assert.match(html, /data-param-key="input_pdf"/)
  assert.match(html, /Run OCR/)
  assert.match(html, /Read text layer/)
  assert.match(html, /data-tool-gate-region="ocrmypdf"/)
  assert.match(html, /data-tool-gate-region="pdf_tools"/)
  assert.match(html, /All tools/)
  assert.doesNotMatch(html, /Tools Garage|Workspaces|Remote|ENGINE STATUS/)
})

test('every manifest key receives a bound control', () => {
  const html = render(<OcrmypdfWorkspace manifest={MANIFEST} />)
  for (const key of Object.keys(MANIFEST.parameters_schema)) assert.ok(html.includes(`data-param-key="${key}"`))
})
