import React, { useState, useRef, useEffect } from 'react'
import { ExternalLink, Check, ChevronRight, HelpCircle, Wrench } from 'lucide-react'
import { getCompatibleTools, type ToolCompatibilityResult } from '../../lib/toolCompatibility'

interface UseAsInputMenuProps {
  artifactPath: string
  artifactName: string
  onSendToTool: (toolId: string, inputPath: string) => void
}

export const UseAsInputMenu: React.FC<UseAsInputMenuProps> = ({
  artifactPath,
  artifactName,
  onSendToTool,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const compatibleTools = getCompatibleTools(artifactName)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const handleSelectTool = (tool: ToolCompatibilityResult) => {
    if (!tool.compatible) return
    onSendToTool(tool.toolId, artifactPath)
    setIsOpen(false)
  }

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1 rounded border border-brand-sage bg-brand-cream-dark px-2 py-1 text-xs font-semibold text-brand-espresso hover:bg-brand-sage/40 transition-colors shadow-2xs"
        title="Use file as input in tools"
      >
        <ExternalLink className="size-2.5 text-brand-caramel" />
        <span>Use as Input</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 z-modal w-72 rounded-xl border border-brand-sage bg-brand-cream-light p-2 shadow-xl ring-1 ring-black/5">
          <div className="px-2 py-1.5 border-b border-brand-sage/40 mb-1">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-brand-caramel-text flex items-center gap-1">
              <Wrench className="size-3 text-brand-caramel" />
              Select Target Tool
            </span>
            <p className="text-xs font-mono text-brand-espresso/70 truncate" title={artifactName}>
              {artifactName}
            </p>
          </div>

          <div className="space-y-1">
            {compatibleTools.map((tool) => (
              <button
                key={tool.toolId}
                disabled={!tool.compatible}
                onClick={() => handleSelectTool(tool)}
                className={`w-full text-left flex items-start gap-2.5 p-2 rounded-lg transition-all ${
                  tool.compatible
                    ? 'hover:bg-brand-cream-dark cursor-pointer text-brand-espresso'
                    : 'opacity-40 cursor-not-allowed bg-transparent text-brand-caramel-text'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {tool.compatible ? (
                    <span className="flex size-4 items-center justify-center rounded-full bg-brand-caramel text-brand-cream-light">
                      <Check className="size-2.5" />
                    </span>
                  ) : (
                    <span className="flex size-4 items-center justify-center rounded-full bg-brand-sage/40 text-brand-caramel-text">
                      <HelpCircle className="size-2.5" />
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold truncate">{tool.toolName}</span>
                    <span className="font-mono text-xs px-1.5 py-0.2 rounded border bg-brand-cream-dark border-brand-sage text-brand-caramel font-bold shrink-0">
                      {tool.badge}
                    </span>
                  </div>
                  <p className="text-xs text-brand-caramel-text line-clamp-1 leading-snug">
                    {tool.compatible ? tool.description : tool.incompatibleReason}
                  </p>
                </div>

                {tool.compatible && <ChevronRight className="size-3.5 text-brand-caramel shrink-0 mt-1" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
