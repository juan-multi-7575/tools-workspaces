import type { ToolPageComponent } from './toolPageTypes'
import DownloaderPage from '../pages/tools/DownloaderPage'
import TrimmerPage from '../pages/tools/TrimmerPage'
import TranscriberPage from '../pages/tools/TranscriberPage'
import AudioProcessorPage from '../pages/tools/AudioProcessorPage'
import ImageMagickPage from '../pages/tools/ImageMagickPage'
import ExifScrubberPage from '../pages/tools/ExifScrubberPage'
import PandocPage from '../pages/tools/PandocPage'
import PdfToolsPage from '../pages/tools/PdfToolsPage'
import OcrMyPdfPage from '../pages/tools/OcrMyPdfPage'
import PackagerPage from '../pages/tools/PackagerPage'
import MediainfoPage from '../pages/tools/MediainfoPage'
import StreamlinkPage from '../pages/tools/StreamlinkPage'
import SoxPage from '../pages/tools/SoxPage'
import DemucsPage from '../pages/tools/DemucsPage'
import GalleryDlPage from '../pages/tools/GalleryDlPage'
import SummarizerPage from '../pages/tools/SummarizerPage'
import SrtTranslatorPage from '../pages/tools/SrtTranslatorPage'

/**
 * Bespoke per-tool pages. Append-only: each batch adds its own keys.
 * The four atomic media helpers (`media.download.resolve`,
 * `media.download.format_select`, `media.subtitle.fetch`,
 * `media.thumbnail.get`) are intentionally absent — they are rendered as
 * sections inside the downloader page, per the approved design.
 */
export const BESPOKE_PAGES: Record<string, ToolPageComponent> = {
  'media.download.yt-dlp': DownloaderPage,
  trimmer: TrimmerPage,
  transcriber: TranscriberPage,
  audio_processor: AudioProcessorPage,
  imagemagick: ImageMagickPage,
  exif_scrubber: ExifScrubberPage,
  pandoc: PandocPage,
  pdf_tools: PdfToolsPage,
  ocrmypdf: OcrMyPdfPage,
  packager: PackagerPage,
  mediainfo: MediainfoPage,
  streamlink: StreamlinkPage,
  sox: SoxPage,
  demucs: DemucsPage,
  'gallery-dl': GalleryDlPage,
  summarizer: SummarizerPage,
  'subtitle.translate.srt': SrtTranslatorPage,
}