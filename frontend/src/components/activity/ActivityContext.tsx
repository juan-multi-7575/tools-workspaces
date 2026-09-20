import React, { createContext, useContext, useState } from 'react'

export interface ToolExecutionRecord {
  id: string
  toolId: string
  toolName: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  startTime: number
  endTime?: number
  durationSeconds?: number
  params: Record<string, unknown>
  artifacts?: { name: string; path: string; kind?: string }[]
  error?: string | null
}

export type ActivityTabType = 'downloads' | 'artifacts' | 'runs'

interface ActivityContextType {
  open: boolean
  setOpen: (open: boolean) => void
  activeTab: ActivityTabType
  setActiveTab: (tab: ActivityTabType) => void
  toolExecutions: ToolExecutionRecord[]
  recordToolExecution: (exec: ToolExecutionRecord) => void
  updateToolExecution: (id: string, updates: Partial<ToolExecutionRecord>) => void
  clearToolExecutions: () => void
  removeToolExecution: (id: string) => void
  onPlayMedia?: (media: { name: string; path: string; kind?: string }) => void
  setOnPlayMedia: (cb: (media: { name: string; path: string; kind?: string }) => void) => void
}

const ActivityContext = createContext<ActivityContextType | null>(null)

export function useActivityTracker() {
  const ctx = useContext(ActivityContext)
  if (!ctx) {
    throw new Error('useActivityTracker must be used within ActivityProvider')
  }
  return ctx
}

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<ActivityTabType>('downloads')
  const [toolExecutions, setToolExecutions] = useState<ToolExecutionRecord[]>([])
  const [onPlayMediaCallback, setOnPlayMediaCallback] = useState<
    ((media: { name: string; path: string; kind?: string }) => void) | undefined
  >()

  const recordToolExecution = (exec: ToolExecutionRecord) => {
    setToolExecutions((prev) => [exec, ...prev.filter((e) => e.id !== exec.id)].slice(0, 50))
  }

  const updateToolExecution = (id: string, updates: Partial<ToolExecutionRecord>) => {
    setToolExecutions((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updates } : e))
    )
  }

  const clearToolExecutions = () => {
    setToolExecutions([])
  }

  const removeToolExecution = (id: string) => {
    setToolExecutions((prev) => prev.filter((e) => e.id !== id))
  }

  return (
    <ActivityContext.Provider
      value={{
        open,
        setOpen,
        activeTab,
        setActiveTab,
        toolExecutions,
        recordToolExecution,
        updateToolExecution,
        clearToolExecutions,
        removeToolExecution,
        onPlayMedia: onPlayMediaCallback,
        setOnPlayMedia: setOnPlayMediaCallback,
      }}
    >
      {children}
    </ActivityContext.Provider>
  )
}
