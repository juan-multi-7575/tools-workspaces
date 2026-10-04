import { useRef, useState, type CSSProperties } from 'react'
import {
  Languages,
  FileText,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import UniversalFileInput from '../common/UniversalFileInput'
import { useHostSkin } from '../../lib/hostSkin'

interface TranslatorFormProps {
  value?: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  availableArtifacts?: { name: string; path: string; kind?: string }[]
}

const POPULAR_LANGUAGES = [
  'English',
  'Korean',
  'Japanese',
  'Spanish',
  'French',
  'German',
  'Chinese',
  'Hindi',
  'Portuguese',
  'Italian',
  'Arabic',
  'Russian',
]

const SOURCE_LANGUAGES = [
  { id: 'auto', name: 'Auto-detect Language' },
  { id: 'Korean', name: 'Korean (한국어)' },
  { id: 'Japanese', name: 'Japanese (日本語)' },
  { id: 'Chinese', name: 'Chinese (中文)' },
  { id: 'Spanish', name: 'Spanish (Español)' },
  { id: 'French', name: 'French (Français)' },
  { id: 'German', name: 'German (Deutsch)' },
  { id: 'Hindi', name: 'Hindi (हिन्दी)' },
  { id: 'English', name: 'English' },
]

export default function TranslatorForm({
  value = {},
  onChange,
  availableArtifacts = [],
}: TranslatorFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  // The SRT page's shell is cream; this form is also mounted on boards that are
  // not, so it reads whichever one it landed on.
  const rootRef = useRef<HTMLDivElement>(null)
  const skin = useHostSkin(rootRef)

  const inputPath = String(value.input_path ?? '')
  const targetLang = String(value.target_lang ?? 'English')
  const sourceLang = String(value.source_lang ?? 'auto')
  const provider = String(value.provider ?? 'auto')
  const model = String(value.model ?? 'auto')
  const batchSize = Number(value.batch_size ?? 50)

  const setField = (key: string, val: unknown) => {
    const next = { ...value }
    if (val === undefined || val === '') {
      delete next[key]
    } else {
      next[key] = val
    }
    onChange(next)
  }

  return (
    <div ref={rootRef} className="tool-form space-y-4" data-tone={skin.tone} style={{ '--tool-ink': skin.ink } as CSSProperties}>
      {/* ========================================================================= */}
      {/* 1. INPUT SUBTITLE / DOCUMENT FILE (MAIN FOCUS)                            */}
      {/* ========================================================================= */}
      <div className="tool-panel rounded-2xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 font-bold text-xs">
            <span className="tool-on-accent flex size-6 items-center justify-center rounded-lg">
              <FileText className="size-3.5" />
            </span>
            <span>Subtitle or Document File</span>
            <span className="tool-accent-chip font-mono text-xs font-bold px-2 py-0.5 rounded-full">
              REQUIRED (.srt, .vtt, .txt)
            </span>
          </label>
        </div>

        <UniversalFileInput
          value={inputPath}
          onChange={(p) => setField('input_path', p)}
          placeholder="Select .srt, .vtt, or .txt file or enter path..."
          accept=".srt,.vtt,.txt,.md"
          filterExtensions={['.srt', '.vtt', '.txt', '.md']}
          availableArtifacts={availableArtifacts}
        />

        <p className="text-xs tool-muted">
          The translator strictly preserves all subtitle cue numbers, line sequencing, and exact millisecond timecodes (<code>00:00:00,000 --&gt; 00:00:00,000</code>).
        </p>
      </div>

      {/* ========================================================================= */}
      {/* 2. LANGUAGE CONFIGURATION (TARGET & SOURCE)                               */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Target Language */}
        <div className="tool-panel rounded-2xl border p-3.5 space-y-2">
          <label className="flex items-center gap-1.5 font-bold text-xs">
            <Languages className="size-3.5 tool-accent-text" />
            <span>Target Language</span>
            <span className="tool-accent-chip font-mono text-xs font-bold px-1.5 py-0.2 rounded-full">
              OUTPUT
            </span>
          </label>
          <select
            value={targetLang}
            onChange={(e) => setField('target_lang', e.target.value)}
            className="tool-well w-full rounded-xl px-3 py-2 text-xs font-bold"
          >
            {POPULAR_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang === 'English' ? '🇬🇧 English (Default)' : lang}
              </option>
            ))}
          </select>
          <p className="text-xs tool-muted">Translates dialogue into natural, fluent {targetLang}.</p>
        </div>

        {/* Source Language */}
        <div className="tool-panel rounded-2xl border p-3.5 space-y-2">
          <label className="flex items-center gap-1.5 font-bold text-xs">
            <Sparkles className="size-3.5 tool-accent-text" />
            <span>Source Language</span>
            <span className="tool-accent-chip font-mono text-xs font-semibold px-1.5 py-0.2 rounded-full">
              ORIGINAL
            </span>
          </label>
          <select
            value={sourceLang}
            onChange={(e) => setField('source_lang', e.target.value)}
            className="tool-well w-full rounded-xl px-3 py-2 text-xs font-bold"
          >
            {SOURCE_LANGUAGES.map((sl) => (
              <option key={sl.id} value={sl.id}>
                {sl.name}
              </option>
            ))}
          </select>
          <p className="text-xs tool-muted">Auto-detects spoken dialect or specify source explicitly.</p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. COLLAPSIBLE ADVANCED AI OPTIONS                                        */}
      {/* ========================================================================= */}
      <div className="tool-panel-quiet rounded-2xl border overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="tool-panel-quiet w-full flex items-center justify-between p-3 text-xs font-bold border-b"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="size-3.5 tool-accent-text" />
            Advanced AI Translation Settings
          </span>
          <span className="flex items-center gap-1 font-mono text-xs tool-muted">
            {showAdvanced ? 'Collapse' : 'Expand'}
            {showAdvanced ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </span>
        </button>

        {showAdvanced && (
          <div className="tool-panel space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Provider Selection */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold">AI Translation Provider</label>
                <select
                  value={provider}
                  onChange={(e) => setField('provider', e.target.value)}
                  className="tool-well w-full rounded-xl px-3 py-2 text-xs font-mono font-medium"
                >
                  <option value="auto">⚡ Auto (Fastest: Groq ➔ NVIDIA ➔ OpenAI)</option>
                  <option value="groq">Groq (Llama / Qwen - Ultra Fast Subtitles)</option>
                  <option value="nvidia">NVIDIA NIM (Nemotron / Llama 3.1)</option>
                  <option value="openai">OpenAI (GPT-4o-mini)</option>
                  <option value="deepseek">DeepSeek (DeepSeek-V3 Chat)</option>
                  <option value="gemini">Google Gemini (Gemini 2.0 Flash)</option>
                  <option value="anthropic">Anthropic (Claude 3.5 Haiku)</option>
                </select>
                <p className="text-xs tool-muted">
                  Keys detected automatically from <code>~/.bashrc</code> with zero disk persistence.
                </p>
              </div>

              {/* Model Override */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold">Model Override (Optional)</label>
                <input
                  type="text"
                  value={model === 'auto' ? '' : model}
                  onChange={(e) => setField('model', e.target.value.trim() || 'auto')}
                  placeholder="e.g. qwen/qwen3-27b, or blank for auto"
                  className="tool-well w-full rounded-xl px-3 py-2 text-xs font-mono"
                />
                <p className="text-xs tool-muted">Leave blank to use provider default translation model.</p>
              </div>
            </div>

            {/* Batch Size Slider / Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold">
                <span>Subtitle Cues per Batch</span>
                <span className="font-mono text-xs tool-accent-text">{batchSize} cues</span>
              </div>
              <input
                type="range"
                min={20}
                max={100}
                step={10}
                value={batchSize}
                onChange={(e) => setField('batch_size', Number(e.target.value))}
                className="tool-checkbox w-full cursor-pointer"
              />
              <p className="text-xs tool-muted">
                Keeps context size balanced for optimal conversational flow and speed (default: 50 cues).
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
