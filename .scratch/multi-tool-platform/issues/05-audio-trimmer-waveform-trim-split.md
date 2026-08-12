# 05 — Audio trimmer (waveform trim/split)

**What to build:** The audio trimmer tool shows a scrollable waveform (Wavesurfer.js) with a duration ruler. A user marks one region and trims to a single clip, or marks multiple regions and splits them into segment files.

**Blocked by:** 02 — Audio processor tool end-to-end

**Status:** ready-for-agent

- [ ] A user loads an audio artifact and sees a waveform with a scrollable duration ruler that tracks playback and region markers
- [ ] A user marks one region and trims — the tool produces one clipped output
- [ ] A user marks multiple regions and splits — the tool produces segment files for each marked region
- [ ] Region marking and splitting work standalone and inside a Workspace pipeline
- [ ] **Testing:** API-level tests trim and split an audio fixture and assert the resulting clips/segments and their timestamps on disk
