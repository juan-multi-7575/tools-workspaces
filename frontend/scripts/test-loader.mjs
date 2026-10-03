import { readFile, access } from 'node:fs/promises'
import ts from 'typescript'

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && context.parentURL) {
    const target = new URL(specifier, context.parentURL)
    if (!/\.[a-z]+$/i.test(target.pathname)) {
      for (const extension of ['.ts', '.tsx', '.js']) {
        const candidate = new URL(target.href + extension)
        try {
          await access(candidate)
          return { url: candidate.href, shortCircuit: true }
        } catch { /* Try the next source extension. */ }
      }
    }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && /\.tsx?$/.test(new URL(url).pathname)) {
    const source = await readFile(new URL(url), 'utf8')
    return {
      format: 'module',
      shortCircuit: true,
      source: ts.transpileModule(source, {
        fileName: new URL(url).pathname,
        compilerOptions: {
          target: ts.ScriptTarget.ES2023,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
          verbatimModuleSyntax: true,
        },
      }).outputText,
    }
  }
  return nextLoad(url, context)
}
