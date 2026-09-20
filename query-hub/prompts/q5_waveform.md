# Waveform Visualization & In-Browser Audio Scrubbing for Large Media Files (500MB - 2GB)

We are developing an in-browser audio waveform editor (`WaveformEditor.tsx`) in React for a media processing workbench.
Users routinely work with long-form audio/video files: 1-hour to 3-hour podcasts, lecture recordings, and video sound tracks ranging from 200MB to 1.5GB (in WAV, FLAC, AAC, or MP3).

We are hitting architectural trade-offs around memory usage, responsiveness, and clipping fidelity:

1. **Memory Limits & Waveform Generation**:
   - Decoding an entire 2-hour uncompressed PCM audio buffer in the browser via `AudioContext.decodeAudioData()` consumes 1.5GB to 2.5GB of client RAM and can crash the tab.
   - What is the industry standard architecture for this in modern web apps? Should the backend generate and cache a compact waveform peaks array (e.g. via `audiowaveform` CLI or `ffmpeg` astats/showwavespic JSON) and serve it via REST? What data format and sample resolution (e.g. 100 peaks per second vs adaptive LOD) works best?
2. **Smooth Scrubbing & Multi-Level LOD Rendering**:
   - Users need to zoom seamlessly from the entire 3-hour macro overview down to individual millisecond words for precise cut boundaries.
   - How should the canvas rendering engine handle Level-of-Detail (LOD)? Should the frontend request windowed peak ranges from the backend as the user pans/zooms, or load a multi-resolution pyramid structure up front?
3. **Lossless Trimming & Export Execution**:
   - When the user defines in/out points and clicks "Export Cut":
   - Option A: Trim client-side using WebAssembly ffmpeg (heavy, limited to memory).
   - Option B: Dispatch an ffmpeg task to the local FastAPI backend with `-ss` and `-to`.
   - If using the backend, how should stream copy (`-c copy`) keyframe snapping issues be reconciled with frame-accurate or sample-accurate cuts? Is hybrid re-encoding only around the cut boundary (smart-rendering) feasible or necessary?
