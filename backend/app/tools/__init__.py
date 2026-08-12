from app.registry import register
from app.tools.audio_processor import AudioProcessorTool
from app.tools.downloader import DownloaderTool, TrimmerTool, TranscriberTool, PackagerTool
from app.tools.mediainfo_tool import (
    MediainfoTool,
    StreamlinkTool,
    OcrmypdfTool,
    SoxTool,
    GallerydlTool,
    DemucsTool,
)

for tool in [
    AudioProcessorTool(),
    DownloaderTool(),
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
