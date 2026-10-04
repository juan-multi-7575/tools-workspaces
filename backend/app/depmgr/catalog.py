"""Frozen catalog of every external dependency the tool fleet can install.

Design rules (enforced by tests/test_36_depmgr.py):
  * Nothing here needs root, sudo, apt, brew, or a global PATH change.
  * Native binaries come from conda-forge via a user-local micromamba prefix.
  * Pure-Python tools that conda-forge does not carry come from a plain venv.

Each entry owns its own environment prefix under ``<deps_root>/envs/<prefix>``.
Sharing one big prefix was the original sketch, but it makes ``remove(dep_id)``
impossible to do honestly: you cannot delete ffmpeg from a prefix that pandoc
and sox also live in without running a package manager, and you cannot know
which of the prefix's files belong to whom. One prefix per dep means removal is
an honest ``rmtree`` and the on-disk layout always matches the manifest.

``approx_bytes`` is an honest install-size estimate used for the consent prompt.
It is not a promise; ``resolver.check()`` reports measured bytes once installed.
"""

from __future__ import annotations

from dataclasses import dataclass

KIND_CONDA = "conda"
KIND_PIP = "pip"


@dataclass(frozen=True)
class Dep:
    id: str
    kind: str
    packages: tuple[str, ...]
    provides: tuple[str, ...]
    approx_bytes: int
    heavy: bool
    notes: str
    prefix: str
    #: conda-forge only; pip ignores it.
    channel: str = "conda-forge"

    def as_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "kind": self.kind,
            "packages": list(self.packages),
            "provides": list(self.provides),
            "approx_bytes": self.approx_bytes,
            "heavy": self.heavy,
            "notes": self.notes,
            "prefix": self.prefix,
            "channel": self.channel if self.kind == KIND_CONDA else None,
        }


_FFMPEG_NOTE = (
    "ffmpeg/ffprobe decode, trim, convert and probe every media file. "
    "Required by the downloader, trimmer, audio processor and subtitle tools. "
    "conda-forge's ffmpeg build is generously codec'd (av1, vp9, dav1d, x264, "
    "x265), which is why this is the largest non-OCR install despite 'ffmpeg' "
    "sounding small - measured ~660 MB, not the ~80 MB a bare static build would be."
)

CATALOG: tuple[Dep, ...] = (
    Dep(
        id="conda.media",
        kind=KIND_CONDA,
        packages=("ffmpeg",),
        provides=("ffmpeg", "ffprobe"),
        approx_bytes=660_000_000,
        heavy=False,
        notes=_FFMPEG_NOTE,
        prefix="media",
    ),
    Dep(
        id="conda.imagemagick",
        kind=KIND_CONDA,
        packages=("imagemagick",),
        provides=("magick", "identify"),
        approx_bytes=120_000_000,
        heavy=False,
        notes="magick converts, resizes and re-encodes images for the ImageMagick tool.",
        prefix="imagemagick",
    ),
    Dep(
        id="conda.pandoc",
        kind=KIND_CONDA,
        packages=("pandoc",),
        provides=("pandoc",),
        approx_bytes=230_000_000,
        heavy=False,
        notes="pandoc converts Markdown, HTML and Office documents between formats.",
        prefix="pandoc",
    ),
    Dep(
        id="conda.exiftool",
        kind=KIND_CONDA,
        packages=("exiftool",),
        provides=("exiftool",),
        approx_bytes=25_000_000,
        heavy=False,
        notes="exiftool reads and strips EXIF/GPS metadata so photos can be scrubbed privately.",
        prefix="exiftool",
    ),
    Dep(
        id="conda.sox",
        kind=KIND_CONDA,
        packages=("sox",),
        provides=("sox", "soxi"),
        approx_bytes=20_000_000,
        heavy=False,
        notes="sox applies the audio effects (trim, fade, gain, resample) in the sox tool.",
        prefix="sox",
    ),
    Dep(
        id="conda.poppler",
        kind=KIND_CONDA,
        packages=("poppler",),
        provides=("pdftotext", "pdfinfo"),
        approx_bytes=55_000_000,
        heavy=False,
        notes="pdftotext and pdfinfo extract text and page metadata from PDFs.",
        prefix="poppler",
    ),
    Dep(
        id="conda.ytdlp",
        kind=KIND_CONDA,
        packages=("yt-dlp",),
        provides=("yt-dlp",),
        approx_bytes=90_000_000,
        heavy=False,
        notes="yt-dlp downloads media from YouTube and 1000+ supported sites.",
        prefix="ytdlp",
    ),
    Dep(
        id="conda.streamlink",
        kind=KIND_CONDA,
        packages=("streamlink",),
        provides=("streamlink",),
        approx_bytes=90_000_000,
        heavy=False,
        notes="streamlink captures live streams from Twitch and other live platforms.",
        prefix="streamlink",
    ),
    Dep(
        id="conda.ocrmypdf",
        kind=KIND_CONDA,
        packages=("ocrmypdf", "ghostscript", "tesseract"),
        provides=("ocrmypdf",),
        approx_bytes=700_000_000,
        heavy=False,
        notes=(
            "ocrmypdf adds a searchable text layer to scanned PDFs. Pulls in "
            "ghostscript and tesseract, so it is the largest non-multi-GB install."
        ),
        prefix="ocr",
    ),
    Dep(
        id="pip.gallery_dl",
        kind=KIND_PIP,
        packages=("gallery-dl",),
        provides=("gallery-dl",),
        approx_bytes=12_000_000,
        heavy=False,
        notes="gallery-dl scrapes full image galleries from sites that expose no bulk download.",
        prefix="python",
    ),
    Dep(
        id="pip.demucs",
        kind=KIND_PIP,
        packages=("demucs",),
        provides=("demucs",),
        approx_bytes=2_500_000_000,
        heavy=True,
        notes=(
            "demucs splits a track into vocal/drum/bass stems locally. Pulls PyTorch, "
            "which is why this is opt-in: the default torch wheel is the CUDA build "
            "and is roughly 2.5 GB installed. A CPU-only install is far smaller."
        ),
        prefix="demucs",
    ),
)

BY_ID: dict[str, Dep] = {d.id: d for d in CATALOG}

assert len(BY_ID) == len(CATALOG), "duplicate dep id in catalog"
_assert_provided = [c for d in CATALOG for c in d.provides]
assert len(_assert_provided) == len(set(_assert_provided)), "duplicate provided command"


def get(dep_id: str) -> Dep | None:
    return BY_ID.get(dep_id)


def all_deps() -> tuple[Dep, ...]:
    return CATALOG


def deps_for_binaries(commands: list[str]) -> list[Dep]:
    """Reverse lookup: which catalog entries supply any of these command names."""
    wanted = set(commands)
    return [d for d in CATALOG if wanted.intersection(d.provides)]