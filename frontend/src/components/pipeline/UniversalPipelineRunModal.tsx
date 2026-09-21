import React, { useEffect, useRef, useState } from 'react'
import {
  Play,
  X,
  Link,
  Clipboard,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  RefreshCw,
  FastForward,
  FileCheck,
  Languages,
  Sliders,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import type { PipelineEntryInput, ResolvedPipelineFlow } from '../../lib/pipelineInputResolver'
import { api, type DAGNode } from '../../lib/api'
import UniversalFileInput from '../common/UniversalFileInput'

interface UniversalPipelineRunModalProps {
  isOpen: boolean
  workspaceId: string
  dagNodes?: DAGNode[]
  onClose: () => void
  onRun: (resolvedParamsByNode: Record<string, Record<string, unknown>>, cachePolicy?: 'reuse' | 'recompute') => void
  inputs?: PipelineEntryInput[]
  pipelineTitle?: string
  toolSteps?: string[]
  resolvedFlow?: ResolvedPipelineFlow
}

export default function UniversalPipelineRunModal({
  isOpen,
  workspaceId,
  dagNodes = [],
  onClose,
  onRun,
  inputs = [],
  pipelineTitle = 'Run Pipeline',
  toolSteps = [],
  resolvedFlow,
}: UniversalPipelineRunModalProps) {
  // Map of nodeId -> { paramKey: value }
  const [formValues, setFormValues] = useState<Record<string, Record<string, any>>>({})
  const [validationError, setValidationError] = useState<string | null>(null)
  const [translateToEnglish, setTranslateToEnglish] = useState(false)
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set())

  // Pre-run URL check: per entry-input key `${nodeId}:${paramKey}`
  type UrlPreview =
    | { state: 'idle' }
    | { state: 'checking' }
    | { state: 'ready'; title: string; duration?: number | null; uploader?: string | null }
    | { state: 'error'; error: string }
    | { state: 'overridden' }
  const [urlPreviews, setUrlPreviews] = useState<Record<string, UrlPreview>>({})
  const previewReqRef = useRef(0)

  const isValidHttpUrl = (v: string) => {
    try {
      const u = new URL(String(v || '').trim())
      return u.protocol === 'http:' || u.protocol === 'https:'
    } catch {
      return false
    }
  }

  const formatDuration = (secs?: number | null) => {
    if (secs === undefined || secs === null || Number.isNaN(secs)) return null
    const s = Math.round(secs)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const r = s % 60
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
  }

  const resolveEntryUrl = (nodeId: string, paramKey: string, rawUrl: string) => {
    const key = `${nodeId}:${paramKey}`
    const url = String(rawUrl || '').trim()
    if (!url) {
      setUrlPreviews((prev) => ({ ...prev, [key]: { state: 'idle' } }))
      return
    }
    if (!isValidHttpUrl(url)) {
      setUrlPreviews((prev) => ({ ...prev, [key]: { state: 'error', error: 'Not a valid http(s) URL.' } }))
      return
    }
    const reqId = ++previewReqRef.current
    setUrlPreviews((prev) => ({ ...prev, [key]: { state: 'checking' } }))
    api
      .resolvePipelineUrl(workspaceId, url)
      .then((res) => {
        if (previewReqRef.current !== reqId) return
        if (res.ok) {
          setUrlPreviews((prev) => ({
            ...prev,
            [key]: { state: 'ready', title: res.title || 'Untitled', duration: res.duration_seconds ?? null, uploader: res.uploader ?? null },
          }))
        } else {
          setUrlPreviews((prev) => ({ ...prev, [key]: { state: 'error', error: res.error || 'Could not resolve URL.' } }))
        }
      })
      .catch(() => {
        if (previewReqRef.current !== reqId) return
        setUrlPreviews((prev) => ({ ...prev, [key]: { state: 'error', error: 'Metadata lookup failed.' } }))
      })
  }

  // Duplicate / Existing Detection State
  const [checkingExisting, setCheckingExisting] = useState(false)
  const [duplicateMatches, setDuplicateMatches] = useState<
    { node_id: string; tool_id: string; artifacts: { name: string; path: string; size: number }[]; summary: string }[] | null
  >(null)

  const modalRef = useRef<HTMLDivElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)

  const activeEntryInputs = resolvedFlow ? resolvedFlow.entryInputs : inputs
  const nodeConfigs = resolvedFlow ? resolvedFlow.nodeConfigs : []

  // Parent passes fresh dagNodes/resolvedFlow identities on every render —
  // snapshot them so open-time init never re-fires mid-edit.
  const latestRef = useRef({ dagNodes, resolvedFlow, activeEntryInputs })
  latestRef.current = { dagNodes, resolvedFlow, activeEntryInputs }

  // Initialize form values and translation state (open-time only)
  useEffect(() => {
    if (!isOpen) return
    const { dagNodes: openDagNodes, resolvedFlow: openFlow, activeEntryInputs: openInputs } = latestRef.current
    const openNodeConfigs = openFlow ? openFlow.nodeConfigs : []
    const initial: Record<string, Record<string, any>> = {}

    // 1. Initialize existing node params from dagNodes
    for (const dn of openDagNodes) {
      if (dn.params) {
        initial[dn.id] = { ...(dn.params as Record<string, any>) }
      }
    }

    // 2. Populate entry inputs defaults
    for (const inp of openInputs) {
      if (!initial[inp.nodeId]) initial[inp.nodeId] = {}
      if (initial[inp.nodeId][inp.paramKey] === undefined) {
        initial[inp.nodeId][inp.paramKey] =
          inp.currentVal !== undefined && inp.currentVal !== ''
            ? inp.currentVal
            : inp.defaultVal !== undefined
            ? inp.defaultVal
            : ''
      }
    }

    // 3. Populate nodeConfigs defaults
    for (const group of openNodeConfigs) {
      if (!initial[group.nodeId]) initial[group.nodeId] = {}
      for (const p of group.parameters) {
        if (initial[group.nodeId][p.paramKey] === undefined) {
          initial[group.nodeId][p.paramKey] =
            p.currentVal !== undefined && p.currentVal !== ''
              ? p.currentVal
              : p.defaultVal !== undefined
              ? p.defaultVal
              : ''
        }
      }
    }

    // 4. Initialize translation toggle
    if (openFlow?.hasTranslationNode && openFlow.translationNodeId) {
      const transNodeId = openFlow.translationNodeId
      if (openFlow.translationToolId === 'transcriber') {
        const isTrans = initial[transNodeId]?.task === 'translate' || openFlow.isTranslationEnabled
        setTranslateToEnglish(!!isTrans)
        if (isTrans) {
          initial[transNodeId].task = 'translate'
        }
      } else if (openFlow.translationToolId === 'subtitle_translator') {
        const isEn = initial[transNodeId]?.target_lang === 'English' || !initial[transNodeId]?.target_lang
        setTranslateToEnglish(isEn)
        if (isEn) {
          initial[transNodeId].target_lang = 'English'
        }
      }
    }

    setFormValues(initial)
    setValidationError(null)
    setDuplicateMatches(null)
    setUrlPreviews({})
    setExpandedNodeIds(new Set())
    previewReqRef.current++
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // A11y: focus trap, ESC to close, return focus on close
  useEffect(() => {
    if (!isOpen) return
    prevFocusRef.current = document.activeElement as HTMLElement | null
    const modal = modalRef.current
    // Focus first focusable element inside modal, fallback to modal container
    if (modal) {
      const focusableSelector =
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      const focusable = modal.querySelectorAll<HTMLElement>(focusableSelector)
      if (focusable.length) focusable[0].focus()
      else {
        modal.focus()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key === 'Tab' && modal) {
        const focusableSelector =
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        const nodes = Array.from(modal.querySelectorAll<HTMLElement>(focusableSelector)).filter(
          (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
        )
        if (nodes.length === 0) {
          e.preventDefault()
          return
        }
        const first = nodes[0]
        const last = nodes[nodes.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      prevFocusRef.current?.focus()
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  // ---- Run overrides: baseline = canvas value (currentVal) ?? schema default ----
  const paramBaseline = (nodeId: string, paramKey: string): unknown => {
    for (const group of nodeConfigs) {
      if (group.nodeId !== nodeId) continue
      const p = group.parameters.find((pp) => pp.paramKey === paramKey)
      if (!p) continue
      return p.currentVal !== undefined && p.currentVal !== '' ? p.currentVal : p.defaultVal
    }
    for (const inp of activeEntryInputs) {
      if (inp.nodeId === nodeId && inp.paramKey === paramKey) {
        return inp.currentVal !== undefined && inp.currentVal !== '' ? inp.currentVal : inp.defaultVal
      }
    }
    return undefined
  }

  const isParamChanged = (nodeId: string, paramKey: string): boolean => {
    const baseline = paramBaseline(nodeId, paramKey)
    if (baseline === undefined) return false
    try {
      return JSON.stringify(formValues[nodeId]?.[paramKey]) !== JSON.stringify(baseline)
    } catch {
      return formValues[nodeId]?.[paramKey] !== baseline
    }
  }

  const changedCountForNode = (nodeId: string): { changed: number; total: number } => {
    const group = nodeConfigs.find((g) => g.nodeId === nodeId)
    if (!group) return { changed: 0, total: 0 }
    let changed = 0
    for (const p of group.parameters) {
      if (isParamChanged(nodeId, p.paramKey)) changed++
    }
    return { changed, total: group.parameters.length }
  }

  const totalOverrides = nodeConfigs.reduce((acc, g) => acc + changedCountForNode(g.nodeId).changed, 0)

  const resetNodeToDefaults = (nodeId: string) => {
    const group = nodeConfigs.find((g) => g.nodeId === nodeId)
    if (!group) return
    setFormValues((prev) => {
      const next = { ...(prev[nodeId] || {}) }
      for (const p of group.parameters) {
        const baseline = paramBaseline(nodeId, p.paramKey)
        if (baseline !== undefined) next[p.paramKey] = baseline
      }
      return { ...prev, [nodeId]: next }
    })
  }

  // ---- Start gating: required URL inputs must resolve before commit ----
  const urlGateStates = activeEntryInputs
    .filter((inp) => inp.isUrl)
    .map((inp) => {
      const val = String(formValues[inp.nodeId]?.[inp.paramKey] ?? '').trim()
      const preview = urlPreviews[`${inp.nodeId}:${inp.paramKey}`] || { state: 'idle' as const }
      return { inp, val, preview }
    })
  const urlGateBlock = urlGateStates.find(
    (g) => !g.val || g.preview.state === 'idle' || g.preview.state === 'checking' || g.preview.state === 'error',
  )
  const startBlockedReason = !urlGateBlock
    ? null
    : !urlGateBlock.val
    ? `Enter a URL for "${urlGateBlock.inp.title}".`
    : urlGateBlock.preview.state === 'checking'
    ? 'Verifying media URL…'
    : urlGateBlock.preview.state === 'error'
    ? 'URL could not be verified — fix it or run anyway.'
    : 'Blur the URL field to verify it.'

  const stepCount = nodeConfigs.length > 0 ? nodeConfigs.length : dagNodes.length
  const translationStepName = resolvedFlow?.translationNodeId
    ? nodeConfigs.find((g) => g.nodeId === resolvedFlow.translationNodeId)?.toolName
    : undefined

  const handleFieldChange = (nodeId: string, paramKey: string, val: any) => {
    setFormValues((prev) => ({
      ...prev,
      [nodeId]: {
        ...(prev[nodeId] || {}),
        [paramKey]: val,
      },
    }))
    // A changed URL invalidates its preview — blur the field to re-verify.
    if (activeEntryInputs.some((inp) => inp.nodeId === nodeId && inp.paramKey === paramKey && inp.isUrl)) {
      const key = `${nodeId}:${paramKey}`
      setUrlPreviews((prev) => (prev[key] ? { ...prev, [key]: { state: 'idle' } } : prev))
    }
    if (validationError) setValidationError(null)
    if (duplicateMatches) setDuplicateMatches(null)
  }

  const handleToggleTranslation = (checked: boolean) => {
    setTranslateToEnglish(checked)
    if (!resolvedFlow?.translationNodeId) return
    const transNodeId = resolvedFlow.translationNodeId
    if (resolvedFlow.translationToolId === 'transcriber') {
      handleFieldChange(transNodeId, 'task', checked ? 'translate' : 'transcribe')
    } else if (resolvedFlow.translationToolId === 'subtitle_translator') {
      handleFieldChange(transNodeId, 'target_lang', checked ? 'English' : 'Korean')
    }
  }

  const toggleNodeExpanded = (nodeId: string) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  const handlePasteClipboard = async (nodeId: string, paramKey: string) => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        handleFieldChange(nodeId, paramKey, text.trim())
      }
    } catch {
      // Ignore clipboard permission errors
    }
  }

  const handlePreRunCheck = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate that required entry inputs have values
    for (const inp of activeEntryInputs) {
      const val = formValues[inp.nodeId]?.[inp.paramKey]
      if (inp.isUrl && (!val || String(val).trim() === '')) {
        setValidationError(`Please enter a valid URL for "${inp.title}" (${inp.toolName}).`)
        return
      }
      if (inp.isFilePath && (!val || String(val).trim() === '')) {
        setValidationError(`Please provide or select an input file for "${inp.title}" (${inp.toolName}).`)
        return
      }
    }

    // Check backend if any of the target inputs / files already exist in this workspace
    try {
      setCheckingExisting(true)
      const res = await api.checkExistingPipelineInputs(workspaceId, {
        nodes: dagNodes,
        params_by_node: formValues,
      })
      setCheckingExisting(false)

      if (res.has_existing && res.matches && res.matches.length > 0) {
        // Prompt user with choices to reuse or recompute
        setDuplicateMatches(res.matches)
        return
      }
    } catch {
      setCheckingExisting(false)
    }

    // Default immediate execution if no duplicates found
    onRun(formValues, 'recompute')
    onClose()
  }

  const handleChoice = (policy: 'reuse' | 'recompute') => {
    onRun(formValues, policy)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-pipeline-title"
        tabIndex={-1}
        className="w-full max-w-2xl rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#B0BA99]/40 bg-[#EDE5CD]/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-[#9D6638] text-[#FFFFFF] shadow-2xs">
              <Play className="size-4.5 fill-current translate-x-0.5" />
            </div>
            <div>
              <h3 id="run-pipeline-title" className="text-base font-bold text-[#4E220F] flex items-center gap-2">
                {pipelineTitle}
              </h3>
              <p className="text-xs text-[#7C5339]">
                {stepCount} step{stepCount === 1 ? '' : 's'}
                {totalOverrides > 0 && ` · ${totalOverrides} override${totalOverrides === 1 ? '' : 's'}`}
                {resolvedFlow?.hasTranslationNode && ` · translation ${translateToEnglish ? 'on' : 'off'}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-xl text-[#7C5339] hover:bg-[#EDE5CD] hover:text-[#4E220F] transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Pipeline Execution Flow Breadcrumbs */}
        {toolSteps && toolSteps.length > 0 && (
          <div className="border-b border-[#B0BA99]/30 bg-[#F7F1DE]/60 px-6 py-2.5">
            <div className="flex items-center gap-2 overflow-x-auto text-xs font-semibold text-[#7C5339] no-scrollbar">
              <span className="text-[11px] uppercase tracking-wider font-bold text-[#4E220F]/60">Flow:</span>
              {toolSteps.map((step, idx) => {
                const isTransStep = translationStepName !== undefined && step === translationStepName
                const transOff = isTransStep && !translateToEnglish
                return (
                  <React.Fragment key={idx}>
                    {idx > 0 && <ArrowRight className="size-3.5 text-[#9D6638] shrink-0" />}
                    <span
                      className={`px-2 py-0.5 rounded-md shrink-0 ${
                        transOff
                          ? 'bg-[#EDE5CD]/40 text-[#7C5339]/60 line-through'
                          : idx === 0
                          ? 'bg-[#9D6638]/15 text-[#9D6638] font-bold border border-[#9D6638]/30'
                          : 'bg-[#EDE5CD]/70 text-[#4E220F]'
                      }`}
                      title={transOff ? 'Translation is off for this run' : undefined}
                    >
                      {step}
                      {transOff && ' · off'}
                    </span>
                  </React.Fragment>
                )
              })}
            </div>
          </div>
        )}

        {/* Dynamic Duplicate Confirmation View */}
        {duplicateMatches ? (
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div className="rounded-2xl border-2 border-[#9D6638]/40 bg-[#F7F1DE]/60 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[#4E220F]">
                <Sparkles className="size-5 text-[#9D6638]" />
                <span>Existing Media & Outputs Detected!</span>
              </div>
              <p className="text-xs text-[#7C5339] leading-relaxed">
                We found existing completed outputs in this workspace matching your exact inputs & settings (verified on disk). Reuse skips only matching steps; if you deleted files manually or changed translation settings (e.g. Korean → English), choose <b>Force Fresh Re-Run</b> to regenerate. Deleted files are auto-detected — phantom reuse is now blocked.
              </p>

              <div className="space-y-2 mt-2">
                {duplicateMatches.map((m) => (
                  <div key={m.node_id} className="rounded-xl border border-[#B0BA99]/70 bg-[#FFFFFF] p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between font-bold text-[#4E220F]">
                      <span className="uppercase text-[10px] font-mono text-[#9D6638] bg-[#EDE5CD] px-1.5 py-0.5 rounded">
                        {m.tool_id}
                      </span>
                      <span className="text-[10px] text-[#2E6B47] font-semibold flex items-center gap-1">
                        <FileCheck className="size-3" /> Ready on disk
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                      {m.artifacts.map((a) => {
                        const ext = a.name.split('.').pop()?.toLowerCase() || 'file'
                        const typeLabel = ext.length > 5 ? 'file' : ext
                        return (
                          <div key={a.name} className="flex items-start gap-2 rounded-lg border border-[#B0BA99]/40 bg-[#F7F1DE]/50 p-2">
                            <span className="shrink-0 rounded-md bg-[#9D6638] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#FDFBF7]">{typeLabel}</span>
                            <div className="min-w-0 flex-1">
                              <p className="break-all text-[11px] font-mono font-medium leading-tight text-[#4E220F]" title={a.name}>{a.name}</p>
                              <p className="text-[10px] font-mono text-[#7C5339]">{(a.size / 1024).toFixed(1)} KB • {a.path}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDuplicateMatches(null)}
                className="rounded-xl border border-[#B0BA99] bg-[#FFFFFF] px-4 py-2.5 text-xs font-bold text-[#7C5339] hover:bg-[#EDE5CD] transition-colors w-full sm:w-auto"
              >
                Back to Edit
              </button>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => handleChoice('recompute')}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#B0BA99] bg-[#EDE5CD] px-4 py-2.5 text-xs font-bold text-[#4E220F] hover:bg-[#B0BA99]/40 transition-all shadow-2xs w-full sm:w-auto"
                >
                  <RefreshCw className="size-3.5" />
                  Force Fresh Re-Run
                </button>
                <button
                  type="button"
                  onClick={() => handleChoice('reuse')}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#2E6B47] px-4 py-2.5 text-xs font-bold text-[#FDFBF7] hover:bg-[#245437] transition-all shadow-sm active:scale-95 w-full sm:w-auto"
                >
                  <FastForward className="size-3.5 fill-current" />
                  ⚡ Reuse & Skip Completed
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Form Content */
          <form onSubmit={handlePreRunCheck} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {validationError && (
                <div className="flex items-center gap-2 rounded-xl border border-[#A83232]/40 bg-[#A83232]/10 p-3 text-xs font-semibold text-[#A83232]">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}

              {/* SECTION 1: Required Entry Inputs (URLs, Files) */}
              <div className="space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-[#7C5339] flex items-center gap-1.5">
                  <Link className="size-3.5 text-[#9D6638]" /> Primary Pipeline Inputs
                </span>

                {activeEntryInputs.length === 0 ? (
                  <div className="rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/50 p-4 text-center">
                    <CheckCircle2 className="mx-auto size-6 text-[#9D6638] mb-1" />
                    <p className="text-xs font-bold text-[#4E220F]">Ready to Execute</p>
                    <p className="text-[11px] text-[#7C5339]">
                      Pipeline inputs are satisfied or pre-configured.
                    </p>
                  </div>
                ) : (
                  activeEntryInputs.map((inp) => {
                    const val = formValues[inp.nodeId]?.[inp.paramKey] ?? ''

                    return (
                      <div
                        key={`${inp.nodeId}-${inp.paramKey}`}
                        className="rounded-xl border border-[#B0BA99]/60 bg-[#F7F1DE]/40 p-4 space-y-2.5 transition-all focus-within:border-[#9D6638] focus-within:bg-[#FFFFFF]"
                      >
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-[#4E220F] flex items-center gap-1.5">
                            {inp.isUrl && <Link className="size-3.5 text-[#9D6638]" />}
                            {inp.isFilePath && <FolderOpen className="size-3.5 text-[#9D6638]" />}
                            <span>{inp.title}</span>
                            <span className="text-[10px] font-mono text-[#7C5339] font-normal">
                              ({inp.toolName})
                            </span>
                          </label>
                          {inp.isUrl && (
                            <button
                              type="button"
                              onClick={() => handlePasteClipboard(inp.nodeId, inp.paramKey)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#9D6638] hover:text-[#86542C] transition-colors"
                            >
                              <Clipboard className="size-3" /> Paste URL
                            </button>
                          )}
                        </div>

                        {inp.description && (
                          <p className="text-[11px] text-[#7C5339] leading-tight">
                            {inp.description}
                          </p>
                        )}

                        {inp.isFilePath ? (
                          <UniversalFileInput
                            value={String(val)}
                            onChange={(path) => handleFieldChange(inp.nodeId, inp.paramKey, path)}
                            placeholder={`Select or upload file for ${inp.title}...`}
                          />
                        ) : inp.type === 'boolean' ? (
                          <label className="flex items-center gap-3 rounded-xl border border-[#B0BA99] bg-[#FFFFFF] px-3.5 py-2.5 cursor-pointer hover:border-[#9D6638] transition-colors">
                            <input
                              type="checkbox"
                              checked={Boolean(val)}
                              onChange={(e) => handleFieldChange(inp.nodeId, inp.paramKey, e.target.checked)}
                              className="size-4 rounded border-[#B0BA99] text-[#9D6638] focus:ring-[#9D6638]"
                            />
                            <span className="text-xs font-bold text-[#4E220F]">
                              {Boolean(val) ? 'Enabled' : 'Disabled'}
                            </span>
                            <span className="text-[11px] text-[#7C5339]">— {Boolean(val) ? 'Yes' : 'No'}</span>
                          </label>
                        ) : inp.enumOptions && inp.enumOptions.length > 0 ? (
                          <select
                            value={String(val)}
                            onChange={(e) => handleFieldChange(inp.nodeId, inp.paramKey, e.target.value)}
                            className="w-full rounded-xl border border-[#B0BA99] bg-[#FFFFFF] px-3.5 py-2 text-xs text-[#4E220F] font-bold focus:border-[#9D6638] focus:outline-none"
                          >
                            {inp.enumOptions.map((opt) => (
                              <option key={String(opt)} value={String(opt)}>
                                {inp.enumLabels?.[String(opt)] || String(opt)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <>
                            <input
                              type={inp.isUrl ? 'url' : inp.type === 'number' ? 'number' : 'text'}
                              value={String(val)}
                              onChange={(e) => handleFieldChange(inp.nodeId, inp.paramKey, e.target.value)}
                              onBlur={
                                inp.isUrl
                                  ? (e) => resolveEntryUrl(inp.nodeId, inp.paramKey, e.target.value)
                                  : undefined
                              }
                              placeholder={inp.isUrl ? 'https://www.youtube.com/watch?v=...' : `Enter ${inp.title}...`}
                              className="w-full rounded-xl border border-[#B0BA99] bg-[#FFFFFF] px-3.5 py-2 text-xs text-[#4E220F] font-medium placeholder-[#7C5339]/50 focus:border-[#9D6638] focus:outline-none"
                            />
                            {inp.isUrl && (() => {
                              const preview = urlPreviews[`${inp.nodeId}:${inp.paramKey}`]
                              if (!preview || preview.state === 'idle') return null
                              if (preview.state === 'checking') {
                                return (
                                  <p className="text-[11px] font-mono text-[#7C5339] animate-pulse">
                                    Verifying media URL…
                                  </p>
                                )
                              }
                              if (preview.state === 'ready') {
                                const dur = formatDuration(preview.duration)
                                return (
                                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#2E6B47]">
                                    <CheckCircle2 className="size-3.5 shrink-0" />
                                    <span className="truncate">
                                      {preview.title}
                                      {dur && ` · ${dur}`}
                                      {preview.uploader && ` · ${preview.uploader}`}
                                    </span>
                                  </p>
                                )
                              }
                              if (preview.state === 'overridden') {
                                return (
                                  <p className="text-[11px] font-mono text-[#7C5339]">
                                    Unverified URL — running anyway.
                                  </p>
                                )
                              }
                              return (
                                <p className="flex flex-wrap items-center gap-x-2 text-[11px] font-semibold text-[#A83232]">
                                  <span className="inline-flex items-center gap-1">
                                    <AlertCircle className="size-3.5 shrink-0" /> {preview.error}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setUrlPreviews((prev) => ({
                                        ...prev,
                                        [`${inp.nodeId}:${inp.paramKey}`]: { state: 'overridden' },
                                      }))
                                    }
                                    className="font-bold text-[#9D6638] hover:text-[#86542C] underline underline-offset-2"
                                  >
                                    Run anyway
                                  </button>
                                </p>
                              )
                            })()}
                          </>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              {/* SECTION 3: Step-by-Step Node Configuration Accordion */}
              {nodeConfigs.length > 0 && (
                <div className="space-y-2.5 pt-2 border-t border-[#B0BA99]/40">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#7C5339] flex items-center gap-1.5">
                      <Sliders className="size-3.5 text-[#9D6638]" /> Step Options & Parameters (Optional)
                    </span>
                    <span className="text-[10px] text-[#7C5339] font-mono">
                      {nodeConfigs.length} customizable step{nodeConfigs.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {/* Translation as a normal step row — same affordances, toggle inline */}
                    {resolvedFlow?.hasTranslationNode && (
                      <div className="rounded-xl border border-[#B0BA99]/70 bg-[#FFFFFF] overflow-hidden shadow-2xs">
                        <div className="w-full flex items-center justify-between px-3.5 py-2.5 bg-[#F7F1DE]/50 text-left">
                          <div className="flex items-center gap-2">
                            <Languages className="size-3.5 text-[#9D6638]" />
                            <span className="font-mono text-xs font-bold text-[#4E220F]">
                              {translationStepName || 'English Subtitles & Translation'}
                            </span>
                            <span
                              className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                                translateToEnglish
                                  ? 'bg-[#9D6638] text-[#FDFBF7]'
                                  : 'bg-[#EDE5CD] text-[#7C5339] border border-[#B0BA99]'
                              }`}
                            >
                              {translateToEnglish ? 'on' : 'off'}
                            </span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer" title="Toggle English translation for this run">
                            <input
                              type="checkbox"
                              checked={translateToEnglish}
                              onChange={(e) => handleToggleTranslation(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-[#B0BA99] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#B0BA99] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#9D6638]"></div>
                          </label>
                        </div>
                      </div>
                    )}
                    {nodeConfigs.map((nodeCfg) => {
                      const isExpanded = expandedNodeIds.has(nodeCfg.nodeId)
                      const { changed, total } = changedCountForNode(nodeCfg.nodeId)
                      return (
                        <div
                          key={nodeCfg.nodeId}
                          className="rounded-xl border border-[#B0BA99]/70 bg-[#FFFFFF] overflow-hidden shadow-2xs"
                        >
                          <button
                            type="button"
                            onClick={() => toggleNodeExpanded(nodeCfg.nodeId)}
                            className="w-full flex items-center justify-between px-3.5 py-2.5 bg-[#F7F1DE]/50 hover:bg-[#EDE5CD]/50 text-left transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              {changed > 0 && <span className="h-2 w-2 rounded-full bg-[#9D6638]" title={`${changed} override${changed === 1 ? '' : 's'}`} />}
                              <span className="font-mono text-xs font-bold text-[#4E220F]">
                                {nodeCfg.toolName}
                              </span>
                              <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-[#EDE5CD] text-[#7C5339]">
                                {nodeCfg.toolId}
                              </span>
                              {changed > 0 && (
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-[#9D6638]/15 text-[#9D6638] font-bold border border-[#9D6638]/30">
                                  {changed} of {total} changed
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[#7C5339] text-xs">
                              <span className="text-[10px] font-mono">{nodeCfg.parameters.length} settings</span>
                              {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="p-3.5 space-y-3 bg-[#FFFFFF] border-t border-[#B0BA99]/30">
                              {changed > 0 && (
                                <div className="flex items-center justify-between rounded-lg bg-[#F7F1DE]/60 px-2.5 py-1.5">
                                  <span className="text-[11px] font-mono text-[#7C5339]">
                                    {changed} override{changed === 1 ? '' : 's'} for this run
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => resetNodeToDefaults(nodeCfg.nodeId)}
                                    className="text-[11px] font-bold text-[#9D6638] hover:text-[#86542C] transition-colors"
                                  >
                                    Reset to defaults
                                  </button>
                                </div>
                              )}
                              {nodeCfg.parameters.map((param) => {
                                const val = formValues[nodeCfg.nodeId]?.[param.paramKey] ?? param.defaultVal ?? ''
                                const paramChanged = isParamChanged(nodeCfg.nodeId, param.paramKey)
                                return (
                                  <div key={param.paramKey} className="space-y-1">
                                    <div className="flex items-center justify-between text-xs font-bold text-[#4E220F]">
                                      <span className="flex items-center gap-1.5">
                                        {paramChanged && <span className="h-1.5 w-1.5 rounded-full bg-[#9D6638]" />}
                                        {param.title}
                                      </span>
                                      {param.defaultVal !== undefined && (
                                        <span className="font-mono text-[10px] text-[#7C5339] font-normal">
                                          Default: {String(param.defaultVal)}
                                        </span>
                                      )}
                                    </div>
                                    {param.description && (
                                      <p className="text-[11px] text-[#7C5339]">{param.description}</p>
                                    )}
                                    {param.type === 'boolean' ? (
                                      <label className="flex items-center gap-2 rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/60 px-3 py-2 cursor-pointer hover:border-[#9D6638] transition-colors">
                                        <input
                                          type="checkbox"
                                          checked={Boolean(val)}
                                          onChange={(e) => handleFieldChange(nodeCfg.nodeId, param.paramKey, e.target.checked)}
                                          className="size-4 rounded border-[#B0BA99] text-[#9D6638] focus:ring-[#9D6638]"
                                        />
                                        <span className="text-xs font-bold text-[#4E220F]">
                                          {Boolean(val) ? 'Enabled' : 'Disabled'}
                                        </span>
                                      </label>
                                    ) : param.enumOptions && param.enumOptions.length > 0 ? (
                                      <select
                                        value={String(val)}
                                        onChange={(e) =>
                                          handleFieldChange(nodeCfg.nodeId, param.paramKey, e.target.value)
                                        }
                                        className="w-full rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/60 px-3 py-1.5 text-xs text-[#4E220F] font-bold focus:border-[#9D6638] focus:outline-none"
                                      >
                                        {param.enumOptions.map((opt) => (
                                          <option key={String(opt)} value={String(opt)}>
                                            {param.enumLabels?.[String(opt)] || String(opt)}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input
                                        type={param.type === 'number' || param.type === 'integer' ? 'number' : 'text'}
                                        value={String(val)}
                                        onChange={(e) =>
                                          handleFieldChange(
                                            nodeCfg.nodeId,
                                            param.paramKey,
                                            param.type === 'number' || param.type === 'integer'
                                              ? Number(e.target.value)
                                              : e.target.value,
                                        )
                                      }
                                      className="w-full rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/60 px-3 py-1.5 text-xs text-[#4E220F] font-medium focus:border-[#9D6638] focus:outline-none"
                                    />
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="border-t border-[#B0BA99]/40 bg-[#EDE5CD]/50 px-6 py-4 space-y-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-[#7C5339]/70 hover:bg-[#EDE5CD] hover:text-[#7C5339] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={checkingExisting || startBlockedReason !== null}
                title={startBlockedReason || `Start ${stepCount} step${stepCount === 1 ? '' : 's'} — runs in background`}
                className="inline-flex items-center gap-2 rounded-xl bg-[#9D6638] px-5 py-2.5 text-xs font-bold text-[#FDFBF7] shadow-sm hover:bg-[#86542C] transition-all active:scale-95 disabled:opacity-50"
              >
                <Play className="size-3.5 fill-current" />
                {checkingExisting ? 'Verifying...' : `Start · ${stepCount} step${stepCount === 1 ? '' : 's'}`}
              </button>
            </div>
            <p className="text-[11px] text-[#7C5339] text-right">
              {startBlockedReason || 'Runs in background — progress in Activity & Records.'}
            </p>
          </div>
        </form>
      )}
    </div>
  </div>
)
}
