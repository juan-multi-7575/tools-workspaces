import { useRef, useState } from 'react'
import WaveSurferReact from '@wavesurfer/react'
import type WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import { Scissors, SplitSquareHorizontal, Trash2 } from 'lucide-react'

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
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-garage-800 bg-garage-900/60">
        <WaveSurferReact
          height={128}
          waveColor="#475569"
          progressColor="#22d3ee"
          cursorColor="#e2e8f0"
          url={audioUrl}
          plugins={[regionsRef.current]}
          onReady={(ws: WaveSurfer) => {
            setReady(true)
            regionsRef.current.enableDragSelection({ color: 'rgba(34,211,238,0.22)' })
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

      <p className="text-xs text-slate-500">
        Drag on the waveform to mark a region. One region = trim; multiple = split into segments.
      </p>

      {regions.length > 0 && (
        <ul className="space-y-1">
          {regions.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-lg bg-garage-900/60 px-3 py-1.5 text-xs text-slate-300">
              <span className="font-mono">
                {r.start.toFixed(2)}s → {r.end.toFixed(2)}s
              </span>
              <button onClick={() => removeRegion(r.id)} className="text-slate-500 hover:text-red-400">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => run(false)}
          disabled={!ready || regions.length === 0 || busy}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-40"
        >
          <Scissors className="h-3.5 w-3.5" /> Trim
        </button>
        <button
          onClick={() => run(true)}
          disabled={!ready || regions.length < 2 || busy}
          className="inline-flex items-center gap-2 rounded-lg border border-garage-700 bg-garage-900 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-garage-800 disabled:opacity-40"
        >
          <SplitSquareHorizontal className="h-3.5 w-3.5" /> Split
        </button>
      </div>
    </div>
  )
}
