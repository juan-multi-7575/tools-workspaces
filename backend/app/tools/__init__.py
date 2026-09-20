from app.registry import register, register_alias
from app.tools.audio_processor import AudioProcessorTool
from app.tools.downloader import DownloaderTool, TrimmerTool, TranscriberTool, PackagerTool
from app.tools.media.url_resolver import UrlResolverTool
from app.tools.media.format_selector import FormatSelectorTool
from app.tools.media.subtitle_fetcher import SubtitleFetcherTool
from app.tools.media.thumbnail_fetcher import ThumbnailFetcherTool
from app.tools.mediainfo_tool import (
    MediainfoTool,
    StreamlinkTool,
    OcrmypdfTool,
    SoxTool,
    GallerydlTool,
    DemucsTool,
)
from app.tools.doc_tools import PandocTool, PdfTools
from app.tools.image_tools import ImageMagickTool, ExifScrubberTool
from app.tools.security_tools import CodecTool
from app.tools.ai_tools import SummarizerTool
from app.tools.translator_tool import SubtitleTranslatorTool
from app.tools.text.llm_translator import LlmTranslatorTool
from app.tools.model_health_tool import ModelHealthCheckTool
from app.tools.script_runner import ScriptRunnerTool

_downloader_instance = DownloaderTool()
_srt_translator_instance = SubtitleTranslatorTool()
_llm_translator_instance = LlmTranslatorTool()
_health_check_instance = ModelHealthCheckTool()

ALL_TOOLS = [
    # Newly added & Featured Tools (Top Priority)
    _health_check_instance,
    _srt_translator_instance,
    _llm_translator_instance,
    ScriptRunnerTool(),
    SummarizerTool(),
    # Media & Audio
    AudioProcessorTool(),
    _downloader_instance,
    TrimmerTool(),
    TranscriberTool(),
    PackagerTool(),
    MediainfoTool(),
    StreamlinkTool(),
    OcrmypdfTool(),
    SoxTool(),
    GallerydlTool(),
    DemucsTool(),
    # Documents
    PandocTool(),
    PdfTools(),
    # Images
    ImageMagickTool(),
    ExifScrubberTool(),
    # Security
    CodecTool(),
]

for tool in ALL_TOOLS:
    register(tool)

for atomic in (
    UrlResolverTool(),
    FormatSelectorTool(),
    SubtitleFetcherTool(),
    ThumbnailFetcherTool(),
):
    register(atomic, _source=__file__)

register_alias("downloader", _downloader_instance)
register_alias("subtitle_translator", _srt_translator_instance)
register_alias("ai_model_health_check", _health_check_instance)

# Auto-discover and register any custom or future tools dropped into app/tools/custom/
import importlib
import inspect
from pathlib import Path
from app.tools.base import Tool

custom_dir = Path(__file__).parent / "custom"
if custom_dir.exists():
    for f in custom_dir.glob("*.py"):
        if f.stem.startswith("_"):
            continue
        try:
            mod = importlib.import_module(f"app.tools.custom.{f.stem}")
            for attr_name in dir(mod):
                cls = getattr(mod, attr_name)
                if inspect.isclass(cls) and issubclass(cls, Tool) and cls is not Tool and hasattr(cls, "manifest"):
                    register(cls())
        except Exception:
            pass
