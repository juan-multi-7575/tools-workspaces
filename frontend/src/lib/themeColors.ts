/** Canvas drawing APIs require a concrete color, while SVG/CSS accept var(). */
export function themeColor(token: string): string {
  if (typeof document === 'undefined') return 'currentColor'
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${token}`).trim() || 'currentColor'
}
