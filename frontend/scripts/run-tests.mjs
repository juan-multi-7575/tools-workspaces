import { register } from 'node:module'
import { readdir } from 'node:fs/promises'

// Keep the existing node:test suite and compile TS/TSX with the project's
// TypeScript dependency. Importing files in one process reports real assertions.
register('./test-loader.mjs', import.meta.url)
const directory = new URL('../src/tests/', import.meta.url)
const files = (await readdir(directory))
  .filter((name) => !name.startsWith('_') && /\.test\.(ts|tsx)$/.test(name))
  .sort()
if (!files.length) throw new Error('No frontend tests found')
for (const file of files) await import(new URL(file, directory).href)
