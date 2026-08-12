# Speech-to-Text / Transcription Provider Research

**Date:** 2026-08-11
**Scope:** Speech-to-text (STT) / transcription providers for a local-first media-tools platform.
**Method:** Live search via myo (Hugging Face model registry, Deepgram & AssemblyAI pricing pages). Fields that could not be confirmed against a live source are marked **verify**.

---

## 1. Cloud API providers

| Provider | Type | Models | API key | Licensing | Setup ease |
| --- | --- | --- | --- | --- | --- |
| OpenAI Whisper API | Cloud API | `whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe` (verify full list) | Required | Proprietary API; open Whisper weights (MIT) are separate | Easy |
| Groq Whisper | Cloud API | Whisper `large-v3`, `large-v3-turbo` on LPU; newer Groq audio models (verify) | Required | API hosting of open Whisper weights | Easy |
| Deepgram | Cloud API (self-hosted enterprise too) | Nova-3 family, Deepgram Whisper Cloud; Astral-2 (verify) | Required | Proprietary API | Easy |
| AssemblyAI | Cloud API | Universal-3.5 Pro, Universal-2 (+ Streaming / Sync APIs, Speech Understanding) | Required | Proprietary API | Easy |
| Speechmatics | Cloud API + on-prem (Speechmatics Anywhere) | Amber (universal), Flow (realtime), Babel (low-resource) (verify current names) | Required | Proprietary; enterprise on-prem | Easy (cloud) / heavier (on-prem) |
| Gladia | Cloud API | Fast (distil-whisper) / Accurate (whisper-large-v3-turbo) tiers (verify) | Required | Proprietary API | Easy |
| ElevenLabs STT (Scribe) | Cloud API | Scribe v1 (verify v2) | Required | Proprietary API | Easy |
| Azure AI Speech | Cloud API | Standard, Universal (Whisper-style), Custom Speech; gpt-4o-transcribe route (verify) | Required | Proprietary cloud | Easy-moderate (Azure SDK) |
| Google Cloud STT | Cloud API | Chirp 3 (preview), Chirp 2, Chirp; classic models (verify) | Required | Proprietary cloud | Easy-moderate (gcloud SDK) |
| AWS Transcribe | Cloud API | Amazon Transcribe (batch/realtime/medical); new Amazon AI Speech (verify) | Required (AWS creds) | Proprietary cloud | Easy-moderate (boto3) |
| Rev AI | Cloud API | Ovation (realtime), Spark (verify); human transcription as separate product | Required | Proprietary API | Easy |
| Fireworks AI | Cloud API (serverless) | Hosts open Whisper variants (large-v3, large-v3-turbo) + audio models (verify) | Required | Hosts open-weights models (license per model) | Easy |
| Replicate | Cloud API (model hosting) | Community Whisper/faster-whisper/whisper.cpp models; pay-per-run | Required | Hosts many open-weights models (license per model) | Easy |

### Notes (cloud)

- **OpenAI Whisper API** — `whisper-1` is the original upload API; `gpt-4o-transcribe` / `gpt-4o-mini-transcribe` are the newer GPT-4o audio->text models. Pricing ~$0.006/min for whisper-1 (verify exact 2026 rate). One REST call with a key — trivial to integrate.
- **Groq Whisper** — OpenAI-compatible endpoint; historically a free tier. LPU-hosted Whisper is fast. Exact model roster/pricing in 2026: **verify**.
- **Deepgram** — verified live: free $200 credit, pay-as-you-go, no credit card; REST/WSS concurrency tiers; Whisper Cloud capped at concurrency 5. Proprietary Nova models + Whisper hosting.
- **AssemblyAI** — verified live: Universal-3.5 Pro $0.21/hr (18 languages, code-switching), Universal-2 $0.15/hr (99 languages); add-ons: diarization $0.02/hr, medical mode, keyterms prompting.
- **Speechmatics** — strong for language coverage incl. low-resource languages; on-prem "Anywhere" option matters for local-first. 2026 model names: **verify**.
- **Gladia** — Whisper-based tiers plus audio intelligence; cheap pay-as-you-go. Exact 2026 model set: **verify**.
- **ElevenLabs Scribe** — STT sibling to the ElevenLabs TTS platform; supports diarization and long-form. Current version: **verify**.
- **Azure / Google / AWS** — the three hyperscaler STTs. All key-based, strong enterprise compliance; per-minute pricing tiers. Exact 2026 model names flagged verify (cloud model lineups change frequently).
- **Rev AI** — API spin-off of Rev's human transcription business; Ovation is the newer realtime model. Exact current model list: **verify**.
- **Fireworks AI / Replicate** — no proprietary models; they host open Whisper-family weights. Great way to run Whisper without local GPU; per-token/per-second pricing.

