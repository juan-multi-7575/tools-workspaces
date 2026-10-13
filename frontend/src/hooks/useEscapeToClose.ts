import { useEffect } from 'react'

/**
 * Closes whatever transient surface is open when the user presses Escape.
 *
 * WCAG 2.1.1 (keyboard) expects every surface that is opened by a click to be
 * dismissible by keyboard too; the shell's delete confirmations already do
 * this, so the overlays that missed it (activity drawer, artifacts dock,
 * workspace switcher) share this one registration instead of repeating it.
 *
 * The listener is only attached while `active` is true, and it is removed on
 * cleanup, so a closed surface never swallows an Escape meant for whatever is
 * focused inside the page.
 */
export function useEscapeToClose(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return
    const handleKeyDown = (event: KeyboardEvent) => {
      // `key` is the modern spelling; `keyCode` is the one older browsers and
      // some synthetic keyboard events still use.
      if (event.key === 'Escape' || event.key === 'Esc' || event.keyCode === 27) {
        onEscape()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [active, onEscape])
}
