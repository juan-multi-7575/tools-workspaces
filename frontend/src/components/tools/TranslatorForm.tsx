import { useState } from 'react'
import {
  Languages,
  FileText,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import UniversalFileInput from '../common/UniversalFileInput'

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
    <div className="space-y-4 text-brand-espresso">
      {/* ========================================================================= */}
      {/* 1. INPUT SUBTITLE / DOCUMENT FILE (MAIN FOCUS)                            */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-brand-sage bg-surface-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 font-bold text-xs text-brand-espresso">
            <span className="flex size-6 items-center justify-center rounded-lg bg-brand-caramel text-surface-white">
              <FileText className="size-3.5" />
            </span>
            <span>Subtitle or Document File</span>
            <span className="font-mono text-xs font-bold text-brand-espresso px-2 py-0.5 rounded-full bg-brand-sage/40 border border-brand-sage">
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

        <p className="text-xs text-brand-caramel-text">
          The translator strictly preserves all subtitle cue numbers, line sequencing, and exact millisecond timecodes (<code>00:00:00,000 --&gt; 00:00:00,000</code>).
        </p>
      </div>

      {/* ========================================================================= */}
      {/* 2. LANGUAGE CONFIGURATION (TARGET & SOURCE)                               */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Target Language */}
        <div className="rounded-2xl border border-brand-sage bg-surface-white p-3.5 shadow-xs space-y-2">
          <label className="flex items-center gap-1.5 font-bold text-xs text-brand-espresso">
            <Languages className="size-3.5 text-brand-caramel" />
            <span>Target Language</span>
            <span className="font-mono text-xs font-bold text-brand-espresso px-1.5 py-0.2 rounded-full bg-brand-cream-dark border border-brand-sage/60">
              OUTPUT
            </span>
          </label>
          <select
            value={targetLang}
            onChange={(e) => setField('target_lang', e.target.value)}
            className="w-full rounded-xl border border-brand-sage bg-brand-cream/70 px-3 py-2 text-xs font-bold text-brand-espresso focus:border-brand-caramel focus:bg-surface-white focus:outline-none"
          >
            {POPULAR_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang === 'English' ? '🇬🇧 English (Default)' : lang}
              </option>
            ))}
          </select>
          <p className="text-xs text-brand-caramel-text">Translates dialogue into natural, fluent {targetLang}.</p>
        </div>

        {/* Source Language */}
        <div className="rounded-2xl border border-brand-sage bg-surface-white p-3.5 shadow-xs space-y-2">
          <label className="flex items-center gap-1.5 font-bold text-xs text-brand-espresso">
            <Sparkles className="size-3.5 text-brand-caramel" />
            <span>Source Language</span>
            <span className="font-mono text-xs font-semibold text-brand-caramel-text px-1.5 py-0.2 rounded-full bg-brand-cream-dark">
              ORIGINAL
            </span>
          </label>
          <select
            value={sourceLang}
            onChange={(e) => setField('source_lang', e.target.value)}
            className="w-full rounded-xl border border-brand-sage bg-brand-cream/70 px-3 py-2 text-xs font-bold text-brand-espresso focus:border-brand-caramel focus:bg-surface-white focus:outline-none"
          >
            {SOURCE_LANGUAGES.map((sl) => (
              <option key={sl.id} value={sl.id}>
                {sl.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-brand-caramel-text">Auto-detects spoken dialect or specify source explicitly.</p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. COLLAPSIBLE ADVANCED AI OPTIONS                                        */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-brand-sage/70 bg-brand-cream-dark/40 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between p-3 text-xs font-bold text-brand-espresso hover:bg-brand-cream-dark/70 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-brand-caramel" />
            Advanced AI Translation Settings
          </span>
          <span className="flex items-center gap-1 font-mono text-xs text-brand-caramel-text">
            {showAdvanced ? 'Collapse' : 'Expand'}
            {showAdvanced ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </span>
        </button>

        {showAdvanced && (
          <div className="p-3.5 pt-1 space-y-3 border-t border-brand-sage/50 bg-surface-white">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Provider Selection */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-brand-espresso">AI Translation Provider</label>
                <select
                  value={provider}
                  onChange={(e) => setField('provider', e.target.value)}
                  className="w-full rounded-xl border border-brand-sage bg-brand-cream/70 px-3 py-2 text-xs font-mono font-medium text-brand-espresso focus:border-brand-caramel focus:bg-surface-white focus:outline-none"
                >
                  <option value="auto">⚡ Auto (Fastest: Groq ➔ NVIDIA ➔ OpenAI)</option>
                  <option value="groq">Groq (Llama / Qwen - Ultra Fast Subtitles)</option>
                  <option value="nvidia">NVIDIA NIM (Nemotron / Llama 3.1)</option>
                  <option value="openai">OpenAI (GPT-4o-mini)</option>
                  <option value="deepseek">DeepSeek (DeepSeek-V3 Chat)</option>
                  <option value="gemini">Google Gemini (Gemini 2.0 Flash)</option>
                  <option value="anthropic">Anthropic (Claude 3.5 Haiku)</option>
                </select>
                <p className="text-xs text-brand-caramel-text">
                  Keys detected automatically from <code>~/.bashrc</code> with zero disk persistence.
                </p>
              </div>

              {/* Model Override */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-brand-espresso">Model Override (Optional)</label>
                <input
                  type="text"
                  value={model === 'auto' ? '' : model}
                  onChange={(e) => setField('model', e.target.value.trim() || 'auto')}
                  placeholder="e.g. qwen/qwen3.8-27b or auto"
                  className="w-full rounded-xl border border-brand-sage bg-brand-cream/70 px-3 py-2 text-xs font-mono text-brand-espresso focus:border-brand-caramel focus:bg-surface-white focus:outline-none"
                />
                <p className="text-xs text-brand-caramel-text">Leave blank to use provider default translation model.</p>
              </div>
            </div>

            {/* Batch Size Slider / Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-brand-espresso">
                <span>Subtitle Cues per Batch</span>
                <span className="font-mono text-xs text-brand-caramel">{batchSize} cues</span>
              </div>
              <input
                type="range"
                min={20}
                max={100}
                step={10}
                value={batchSize}
                onChange={(e) => setField('batch_size', Number(e.target.value))}
                className="w-full accent-brand-caramel cursor-pointer"
              />
              <p className="text-xs text-brand-caramel-text">
                Keeps context size balanced for optimal conversational flow and speed (default: 50 cues).
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