---

## 2. Local options

| Provider | Type | Models | API key | Licensing | Setup ease |
| --- | --- | --- | --- | --- | --- |
| faster-whisper | Local (Python, CTranslate2) | CTranslate2 Whisper conversions: tiny -> large-v3, large-v3-turbo, distil-whisper (verified on HF: `Systran/faster-whisper-*`) | None | Code MIT; weights MIT (Whisper) / per-model (distil) | Easy (`pip install faster-whisper`) |
| whisper.cpp | Local (C/C++, GGML) | GGML-quantized Whisper; GGUF Parakeet/nemotron conversions (verified: `handy-computer/parakeet-unified-en-0.6b-gguf`, `nemotron-3.5-asr-*-gguf`) | None | Code MIT; weights per-model | Easy (compile / brew; models auto-download) |
| OpenAI Whisper (transformers) | Local (Python, PyTorch/transformers) | whisper-tiny .. large-v3, large-v3-turbo, distil-whisper (verified on HF: `openai/whisper-*`) | None | Code MIT; transformers Apache-2.0; weights MIT | Easy (pip + transformers pipeline) |
| NVIDIA Parakeet | Local (NeMo / ONNX / MLX / GGUF) | parakeet-tdt-0.6b-v2/v3, parakeet-ctc-1.1b, unified-en-0.6b (verified on HF) | None | CC-BY-4.0 (older); some newer under NVIDIA Open Model License (**verify per model**) | Easy-moderate (NeMo install; TensorRT harder) |
| NVIDIA Canary | Local (NeMo) | Canary-1b (en/de/es/fr), Canary-1b-flash, Canary-Qwen-0.6b (verify) | None | CC-BY-4.0 | Moderate (NeMo toolkit) |
| Vosk | Local (Python/Java/etc., Kaldi-based) | Small prebuilt models (e.g. `vosk-model-small-en-us-0.15`) + larger models from alphacep | None | Apache-2.0 (code + models) | Easy (`pip install vosk` + model download) |
| Coqui STT | Local (Python; DeepSpeech successor) | Coqui STT v1.x English models (0.9.x) | None | MPL-2.0 (verify exact model license) | Easy-moderate; **project archived / stale** |
| Wav2Vec2 / HuBERT | Local (transformers) | wav2vec2-base-960h, wav2vec2-large-xlsr-53 fine-tunes, HuBERT large, MMS multilingual (verified on HF) | None | Code MIT/Apache; **MMS weights CC-BY-NC (verify)**; per-model | Easy (transformers pipeline) |

### Notes (local)

- **faster-whisper** — the pragmatic default for a local-first platform: CTranslate2 is fast on CPU and GPU, no API key, model cache under `~/.cache/huggingface/hub/` (dirs `models--Systran--faster-whisper-*`). Handles word timestamps + VAD.
- **whisper.cpp** — pure-C implementation, ideal for bundling as a native binary or edge/embedded. Model dir typically `./models/ggml-*.bin`; GGUF ecosystem now extends beyond Whisper (Parakeet/nemotron via transcribe.cpp).
- **OpenAI Whisper (transformers)** — the reference implementation; most flexible for fine-tuning and custom pipelines, but slower than faster-whisper on CPU.
- **NVIDIA Parakeet** — strong accuracy/speed balance; NeMo runtime is heavier than faster-whisper, but ONNX/MLX/GGUF ports (verified) lower the integration cost.
- **NVIDIA Canary** — multilingual (en/de/es/fr) sibling to Parakeet, good diarization ecosystem in NeMo.
- **Vosk** — lightweight offline models, tiny footprint, multi-language; well suited to local-first apps on modest hardware.
- **Coqui STT** — company shut down (2024); repo fork `coqui-ai/STT` survives but is effectively frozen. Prefer other local options unless a legacy model is required.
- **Wav2Vec2 / HuBERT** — older but still solid, especially for fine-tuned per-language models; MMS gives 1100+ languages. Check per-model license (some MMS variants are non-commercial).

