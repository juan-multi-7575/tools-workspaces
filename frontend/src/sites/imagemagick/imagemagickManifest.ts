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
 * The one geometry string this site's own copy leans on, and what it really
 * produces. Checked against a real run of this backend, not recalled: a 640x400
 * PNG sent through `240x160` came back 240x150, because a geometry with no
 * operator is a box the image is fitted inside, not a pair of target sizes.
 */
export const GEOMETRY_EXAMPLE = { geometry: '240x160', from: '640x400', to: '240x150' } as const

/**
 * What each geometry operator does, so the string is not a black box.
 *
 * Every line was read off a real run of this backend against a 640x400 PNG:
 * `800x600` came back 800x500 (it scales up as well as down), `800x600>` left
 * the source alone, `800x600^` came back 960x600 rather than exactly 800x600,
 * and `800x600!` came back 800x600 with the ratio dropped. Phrased short
 * enough to sit on one line of the rail's key.
 */
export const GEOMETRY_KEY = [
  ['1200x', 'width 1200, height follows'],
  ['x1200', 'height 1200, width follows'],
  ['800x600', 'fit inside, up or down'],
  ['800x600>', 'the same fit, never enlarges'],
  ['800x600^', 'cover 800x600, may be larger'],
  ['800x600!', 'exact size, ratio dropped'],
  ['50%', 'scale by this percentage'],
]
