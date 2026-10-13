// Pure focus-trap logic for modal dialogs, kept free of React and the DOM so
// the trap algorithm is verifiable without a live browser. `Modal` owns the
// live wiring (listeners, focus placement); this owns only the boundary math.

/**
 * Given the ordered focus stops inside a dialog, the currently focused element
 * and whether Shift is held, return the element that must take focus to keep
 * Tab inside the dialog, or `null` to let the browser advance to the next stop.
 * Only the boundaries are owned by the trap; the browser handles every move
 * between them.
 */
export function trappedTabTarget(
  focusStops: HTMLElement[],
  active: HTMLElement | null,
  shiftKey: boolean,
): HTMLElement | null {
  if (focusStops.length === 0) return null
  const first = focusStops[0]
  const last = focusStops[focusStops.length - 1]
  if (shiftKey) return active === first ? last : null
  return active === last ? first : null
}