---

## 3. Notable 2026 additions observed on Hugging Face (live)

- `Qwen/Qwen3-ASR-0.6B` and `Qwen3-ASR-1.7B` — new ASR models from Alibaba (1M+ downloads).
- `mistralai/Voxtral-Mini-4B-Realtime-2602` — Mistral's realtime speech model.
- `nvidia/nemotron-3.5-asr-streaming-0.6b` — NVIDIA streaming ASR; GGUF ports exist for whisper.cpp/transcribe.cpp.
- `argmaxinc/whisperkit-coreml` — Apple CoreML Whisper for on-device use.
- `distil-whisper/distil-large-v3` — distilled Whisper, popular for fast local CPU inference.

These are candidate "local models auto-detected from the transformers / faster-whisper cache" (see registry design).

---

## 4. Provider registry design

Model the platform's STT integrations as a **provider registry** with two provider classes:

### Registry schema (conceptual)

```yaml
providers:
  - id: deepgram
    kind: cloud            # cloud | local
    auth: api_key          # api_key | none | aws_creds | oauth
    enabled: false
    models:
      - id: nova-3
        default: true
      - id: whisper-cloud
  - id: faster-whisper
    kind: local
    auth: none
    cache_dir: ~/.cache/huggingface/hub   # auto-detection root
    models: []                            # populated by detector
```

- **Cloud providers** — users add an API key per provider in a local settings screen. Keys are stored in the OS keychain / encrypted config, never in plaintext config files. On save, the platform performs a live key validation call (e.g. GET account/balance) and shows per-provider enabled state and selected default model.
- **Model selection** — each provider exposes a model list with metadata: id, size/params, languages, license, realtime support, diarization support. Users pick a default model per provider; batch jobs can override per-job.
- **Local auto-detection** — on startup (and on a "rescan" action) the platform scans known model cache directories:
  - faster-whisper / transformers cache: `~/.cache/huggingface/hub/models--Systran--faster-whisper-*`, `models--openai--whisper-*`, `models--nvidia--parakeet-*`, `models--nvidia--canary-*`, `models--distil-whisper--*`
  - whisper.cpp: `./models/ggml-*.bin` and GGUF files under a user-configured dir
  - NeMo cache: `$NEMO_CACHE` (`~/.cache/torch/NeMo/...`)
  - Detected models are registered automatically (with size, language, license from the model card when available) and flagged as "local / no API key required".
- **Fallback ordering** — jobs default to the fastest available local model; a cloud provider is used only when (a) the user added a key, (b) a local model of sufficient quality isn't available, or (c) the user pins a specific cloud provider.
- **Licensing gate** — because licenses vary (MIT / Apache-2.0 / CC-BY-4.0 / MPL-2.0 / CC-BY-NC), each model record carries its license and the registry blocks or warns on non-commercial (e.g. MMS CC-BY-NC) models in commercial builds.

---

## Search summary

- **Hugging Face (`myo hf models`)** — top-40 and top-20 ASR models by downloads (automatic-speech-recognition pipeline) | 2 calls
- **Web (`myo web read`)** — Deepgram pricing page, AssemblyAI pricing page (2 usage-error retries not counted) | 2 calls
- **Wikipedia (`myo wikipedia summary`)** — 2 calls, both failed with title 404; skipped
- **Gemini (`myo gemini ask`)** — 1 call, timed out (no response); skipped
- **Grok (`myo grok ask`)** — 1 call, auth required (not logged in); skipped
- **Doubao (`myo doubao status`)** — adapter module broken; skipped
