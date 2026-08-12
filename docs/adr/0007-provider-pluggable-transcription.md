# Provider-pluggable transcription

The transcriber tool is backed by a provider registry rather than a single hardcoded service. Each provider registers its own API-key slot (stored in a local config, never committed) and its model list; local providers are auto-detected from the host's model caches. Initial providers: faster-whisper (local), Groq, and OpenAI Whisper API. Considered and rejected: hardcoding Groq (locks users into one vendor and no offline path) and supporting no cloud providers (loses fast remote transcription).
