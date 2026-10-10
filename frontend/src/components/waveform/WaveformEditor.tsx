import { useRef, useState } from 'react'
import WaveSurferReact from '@wavesurfer/react'
import type WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import { Scissors, SplitSquareHorizontal, Trash2, Volume2, Clock } from 'lucide-react'
import { themeColor } from '../../lib/themeColors'

export interface Region {
  id: string
  start: number
  end: number
}

export default function WaveformEditor({
  audioUrl,
  onTrim,
}: {
  audioUrl: string
  onTrim: (regions: { start: number; end: number }[]) => Promise<void> | void
}) {
  const regionsRef = useRef(RegionsPlugin.create())
  const [ready, setReady] = useState(false)
  const [regions, setRegions] = useState<Region[]>([])
  const [busy, setBusy] = useState(false)

  const removeRegion = (id: string) => {
    regionsRef.current
      .getRegions()
      .filter((r: { id: string }) => r.id === id)
      .forEach((r: { remove: () => void }) => r.remove())
    setRegions((rs) => rs.filter((r) => r.id !== id))
  }

  const run = async (all: boolean) => {
    const selected = all ? regions : regions.slice(0, 1)
    if (selected.length === 0) return
    setBusy(true)
    try {
      await onTrim(selected.map(({ start, end }) => ({ start, end })))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Waveform visual track */}
      <div className="relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        <div className="mb-2 flex items-center justify-between font-mono text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <Volume2 className="size-3 text-wave-accent" />
            AUDIO TIMELINE
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {ready ? 'WAVEFORM LOADED' : 'INITIALIZING…'}
          </span>
        </div>

        <WaveSurferReact
          height={120}
          waveColor={themeColor('wave-baseline')}
          progressColor={themeColor('wave-accent')}
          cursorColor={themeColor('wave-cursor')}
          url={audioUrl}
          plugins={[regionsRef.current]}
          onReady={(ws: WaveSurfer) => {
            setReady(true)
            regionsRef.current.enableDragSelection({ color: 'rgba(62, 245, 11, 0.2)' })
            regionsRef.current.on('region-created', (region: Region & { id: string }) =>
              setRegions((rs) => [...rs, { id: region.id, start: region.start, end: region.end }]),
            )
            regionsRef.current.on('region-updated', (region: Region & { id: string }) =>
              setRegions((rs) =>
                rs.map((r) => (r.id === region.id ? { ...r, start: region.start, end: region.end } : r)),
              ),
            )
            regionsRef.current.on('region-removed', (region: { id: string }) =>
              setRegions((rs) => rs.filter((r) => r.id !== region.id)),
            )
            void ws
          }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-zinc-400">
        <p className="font-mono text-xs text-zinc-500">
          Click and drag across the waveform to define cutting regions.
        </p>
        <span className="font-mono text-xs text-zinc-400">
          {regions.length} marked region{regions.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Regions List */}
      {regions.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between px-1 pb-1 border-b border-zinc-850 text-xs font-mono text-zinc-500 uppercase tracking-wider">
            <span>Region Index</span>
            <span>Time Bounds (seconds)</span>
            <span>Action</span>
          </div>

          <ul className="space-y-1 max-h-36 overflow-y-auto pr-1">
            {regions.map((r, i) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 border border-zinc-850"
              >
                <span className="font-mono text-xs text-zinc-400">#{i + 1}</span>
                <span className="font-mono text-xs text-zinc-200">
                  {r.start.toFixed(2)}s <span className="text-zinc-600">→</span> {r.end.toFixed(2)}s
                  <span className="ml-2 text-zinc-500">({(r.end - r.start).toFixed(2)}s)</span>
                </span>
                <button
                  onClick={() => removeRegion(r.id)}
                  className="rounded p-1 text-zinc-500 transition-colors hover:bg-wave-error/10 hover:text-wave-error"
                  title="Remove region"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action triggers */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
        <button
          onClick={() => run(false)}
          disabled={!ready || regions.length === 0 || busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-wave-accent px-3.5 py-1.5 text-xs font-semibold text-zinc-950 transition-all duration-150 hover:bg-wave-accent-hover active:scale-[0.99] disabled:opacity-40"
        >
          <Scissors className="size-3.5" />
          {busy ? 'Processing…' : 'Trim to First Region'}
        </button>

        <button
          onClick={() => run(true)}
          disabled={!ready || regions.length < 2 || busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-zinc-200 transition-all duration-150 hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-40"
        >
          <SplitSquareHorizontal className="size-3.5" />
          Split ({regions.length} Segments)
        </button>
      </div>
    </div>
  )
}
