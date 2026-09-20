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
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
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
        className="inline-flex items-center gap-1 rounded border border-[#B0BA99] bg-[#EDE5CD] px-2 py-1 text-[10px] font-semibold text-[#4E220F] hover:bg-[#B0BA99]/40 transition-colors shadow-2xs"
        title="Use file as input in tools"
      >
        <ExternalLink className="size-2.5 text-[#9D6638]" />
        <span>Use as Input</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-72 rounded-xl border border-[#B0BA99] bg-[#FDFBF7] p-2 shadow-xl ring-1 ring-black/5">
          <div className="px-2 py-1.5 border-b border-[#B0BA99]/40 mb-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#7C5339] flex items-center gap-1">
              <Wrench className="size-3 text-[#9D6638]" />
              Select Target Tool
            </span>
            <p className="text-[10px] font-mono text-[#4E220F]/70 truncate" title={artifactName}>
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
                    ? 'hover:bg-[#EDE5CD] cursor-pointer text-[#4E220F]'
                    : 'opacity-40 cursor-not-allowed bg-transparent text-[#7C5339]'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {tool.compatible ? (
                    <span className="flex size-4 items-center justify-center rounded-full bg-[#9D6638] text-[#FDFBF7]">
                      <Check className="size-2.5" />
                    </span>
                  ) : (
                    <span className="flex size-4 items-center justify-center rounded-full bg-[#B0BA99]/40 text-[#7C5339]">
                      <HelpCircle className="size-2.5" />
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold truncate">{tool.toolName}</span>
                    <span className="font-mono text-[9px] px-1.5 py-0.2 rounded border bg-[#EDE5CD] border-[#B0BA99] text-[#9D6638] font-bold shrink-0">
                      {tool.badge}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#7C5339] line-clamp-1 leading-snug">
                    {tool.compatible ? tool.description : tool.incompatibleReason}
                  </p>
                </div>

                {tool.compatible && <ChevronRight className="size-3.5 text-[#9D6638] shrink-0 mt-1" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
