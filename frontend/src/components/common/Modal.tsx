import { useEffect, useRef, type ReactNode } from 'react'
import { trappedTabTarget } from '../../lib/modalFocus'

// Keyboard-focusable elements a browser would reach in DOM order. `disabled`
// controls and the dialog container itself (`tabindex="-1"`) are excluded so
// the trap only ever cycles real focus stops. Used both for the mount-time
// initial-focus placement and for the live Tab trap.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface ModalProps {
  /** id of the element (usually the dialog heading) that names the dialog. */
  labelledBy: string
  /** id of an element that describes the dialog, when one is apt. */
  describedBy?: string
  /** Called when the dialog requests to close (the Escape key). */
  onClose: () => void
  /** Extra overlay classes: padding and the decorative backdrop tint. */
  className?: string
  /** Classes for the panel box that carries the dialog role and visuals. */
  panelClassName?: string
  children: ReactNode
}

/**
 * Shared modal primitive for the app's centered dialog overlays. Supplies the
 * dialog semantics the reference overlay already carries — role="dialog",
 * aria-modal="true", aria-labelledby — plus the keyboard contract it was
 * missing: initial focus placement, a Tab focus trap, Escape to close, focus
 * restoration to the opening trigger on unmount, and a body scroll lock. The
 * full-viewport overlay is a decorative, non-focusable wrapper; the dialog role
 * lives on the panel so the background is muted by aria-modal.
 */
export default function Modal({
  labelledBy,
  describedBy,
  onClose,
  className,
  panelClassName,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)
  // Read the latest close handler without re-subscribing the key listener.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    // Remember the trigger so focus can be handed back when the dialog closes.
    prevFocusRef.current = document.activeElement as HTMLElement | null

    const panel = panelRef.current
    if (panel) {
      const stops = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.getAttribute('aria-hidden') !== 'true',
      )
      if (stops.length) stops[0].focus()
      else panel.focus()
    }

    // Lock background scroll for the lifetime of the dialog, then restore.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key === 'Tab' && panel) {
        const stops = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
          (el) => el.getAttribute('aria-hidden') !== 'true',
        )
        if (stops.length === 0) {
          e.preventDefault()
          return
        }
        const target = trappedTabTarget(stops, document.activeElement as HTMLElement | null, e.shiftKey)
        if (target) {
          e.preventDefault()
          target.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = prevOverflow
      prevFocusRef.current?.focus()
    }
  }, [])

  return (
    <div className={`fixed inset-0 z-modal flex items-center justify-center${className ? ` ${className}` : ''}`}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={panelClassName}
      >
        {children}
      </div>
    </div>
  )
}
