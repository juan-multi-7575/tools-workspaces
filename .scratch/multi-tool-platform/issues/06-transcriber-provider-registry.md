# 06 — Transcriber with provider registry

**What to build:** The transcriber tool turns audio into text through a provider registry. A user records audio from the microphone, uploads a single file, or uploads a batch in one control; chooses a provider (faster-whisper local, Groq, OpenAI Whisper API) and a model; and cloud API keys are stored in a local config, never committed.

**Blocked by:** 02 — Audio processor tool end-to-end

**Status:** ready-for-agent

- [ ] A user transcribes recorded microphone audio, a single uploaded file, or a batch of uploaded files
- [ ] A user selects a provider and a model per call; the choice is honored
- [ ] Local providers are auto-detected from host model caches and usable without a key
- [ ] Cloud API keys are stored in a local config and never appear in committed files
- [ ] Transcription runs standalone and as a pipeline step (audio artifact → text artifact)
- [ ] **Testing:** API-level tests assert the selected provider/model is honored with stubbed backends, local model detection works, keys are persisted locally and absent from any repo-visible file, and batch input produces per-file texts
