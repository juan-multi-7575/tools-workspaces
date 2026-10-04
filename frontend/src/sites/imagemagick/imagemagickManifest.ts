import { useEffect, useState } from 'react'
import { api, errorMessage, type ToolManifest } from '../../lib/api'

export const IMAGEMAGICK_ID = 'imagemagick'

/** A `parameters_schema` entry, narrowed to what the four documented keys use. */
export interface FieldSpec {
  type?: string
  title?: string
  description?: string
  placeholder?: string
  enum?: (string | number)[]
  default?: unknown
}

/**
 * The tool owns its manifest; this reads it from the backend rather than
 * restating it, so a label or a default shown on the site is the same value
 * the backend will act on.
 */
export function useImageMagickManifest(): {
  manifest: ToolManifest | null
  error: string | null
} {
  const [manifest, setManifest] = useState<ToolManifest | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    api
      .getTool(IMAGEMAGICK_ID)
      .then((value) => {
        if (active) setManifest(value)
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause))
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [])

  return { manifest, error }
}

/**
 * Real ImageMagick `-resize` geometries. Each one is a value the backend passes
 * straight through to `magick -resize`, so none of them is a decorative label.
 */
export const GEOMETRY_PRESETS: { label: string; value: string }[] = [
  { label: '50%', value: '50%' },
  { label: '200%', value: '200%' },
  { label: '1200 wide', value: '1200x' },
  { label: '1200 tall', value: 'x1200' },
  { label: '800×600 fit', value: '800x600' },
  { label: '800×600 shrink', value: '800x600>' },
  { label: '800×600 cover', value: '800x600^' },
]

/**
 * What the geometry syntax actually means, so the string is not a black box.
 *
 * These descriptions were checked against a real run rather than recalled: a
 * 640x400 source sent through `-resize 240x160` came back 240x150. A geometry
 * without an operator is a *bound* the aspect ratio is fitted inside, not a pair
 * of target dimensions — only an explicit `!` overrides that, and this tool
 * exposes no flag to add one.
 */
export const GEOMETRY_KEY = [
  ['1200x', 'width 1200; height follows from the aspect ratio'],
  ['x1200', 'height 1200; width follows from the aspect ratio'],
  ['800x600', 'fit inside 800×600 — the result may be smaller than the box'],
  ['800x600>', 'the same fit, but only ever shrinks; a small image is left alone'],
  ['800x600^', 'scale to *cover* 800×600, so the box is filled'],
  ['50%', 'scale by this percentage of the original'],
]