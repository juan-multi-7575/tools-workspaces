from __future__ import annotations

from pathlib import Path
import json
from app.paths import run_dir, tool_downloads_dir
from app.runners.subprocess_runner import AsyncSubprocessRunner
from app.tools.base import Artifact, PortKind, Tool, ToolManifest, ToolResult, ToolRunContext


class PandocTool(Tool):
    manifest = ToolManifest(
        id="pandoc",
        name="Universal Document Converter (Pandoc)",
        description="Convert documents between Markdown, HTML, PDF, DOCX, LaTeX, and plain text formats.",
        category="Documents",
        tags=["document", "pandoc", "converter", "markdown", "html"],
        input_kinds=[PortKind.document, PortKind.text],
        output_kinds=[PortKind.document, PortKind.text],
        parameters_schema={
            "input_path": {
                "type": "string",
                "title": "Input Document File",
                "description": "Path to document, markdown, or text file to convert.",
                "default": "",
            },
            "to": {
                "type": "string",
                "title": "Target Format",
                "enum": ["html", "markdown", "plain"],
                "default": "html",
            },
        },
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        input_path = context.params.get("input_path")
        if not input_path:
            return ToolResult(artifacts=[], status="failed", error="input_path is required")

        src = Path(input_path)
        if not src.exists():
            return ToolResult(artifacts=[], status="failed", error=f"input file not found: {input_path}")

        dest_dir = tool_downloads_dir("pandoc") if context.kind == "standalone" else run_dir(context.workspace_id or "tmp", context.run_id or "tmp")
        dest_dir.mkdir(parents=True, exist_ok=True)

        to_fmt = context.params.get("to", "html")
        ext = "html" if to_fmt == "html" else ("md" if to_fmt == "markdown" else "txt")
        out_name = f"{src.stem}.{ext}"
        out_path = dest_dir / out_name

        cmd = ["pandoc", "-t", to_fmt]
        if to_fmt == "html":
            cmd.append("--standalone")
        cmd += [str(src), "-o", str(out_path)]
        runner = AsyncSubprocessRunner(command=cmd, cwd=dest_dir, timeout=120, tool_id=self.manifest.id)
        try:
            res = await runner.run(cancel_event=context.cancel_event)
        except FileNotFoundError:
            return ToolResult(artifacts=[], status="failed", error="pandoc not installed")
        if res.cancelled:
            return ToolResult(artifacts=[], status="cancelled", error="cancelled")
        if res.timed_out:
            return ToolResult(artifacts=[], status="failed", error=f"pandoc timed out after {res.duration_seconds:.0f}s")
        if res.exit_code != 0 or not out_path.exists():
            return ToolResult(artifacts=[], status="failed", error=res.stderr or f"pandoc exited with {res.exit_code}")

        return ToolResult(
            artifacts=[Artifact(path=str(out_path), kind=PortKind.document, name=out_name)],
            status="completed",
            output_text=f"Successfully converted {src.name} to {out_name}",
        )


class PdfTools(Tool):
    manifest = ToolManifest(
        id="pdf_tools",
        name="PDF Text & Page Utilities",
        description="Extract raw text, inspect metadata, and analyze page structures from PDF documents.",
        category="Documents",
        tags=["pdf", "extractor", "text", "document", "utilities"],
        input_kinds=[PortKind.document],
        output_kinds=[PortKind.text, PortKind.json],
        parameters_schema={
            "input_path": {
                "type": "string",
                "title": "Input PDF File",
                "description": "Path to PDF document to inspect or extract text from.",
                "default": "",
            },
            "action": {
                "type": "string",
                "title": "Action",
                "enum": ["extract_text", "inspect_info"],
                "default": "extract_text",
            },
        },
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        input_path = context.params.get("input_path")
        if not input_path:
            return ToolResult(artifacts=[], status="failed", error="input_path is required")

        src = Path(input_path)
        if not src.exists():
            return ToolResult(artifacts=[], status="failed", error=f"input file not found: {input_path}")

        dest_dir = tool_downloads_dir("pdf_tools") if context.kind == "standalone" else run_dir(context.workspace_id or "tmp", context.run_id or "tmp")
        dest_dir.mkdir(parents=True, exist_ok=True)

        action = context.params.get("action", "extract_text")
        if action not in ("extract_text", "inspect_info"):
            return ToolResult(artifacts=[], status="failed", error=f"unsupported action: {action}")
        out_name = f"{src.stem}_{action}.txt" if action == "extract_text" else f"{src.stem}_info.json"
        out_path = dest_dir / out_name

        if action == "extract_text":
            cmd = ["pdftotext", str(src), str(out_path)]
            runner = AsyncSubprocessRunner(command=cmd, cwd=dest_dir, timeout=120, tool_id=self.manifest.id)
            try:
                res = await runner.run(cancel_event=context.cancel_event)
            except FileNotFoundError:
                return ToolResult(artifacts=[], status="failed", error="pdftotext not installed")
            if res.cancelled:
                return ToolResult(artifacts=[], status="cancelled", error="cancelled")
            if res.timed_out:
                return ToolResult(artifacts=[], status="failed", error=f"pdftotext timed out after {res.duration_seconds:.0f}s")
            if res.exit_code != 0 or not out_path.exists():
                return ToolResult(artifacts=[], status="failed", error=res.stderr or f"pdftotext exited with {res.exit_code}")
            txt = out_path.read_text(encoding="utf-8", errors="replace")
            return ToolResult(
                artifacts=[Artifact(path=str(out_path), kind=PortKind.text, name=out_name)],
                status="completed",
                output_text=txt,
                data={"action": action, "character_count": len(txt)},
            )
        else:
            cmd = ["pdfinfo", str(src)]
            runner = AsyncSubprocessRunner(command=cmd, cwd=dest_dir, timeout=120, tool_id=self.manifest.id)
            try:
                res = await runner.run(cancel_event=context.cancel_event)
            except FileNotFoundError:
                return ToolResult(artifacts=[], status="failed", error="pdfinfo not installed")
            if res.cancelled:
                return ToolResult(artifacts=[], status="cancelled", error="cancelled")
            if res.timed_out:
                return ToolResult(artifacts=[], status="failed", error=f"pdfinfo timed out after {res.duration_seconds:.0f}s")
            if res.exit_code != 0:
                return ToolResult(artifacts=[], status="failed", error=res.stderr or f"pdfinfo exited with {res.exit_code}")
            info = _parse_pdfinfo(res.stdout, src)
            out_path.write_text(json.dumps(info, indent=2), encoding="utf-8")
            return ToolResult(
                artifacts=[Artifact(path=str(out_path), kind=PortKind.json, name=out_name)],
                status="completed",
                data=info,
                output_text=json.dumps(info, indent=2),
            )


def _parse_pdfinfo(output: str, src: Path) -> dict:
    """Parse `pdfinfo` output into a flat JSON-friendly dict."""
    info = {"filename": src.name, "size_bytes": src.stat().st_size}
    for line in output.splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            if key.strip() and value.strip():
                info[key.strip().lower().replace(" ", "_")] = value.strip()
    return info
