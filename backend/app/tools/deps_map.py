"""Which managed dependencies each registered tool id needs.

Derived by reading every ``execute()`` and grepping the literal command names it
hands to ``AsyncSubprocessRunner``:

    trimmer / audio_processor      "ffmpeg"                    (downloader.py:806, audio_processor.py:64)
    transcriber                    "ffmpeg"                    (downloader.py:927)
    mediainfo                      "ffprobe"                   (mediainfo_tool.py:33)
    subtitle.translate.srt         "ffprobe" + "ffmpeg"        (subtitles.py:146, subtitles.py:168)
    media.download.yt-dlp          "yt-dlp"                    (downloader.py:260) + ffmpeg for merge/embed
    streamlink                     "streamlink", falls back to "yt-dlp"  (mediainfo_tool.py:83, :99)
    ocrmypdf                       "ocrmypdf"                  (mediainfo_tool.py:139)
    sox                            "sox"                       (mediainfo_tool.py:181)
    gallery-dl                     "gallery-dl"                (mediainfo_tool.py:217)
    demucs                         "demucs"                    (mediainfo_tool.py:263)
    pandoc                         "pandoc"                    (doc_tools.py:52)
    pdf_tools                      "pdftotext" / "pdfinfo"    (doc_tools.py:119, :139)
    imagemagick                    "magick"                    (image_tools.py:50)
    exif_scrubber                  "exiftool"                  (image_tools.py:109, :136)

Tools that shell out to nothing external map to ``[]``. That is a deliberate,
non-empty answer, not a gap: ``packager`` uses ``zipfile``, ``codec_tool`` is
pure Python, ``summarizer`` / ``text.translate.llm`` / ``sys.health.check`` talk
to HTTP APIs from this process, ``script_runner`` only needs the base Python it
already runs on, and the four atomic helpers (``media.download.resolve``,
``media.download.format_select``, ``media.subtitle.fetch``,
``media.thumbnail.get``) are pure parameter plumbing today.
"""

from __future__ import annotations

TOOL_DEPENDENCIES: dict[str, list[str]] = {
    # --- media & audio ---------------------------------------------------
    "media.download.yt-dlp": ["conda.ytdlp", "conda.media"],
    "downloader": ["conda.ytdlp", "conda.media"],  # deprecated alias of the above
    "trimmer": ["conda.media"],
    "transcriber": ["conda.media"],
    "audio_processor": ["conda.media"],
    "mediainfo": ["conda.media"],
    "streamlink": ["conda.streamlink", "conda.ytdlp"],
    "sox": ["conda.sox"],
    "demucs": ["pip.demucs"],
    "subtitle.translate.srt": ["conda.media"],
    "subtitle_translator": ["conda.media"],  # deprecated alias
    # --- documents -------------------------------------------------------
    "pandoc": ["conda.pandoc"],
    "pdf_tools": ["conda.poppler"],
    "ocrmypdf": ["conda.ocrmypdf"],
    # --- images ----------------------------------------------------------
    "imagemagick": ["conda.imagemagick"],
    "gallery-dl": ["pip.gallery_dl"],
    "exif_scrubber": ["conda.exiftool"],
    # --- no external binaries -------------------------------------------
    "packager": [],
    "codec_tool": [],
    "summarizer": [],
    "text.translate.llm": [],
    "sys.health.check": [],
    "ai_model_health_check": [],  # deprecated alias
    "script_runner": [],
    "media.download.resolve": [],
    "media.download.format_select": [],
    "media.subtitle.fetch": [],
    "media.thumbnail.get": [],
}


def deps_for_tool(tool_id: str) -> list[str]:
    return list(TOOL_DEPENDENCIES.get(tool_id, []))


def tools_for_dep(dep_id: str) -> list[str]:
    """Every registered tool id that breaks if ``dep_id`` is removed."""
    return sorted(tid for tid, deps in TOOL_DEPENDENCIES.items() if dep_id in deps)