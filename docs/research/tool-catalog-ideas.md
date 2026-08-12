# Tool Catalog Ideas — Additional CLI Tools for the Media Workspace

**Date:** 2026-08-11
**Scope:** Candidate local-first (offline-capable, subprocess-spawned) CLI tools to add to the media-tools platform beyond yt-dlp / ffmpeg / waveform-trim / STT / archive packager.
**Method:** Live search via myo (Gemini web + Google). Facts not confirmed against a live source are marked **verify**. All tools are assumed spawnable as local subprocesses from the FastAPI backend unless noted.

> **Top 5 picks** (see rationale in report): 1. whisper.cpp · 2. ocrmypdf · 3. audiowaveform · 4. streamlink · 5. sox. Close runners-up: gallery-dl, demucs.

---

## Video

| Tool | What it does | Runs / install | License | Why useful | Deps / cloud |
| --- | --- | --- | --- | --- | --- |
| **HandBrakeCLI** | Batch/hardware-accelerated transcoding and quality presets (NVENC, QSV, SVT-AV1) | Binary — `apt install handbrake-cli` (verify package per distro), flatpak, brew | GPLv2 | Higher-level transcode pipelines than raw ffmpeg flags; easy preset profiles for archiving | GPU drivers optional; 100% offline |
| **mkvtoolnix** (`mkvmerge` / `mkvextract`) | Inspect, demux, extract, and losslessly remux MKV containers | Binary — `apt install mkvtoolnix` | GPLv2 | Split/extract audio tracks, streams, and attachments without re-encoding; pairs with existing ffmpeg flow | None |
| **LosslessCut** | Keyframe/frame-accurate lossless cutting (no re-encode) | Binary/npm CLI (**verify** maintained CLI package); core is GUI app | GPLv2 / MIT wrapper (**verify**) | Complements the waveform trim tool: fast lossless "raw cut" before heavier re-encode steps | ffmpeg; 100% offline |

## Audio

| Tool | What it does | Runs / install | License | Why useful | Deps / cloud |
| --- | --- | --- | --- | --- | --- |
| **sox** | Swiss-army audio effect/format CLI (filter, normalize, pitch, chain effects) | Binary — `apt install sox` | GPLv2/LGPL | Quick effect chains and resample/gain tweaks the ffmpeg wrapper doesn't expose | libsox-fmt-all for codecs; 100% offline |
| **demucs** | AI music source separation (vocals / drums / bass / other stems) | Python CLI — `pip install demucs` | MIT | Separates dialogue/music/stems for remixing, karaoke, or cleaner transcription | PyTorch; CUDA recommended; model weights downloaded on first run (net needed once) |
| **audiowaveform** | Renders waveform as JSON or PNG from audio | Binary — brew / apt (**verify** availability) / static binary from GitHub | GPLv3 | Feeds the React UI's waveform view; direct upgrade path to the existing waveform trim tool | libmad/libsndfile/ffmpeg; 100% offline |
| **loudgain** | Loudness normalization / ReplayGain (EBU R128) tagging for audio files | Binary — GitHub release, **verify** apt/brew availability | MIT | Batch-normalizes album/EP loudness so playback levels are consistent | uses ffmpeg/libebur128; 100% offline |

## Image

| Tool | What it does | Runs / install | License | Why useful | Deps / cloud |
| --- | --- | --- | --- | --- | --- |
| **ImageMagick** | Batch image conversion, compositing, thumbnails, watermarking | Binary — `apt install imagemagick` | ImageMagick license (Apache 2.0-compatible) | Thumbnails, format swaps (AVIF/WEBP), and batch edits alongside ffmpeg | optional delegate libs (libheif, libwebp); 100% offline |
| **libvips** (`vipsthumbnail`) | Very fast, low-memory image processing for huge images | Binary — `apt install libvips-tools`; pip `pyvips` | LGPLv2.1+ | Generates thumbnails from giant scans/photos using a fraction of ImageMagick's RAM | None |
| **exiftool** | Read/write/scrub EXIF, GPS, ID3 and other media metadata | Binary — `apt install libimage-exiftool-perl` or author binary | GPLv1+/Artistic | Extract camera info; scrub private metadata before archiving/export | Perl runtime; 100% offline |
| **tesseract** | OCR — extract text from images | Binary — `apt install tesseract-ocr` + language packs | Apache 2.0 | Text from screenshots, video frames, scans; feeds document search | traineddata per language; 100% offline |
| **Real-ESRGAN** (`realesrgan-ncnn-vulkan`) | AI image super-resolution / upscaling | Binary — GitHub release; pip `realesrgan` is slow (**verify** current recommendation) | BSD-3 | Upscale old/low-res photos locally without a GPU-heavy stack | Vulkan GPU optional; model weights downloaded once |

## Document

