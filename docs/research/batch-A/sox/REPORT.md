# SoX — Batch A

Files: `frontend/src/sites/sox/{SoxSite.tsx,Hero.tsx,Workspace.tsx,site.ts,sox.css}`, `frontend/src/tests/soxSite.test.tsx`. The user authorized the one-line existing ImageMagick test change to permit new site registrations.

Reference: brutalist. Plain language, direct typography, no ornamental shell. The brief explicitly replaces the reference's white/system-serif surface with warm near-black, cream, Space Grotesk and JetBrains Mono. The rack adds bordered modules and SVG cables because those are the brief's functional requirements. Keyboard Move up complements drag reordering.

Measurements: hero and workspace at 1440×900, 768×1024 and 390×844: 0 overflowing elements, no page overflow, no forbidden chrome. Missing-dependency Install bottom: 873/900, 997/1024, 819/844. Main ink/ground contrast 13.15:1, amber/ground 7.69:1. See measurements.json.

Real run: generated `/tmp/tone.wav` with `ffmpeg -f lavfi -i sine=frequency=440:duration=1`. Before installation the API returned failed with message `sox not installed` (missing-run.json). Installed conda.sox 14.4.2 with the real pinned Install control. The execution response is in real-run.json: completed, one audio artifact `tone_sox.wav` at the main checkout's downloads/sox path, no data or fabricated metadata. Browser execution loaded the actual WAV in WaveSurfer; Play changed to Pause. A second run retained two blob-backed downloads; changed settings showed a stale warning. Invalid effect showed the backend's SoX error once.

Screenshot review: opened all six viewport screenshots and the success view. Readable cream type, sparse introduction, direct rack. Mobile stage/output content scrolls independently of the install dock. A sine wave's dense waveform appears as a narrow solid band; it is decoded from the real WAV, not drawn as a decorative waveform.

Verification: npm run verify passed, 127/127 tests, TypeScript passed, lint passed with 20 existing warnings. Full log: verify.txt. git diff --check passed.

Limitations: backend unchanged. It overwrites a fixed output filename; this page preserves completed audio bytes only for the current mounted session and warns before running. Other clients and page reloads cannot retain that history. The prompt's requested command order conflicts with execute(): the requested notation is visible, and a second line shows actual input/output/effects order. Before a result returns, output is `<output>`; afterwards its path is taken from the artifact response. Backend output format follows input extension; WAV output was verified using WAV input. Chrome required headless mode because the environment has no display server.
