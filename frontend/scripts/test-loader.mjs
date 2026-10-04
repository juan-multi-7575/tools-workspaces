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

  /*
   * Stylesheets are side-effect imports. Node cannot execute CSS, and a site
   * component importing its own scoped stylesheet is the point of the scoped
   * per-site architecture (D7), so an empty module stands in for the file. The
   * tests assert on rendered markup and class names, never on computed style,
   * so nothing is lost by dropping the bytes.
   */
  if (url.startsWith('file:') && /\.css$/.test(new URL(url).pathname)) {
    return { format: 'module', shortCircuit: true, source: 'export default {}' }
  }

  return nextLoad(url, context)
}