| Tool | What it does | Runs / install | License | Why useful | Deps / cloud |
| --- | --- | --- | --- | --- | --- |
| **pandoc** | Universal converter (Markdown/HTML/EPUB/DOCX/PDF, …) | Binary — `apt install pandoc` | GPLv2+ | Renders transcripts/summaries to HTML/PDF/EPUB for export | PDF engine (typst/LaTeX) optional for PDF out; 100% offline |
| **poppler-utils** (`pdftotext`, `pdfimages`, `pdfinfo`, `pdftoppm`) | Extract text, raster images, and metadata from PDFs | Binary — `apt install poppler-utils` | GPLv2 | Native PDF text/image extraction for indexing and media library previews | None |
| **ocrmypdf** | Adds a searchable OCR text layer to scanned PDFs | Python CLI — `pip install ocrmypdf` | MPL 2.0 | Makes scans searchable; the natural document complement to the existing transcriber | tesseract + ghostscript (+ optional qpdf); 100% offline |
| **typst** | Fast typesetting/layout engine for PDFs from markup | Binary — cargo/brew/GitHub release | Apache 2.0 | Generates clean report/transcript PDFs faster and simpler than LaTeX | system fonts; 100% offline |
| **calibre** (`ebook-convert`) | E-book conversion and library management | Binary from calibre-ebook.com; pip `calibre` (**verify**); apt is old | GPLv3 | Convert/pipe EPUB/MOBI/AZW3 when media turns into reading material | 100% offline (metadata lookup optional/net) |

## Subtitle

| Tool | What it does | Runs / install | License | Why useful | Deps / cloud |
| --- | --- | --- | --- | --- | --- |
| **subliminal** | Search & download subtitles for movie/episode files | Python CLI — `pip install subliminal` | MIT | Auto-fetch SRT/VTT for downloaded video libraries | **Requires internet** to provider sites (OpenSubtitles, etc.); no key for basic use |
| **ffsubsync** | Auto-synchronize out-of-sync subtitles via speech VAD | Python CLI — `pip install ffsubsync` | MIT | Fixes mis-timed subtitles against the actual audio, fully local | ffmpeg; 100% offline |
| **whisper.cpp** | High-performance local Whisper transcription; exports SRT/VTT | Binary — build from source / `whisper-cli`; pip bindings (**verify** current pkg) | MIT | Fast local STT + timestamped subtitle export; complements/replaces the provider-pluggable transcriber | GGML model weights downloaded once (net needed once); runs on CPU |

## Web downloader (non-YouTube)

| Tool | What it does | Runs / install | License | Why useful | Deps / cloud |
| --- | --- | --- | --- | --- | --- |
| **gallery-dl** | Scrapes image galleries, albums, and art sites (hundreds of hosts) | Python CLI — `pip install gallery-dl` | GPLv3 | Covers the download niche yt-dlp skips (Pixiv, Reddit, Twitter/X, forums, …) | **Requires internet**; optional per-site cookies/API keys |
| **streamlink** | Extracts and streams live/VOD streams (Twitch, YouTube live, …) to player or file | Python CLI — `pip install streamlink` (apt is old) | BSD-2 | Adds live-stream capture and re-streaming the downloader lacks | **Requires internet**; no keys for most sites |
| **aria2** | High-speed multi-protocol downloader (HTTP/FTP/BitTorrent/metadata) | Binary — `apt install aria2` | GPLv2+ | Parallel/segmented bulk downloads; can back yt-dlp as external downloader | **Requires internet** |

## Archival

| Tool | What it does | Runs / install | License | Why useful | Deps / cloud |
| --- | --- | --- | --- | --- | --- |
| **7-Zip** (`7zz` / p7zip) | 7z/zip/tar/rar/gz archives with strong compression | Binary — `apt install p7zip-full`; official `7zz` binary | LGPL (+ unRAR restriction) | Better compression + more formats than the generic packager; password-protected archives | None |
| **zstd** | Meta's fast real-time lossless compressor | Binary — `apt install zstd` | BSD-3/GPL dual | Speed-tier compression for logs, scratch JSON, and intermediate artifacts | None |

## Other / utility

| Tool | What it does | Runs / install | License | Why useful | Deps / cloud |
| --- | --- | --- | --- | --- | --- |
| **mediainfo** | Full technical specs for audio/video/subtitle containers | Binary — `apt install mediainfo` | BSD-2 | JSON/XML metadata (bitrate, codecs, color space) for the React UI and DB schema | None |
| **jdupes** (or **dupeGuru**) | Find and dedupe duplicate files by hash | Binary — `apt install jdupes`; dupeGuru via pip/GUI (**verify**) | jdupes GPLv2 / dupeGuru GPLv3 | Reclaim disk in media libraries; dedupe before archiving | None |
| **beets** | Audio library manager: tag normalization, metadata, organization | Python CLI — `pip install beets` | MIT | Standardizes tags/artwork/layout for a media collection | optional MusicBrainz lookup (net); core fully local |

---

## Integration notes

- **Spawn pattern:** every tool above exposes a plain CLI with stdout/stderr + exit codes, so they fit the existing subprocess runner. Prefer `--json`/machine output where present (mediainfo, audiowaveform, ffprobe).
- **First-run downloads:** demucs, Real-ESRGAN, whisper.cpp fetch model weights once — add a "download model on demand" step rather than bundling.
- **Probe-first design:** `mediainfo`/`ffprobe` should gate downstream tools (HandBrakeCLI, demucs, loudgain) so the backend can refuse jobs on unsupported inputs.
- **Redundancy check:** whisper.cpp overlaps the existing STT provider abstraction; ocrmypdf, poppler-utils, and tesseract overlap each other on PDFs but serve distinct jobs (text layer vs extraction vs image OCR).
- **Uncertain items:** package availability on apt for HandBrakeCLI, audiowaveform, and loudgain varies by distro (**verify** per target OS); LosslessCut CLI distribution status (**verify**).
