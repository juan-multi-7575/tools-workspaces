import type { ReactNode } from 'react'
import { ArrowRight, Cpu, Tag } from 'lucide-react'
import type { ToolManifest } from '../../lib/api'

export interface ToolPageShellProps {
  manifest: ToolManifest
  children: ReactNode
  aside?: ReactNode
  /**
   * The dependency gate. It is hosted in the sticky action region below rather
   * than in `aside`, because the preflight panel is the one thing a user must be
   * able to see before they touch anything else. `aside` is a tall rail that
   * scrolls its own gate off the bottom of the viewport.
   */
  gate?: ReactNode
  footer?: ReactNode
  headerActions?: ReactNode
}

export default function ToolPageShell({ manifest, children, aside, gate, footer, headerActions }: ToolPageShellProps) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-8">
        <header className="flex flex-col gap-4 border-b border-brand-sage pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-caramel text-brand-cream-light">
                <Cpu className="size-4" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-brand-espresso">{manifest.name}</h1>
              <span className="rounded-full border border-brand-sage bg-brand-sage/30 px-2.5 py-0.5 font-mono text-xs font-bold text-brand-espresso">
                {manifest.category || 'General'}
              </span>
            </div>
            <p className="max-w-3xl text-sm leading-relaxed text-brand-caramel-text">{manifest.description}</p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-xs text-brand-caramel-text">{manifest.id}</span>
              {manifest.tags?.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-md border border-brand-sage bg-brand-cream-dark px-2 py-0.5 font-mono text-xs text-brand-caramel-text"
                >
                  <Tag className="size-2.5 text-brand-caramel" />
                  {tag}
                </span>
              ))}
            </div>
          </div>
          {headerActions && <div className="flex shrink-0 items-center gap-2">{headerActions}</div>}
        </header>

        <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1">{children}</div>
          {aside && <div className="w-full shrink-0 xl:w-[340px]">{aside}</div>}
        </div>

        {(gate || footer) && (
          <div
            data-tool-gate-region={manifest.id}
            className="sticky bottom-0 z-drawer -mx-4 space-y-3 border-t border-brand-sage bg-brand-cream-dark/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8"
          >
            {gate}
            {footer}
          </div>
        )}

        <footer className="flex flex-wrap items-center gap-2 pt-2 font-mono text-xs text-brand-caramel-text">
          <span>Input</span>
          <span className="rounded border border-brand-sage bg-surface-white px-1.5 py-0.5">
            {manifest.input_kinds.join(', ') || 'any'}
          </span>
          <ArrowRight className="size-3 text-brand-caramel" />
          <span>Output</span>
          <span className="rounded border border-brand-sage bg-brand-cream-dark px-1.5 py-0.5">
            {manifest.output_kinds.join(', ') || 'any'}
          </span>
        </footer>
      </div>
    </div>
  )
}