import { useEffect } from 'react'

/**
 * Sets `document.title` for the mounted route.
 *
 * WCAG 2.4.2 needs every page to carry a title that identifies it; the static
 * `<title>Tools Garage</title>` in `index.html` only names the shell. Each
 * route calls this once with its own wording, so the browser tab, the history
 * list and a screen reader's window list all say where the user actually is.
 *
 * The value is re-applied whenever it changes, which is what makes a route
 * parameter (a tool id, a workspace id) able to drive the title.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title
  }, [title])
}

/** The one wording used when a route has nothing more specific to say. */
export const DEFAULT_DOCUMENT_TITLE = 'Tools Garage'
