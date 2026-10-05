# MediaInfo — Batch A

Files: `frontend/src/sites/mediainfo/{MediainfoSite.tsx,Hero.tsx,Workspace.tsx,site.ts,mediainfo.css}` and `frontend/src/tests/mediainfoSite.test.tsx`.

Reference: Observable. White ground, restrained UI, serif explanatory descriptions, and Spline Sans Mono values. Format is a summary band; each codec_type creates its own stream section. Audio/video/subtitle tints are chosen only from the returned codec_type. Divergence: no marketing chart or invented stream graph; actual metadata is the content. Nested JSON keys are flattened to dotted key labels so every measured value can align in a table without gridlines.

Measurements: hero/workspace at 1440×900, 768×1024, 390×844: zero overflowing elements, no page overflow, no forbidden chrome. Before install, Install bottom: 873/900, 997/1024, 819/844. Successful metadata also had zero overflow at all three widths. Contrast: ink/white 16.71:1; secondary/white 6.66:1; ink/audio tint 15.11:1.

Real run: one-second 440Hz `/tmp/tone.wav`, generated with ffmpeg. `real-run.json` contains the full actual API response: completed, `tone_info.json`, format object and one audio stream. Browser-rendered keys matched exactly all 47 leaf fields (including nested disposition keys), verified against that response. Missing stream bit_rate is separately tested with a sparse payload: no bitrate, sample rate or channels are invented. Empty data renders “The probe returned nothing.” Installed conda.media through the pinned control; its real ready chip reports version 9.0.2.

Screenshot review: opened all six empty views and all three successful views. Clear format band, green-tinted audio group, mono numeric alignment and serif section description. At mobile width the intake precedes the report, and the report scrolls above the pinned dock. Table values wrap without hiding keys.

Verification: npm run verify passed: 131/131 tests, TypeScript passed, lint passed with 20 existing warnings. Full output in verify.txt. git diff --check passed.

Limitations: the backend writes a fixed JSON filename. Each successful probe is saved as a JSON blob from its actual parsed data, retained for the current mounted page; history does not survive leaving/reloading. The original system ffprobe could execute despite the manager reporting conda.media missing; the gate followed the manager and a real conda install reconciled readiness. Backend unchanged.
