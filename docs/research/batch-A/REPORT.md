# Batch A delivery

Worktree: `../wt-batch-A`; branch: `sites/batch-A`; frontend: http://localhost:5174. Backend on port 8000 remained unchanged. Each tool was committed before work began on the next.

| Tool | Commit | Detailed evidence | Real execution |
| --- | --- | --- | --- |
| SoX | dc21e0e | [Report](sox/REPORT.md) | Installed dependency; real WAV, waveform and playback verified. |
| MediaInfo | 812731d | [Report](mediainfo/REPORT.md) | Real ffprobe response; all 47 leaf keys matched rendered output. |
| Streamlink | 3ae9f1b | [Report](streamlink/REPORT.md) | Real failed execution and installer errors; successful capture unavailable. |
| gallery-dl | cf5c30c | [Report](gallery-dl/REPORT.md) | Real unsupported-URL failure and verified 256-byte ZIP containing the PNG fixture. |

All reports include changed files, reference mapping and deviations, screenshot reviews, measured contrast, actual API responses, verification output and limitations. All four hero/workspace views passed overflow and chrome checks at 1440×900, 768×1024 and 390×844. Missing-dependency Install controls stayed inside the viewport at each size. Screenshots are stored beside the reports and were opened for visual inspection.

Final frontend verification: 139 tests passed, zero failed; TypeScript passed; lint passed with 20 existing warnings. Focused backend Streamlink and gallery-dl failure-contract tests passed. The only shared frontend edit was the user-approved one-line imagemagick discovery-test correction: assert inclusion of imagemagick instead of asserting it is the sole discoverable site.

Streamlink's managed installation could not resolve streamlink from the configured conda channel, and its execution fallback reported missing yt_dlp. No successful recording was fabricated. Fixed backend filenames and session-only output snapshots remain limitations, disclosed in each relevant report and interface. Branch changes have not been merged into the main checkout.
