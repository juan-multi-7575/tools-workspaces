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

_downloader_instance = DownloaderTool()

for tool in [
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
]:
    register(tool)

for atomic in (
    UrlResolverTool(),
    FormatSelectorTool(),
    SubtitleFetcherTool(),
    ThumbnailFetcherTool(),
):
    register(atomic, _source=__file__)

register_alias("downloader", _downloader_instance)
