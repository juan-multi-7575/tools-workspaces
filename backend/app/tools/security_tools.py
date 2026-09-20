from __future__ import annotations

import base64
import urllib.parse
from pathlib import Path
from app.paths import run_dir, tool_downloads_dir
from app.tools.base import Artifact, PortKind, Tool, ToolManifest, ToolResult, ToolRunContext


class CodecTool(Tool):
    manifest = ToolManifest(
        id="codec_tool",
        name="Encoder & Decoder Utilities (Base64 / Hex / URL)",
        description="Encode and decode text and binary payloads with Base64, Hexadecimal, and URL encoding schemes.",
        category="Security",
        tags=["security", "codec", "base64", "hex", "url"],
        input_kinds=[PortKind.any, PortKind.text],
        output_kinds=[PortKind.text],
        parameters_schema={
            "codec": {
                "type": "string",
                "title": "Codec Transformation",
                "enum": [
                    "base64_encode",
                    "base64_decode",
                    "hex_encode",
                    "hex_decode",
                    "url_encode",
                    "url_decode",
                ],
                "default": "base64_encode",
            },
            "text": {
                "type": "string",
                "title": "Input Text",
                "widget": "textarea",
                "description": "Text to encode or decode (or select a file below).",
                "default": "",
                "placeholder": "Enter text to encode or decode...",
            },
            "input_path": {
                "type": "string",
                "title": "Input File (Optional)",
                "description": "Path to file to encode or decode.",
                "default": "",
            },
        },
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        input_path = context.params.get("input_path")
        codec = context.params.get("codec", "base64_encode")
        dest_dir = tool_downloads_dir("codec_tool") if context.kind == "standalone" else run_dir(context.workspace_id or "tmp", context.run_id or "tmp")
        dest_dir.mkdir(parents=True, exist_ok=True)

        if input_path and Path(input_path).exists():
            data = Path(input_path).read_bytes()
        elif "text" in context.params and str(context.params["text"]).strip():
            data = str(context.params["text"]).strip().encode("utf-8")
        else:
            return ToolResult(artifacts=[], status="failed", error="Please provide input text or select an input file.")

        out_name = f"codec_{codec}.txt"
        out_path = dest_dir / out_name

        supported_codecs = {
            "base64_encode", "base64_decode",
            "hex_encode", "hex_decode",
            "url_encode", "url_decode",
        }
        if codec not in supported_codecs:
            return ToolResult(artifacts=[], status="failed", error=f"Unsupported codec: {codec}")

        try:
            if codec == "base64_encode":
                res = base64.b64encode(data).decode("utf-8")
            elif codec == "base64_decode":
                res = base64.b64decode(data).decode("utf-8", errors="replace")
            elif codec == "hex_encode":
                res = data.hex()
            elif codec == "hex_decode":
                res = bytes.fromhex(data.decode("utf-8").strip()).decode("utf-8", errors="replace")
            elif codec == "url_encode":
                res = urllib.parse.quote(data.decode("utf-8", errors="replace"))
            else:
                res = urllib.parse.unquote(data.decode("utf-8", errors="replace"))
        except Exception as e:
            return ToolResult(artifacts=[], status="failed", error=f"Codec transformation failed: {e}")

        out_path.write_text(res, encoding="utf-8")
        return ToolResult(
            artifacts=[Artifact(path=str(out_path), kind=PortKind.text, name=out_name)],
            status="completed",
            data={
                "codec": codec,
                "output": res,
                "length": len(res),
            },
            output_text=res,
        )
