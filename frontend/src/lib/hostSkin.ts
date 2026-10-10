import { useEffect, useState, type RefObject } from 'react'

export type Tone = 'light' | 'dark'

export interface HostSkin {
  tone: Tone
  /**
   * A colour that reads on the board the form landed on. Normally the host's
   * own ink, so the form is literally the host's; a computed neutral only when
   * the host's ink does not hold up on that board.
   */
  ink: string
  /**
   * What to write on a fill of the accent. There is no single answer: an amber
   * accent wants near-black on it, an emerald one wants near-white, and a host
   * is free to pass either. Measured against the accent rather than assumed, so
   * an override cannot make a selected chip unreadable.
   */
  onAccent: string
}

/* The ink to fall back on when the host's own colour cannot be read against the
 * board it is sitting on: the shell's espresso on a light board, a warm
 * off-white on a dark one. Both clear 4.5:1 against their own tone. */
const FALLBACK_INK: Record<Tone, string> = { light: '#4E220F', dark: '#EDE7DE' }
const DARK_ON_ACCENT = '#140E08'
const LIGHT_ON_ACCENT = '#FDFBF7'

/* The WCAG relative-luminance curve, so the decisions below are the same ones a
 * contrast check makes rather than an eyeballed brightness. */
const channel = (value: number) => {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const luminance = (r: number, g: number, b: number) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

type Rgba = [number, number, number, number]

const contrast = (fg: Rgba, bg: Rgba) => {
  const a = luminance(fg[0], fg[1], fg[2])
  const b = luminance(bg[0], bg[1], bg[2])
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * The palette of the board a shared tool form has been dropped into.
 *
 * `.dep-gate` borrows `currentColor` and trusts each host page to have picked
 * an ink that reads where it put the gate. A shared form cannot lean on that:
 * it is mounted inside boards whose colour is inherited from the page shell
 * while the board itself is near-black, so ambient `currentColor` is not always
 * readable where the form lands. Reading the backdrop answers the question CSS
 * cannot -- what is actually *behind* these controls -- and is what lets the
 * forms be correct on any host without every host having to declare a tone.
 *
 * Starts at the cream shell's own values, which is what a form server-rendered
 * outside the app should look like, and re-reads after every render because the
 * board underneath a form can change under it.
 */
export function useHostSkin(ref: RefObject<HTMLElement | null>): HostSkin {
  const [skin, setSkin] = useState<HostSkin>({
    tone: 'light',
    ink: FALLBACK_INK.light,
    onAccent: LIGHT_ON_ACCENT,
  })

  /* This runs after every render, so it must be a no-op when nothing moved.
   * A fresh object here would be a new state value every time and spin the
   * form in a render loop. */
  const apply = (next: HostSkin) =>
    setSkin((prev) =>
      prev.tone === next.tone && prev.ink === next.ink && prev.onAccent === next.onAccent
        ? prev
        : next,
    )

  useEffect(() => {
    // A 1x1 canvas parses any CSS colour the engine understands -- rgb(),
    // oklch(), color-mix() -- so there is no colour-string parser here to keep in
    // sync with whatever a host page writes.
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    const parse = (css: string): Rgba | null => {
      if (!ctx) return null
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return [r, g, b, a / 255]
    }

    const element = ref.current
    if (!element) return

    /* Whichever of the two inks reads better on the accent actually in force --
       the host's if it set `--tool-accent`, the shell's caramel if it did not. */
    const onAccentOf = (el: HTMLElement) => {
      const fill = parse(getComputedStyle(el).getPropertyValue('--tool-accent'))
      if (!fill) return undefined
      return contrast(parse(DARK_ON_ACCENT)!, fill) >= contrast(parse(LIGHT_ON_ACCENT)!, fill)
        ? DARK_ON_ACCENT
        : LIGHT_ON_ACCENT
    }

    // Walk up for the nearest backdrop that actually paints. Anything
    // translucent is skipped: what shows through it is further up, and reading
    // a half-transparent layer is how a form ends up unreadable on a stack.
    let board: Rgba | null = null
    for (let node = element.parentElement; node; node = node.parentElement) {
      const px = parse(getComputedStyle(node).backgroundColor)
      if (px && px[3] >= 0.5) {
        board = px
        break
      }
    }
    if (!board) {
      apply({ tone: 'light', ink: FALLBACK_INK.light, onAccent: onAccentOf(element) ?? LIGHT_ON_ACCENT })
      return
    }

    const tone: Tone = luminance(board[0], board[1], board[2]) > 0.25 ? 'light' : 'dark'
    // Read the ink from the board, not from the form root: `.tool-form` has
    // already coloured the root by now, so the root's own colour is this
    // hook's previous answer rather than the host's.
    const carrier = element.parentElement ?? element
    const carrierStyle = getComputedStyle(carrier)
    const inherited = parse(carrierStyle.color)
    const hostInk = inherited && contrast(inherited, board) >= 4.5 ? carrierStyle.color : undefined

    apply({
      tone,
      ink: hostInk ?? FALLBACK_INK[tone],
      onAccent: onAccentOf(element) ?? LIGHT_ON_ACCENT,
    })
  })

  return skin
}