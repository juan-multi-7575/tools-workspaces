export interface StarterWorkflow {
  name: string
  chain: string[]
  desc: string
  defaultParams?: Record<string, Record<string, any>>
}

export const STARTER_WORKFLOWS: StarterWorkflow[] = [
  {
    name: '🌐 YouTube to English Subtitles (Translated)',
    chain: ['media.download.yt-dlp', 'audio_processor', 'transcriber'],
    desc: 'Download ➔ Audio Extract ➔ Whisper Translate directly to English SRT',
    defaultParams: {
      transcriber: {
        task: 'translate',
        output_format: 'srt',
      },
    },
  },
  {
    name: '🎬 Video to Original Subtitles (SRT)',
    chain: ['media.download.yt-dlp', 'audio_processor', 'transcriber'],
    desc: 'Download ➔ Audio Extract ➔ Whisper Transcribe (Original Language)',
    defaultParams: {
      transcriber: {
        task: 'transcribe',
        output_format: 'srt',
      },
    },
  },
  {
    name: '🤖 AI Subtitle Translator (LLM)',
    chain: ['media.download.yt-dlp', 'audio_processor', 'transcriber', 'subtitle.translate.srt'],
    desc: 'Download ➔ Transcribe ➔ LLM Translate to Target Language',
    defaultParams: {
      transcriber: {
        task: 'transcribe',
        output_format: 'srt',
      },
      'subtitle.translate.srt': {
        target_lang: 'English',
        provider: 'groq',
      },
    },
  },
  {
    name: '🎵 Video to Audio Extractor',
    chain: ['media.download.yt-dlp', 'audio_processor'],
    desc: 'Download ➔ Extract High-Quality WAV/MP3',
    defaultParams: {
      audio_processor: {
        output_format: 'wav',
      },
    },
  },
  {
    name: '📝 Video to AI Summary & Insights',
    chain: ['media.download.yt-dlp', 'audio_processor', 'transcriber', 'summarizer'],
    desc: 'Download ➔ Transcribe ➔ Executive Summary',
    defaultParams: {
      transcriber: {
        task: 'transcribe',
        output_format: 'srt',
      },
      summarizer: {
        format: 'bullet_points',
      },
    },
  },
]

