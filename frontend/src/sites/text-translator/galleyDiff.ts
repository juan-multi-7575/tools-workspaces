export interface GalleyPair {
  index: number
  source: string
  translation: string
  changed: boolean
}

function sentences(text: string): string[] {
  return text.match(/[^.!?。！？]+(?:[.!?。！？]+|$)/gu)?.map((part) => part.trim()).filter(Boolean) ?? []
}

/** Pairs actual source/output sentences by order and marks only unequal pairs. */
export function pairGalleyText(source: string, translation: string): GalleyPair[] {
  const sourceLines = sentences(source)
  const translatedLines = sentences(translation)
  const count = Math.max(sourceLines.length, translatedLines.length)
  return Array.from({ length: count }, (_, index) => {
    const left = sourceLines[index] ?? ''
    const right = translatedLines[index] ?? ''
    return { index: index + 1, source: left, translation: right, changed: left !== right }
  })
}
