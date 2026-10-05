/** Invalidates responses belonging to an earlier input/action run. */
export function createRunGeneration() {
  let current = 0
  return {
    start: () => ++current,
    invalidate: () => { current += 1 },
    isCurrent: (generation: number) => generation === current,
  }
}
