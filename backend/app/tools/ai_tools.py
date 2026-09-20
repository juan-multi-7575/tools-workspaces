from __future__ import annotations

import re
from pathlib import Path
from app.paths import run_dir, tool_downloads_dir
from app.tools.base import Artifact, PortKind, Tool, ToolManifest, ToolResult, ToolRunContext


class SummarizerTool(Tool):
    manifest = ToolManifest(
        id="summarizer",
        name="AI Document & Transcript Summarizer",
        description="Generate executive summaries, key takeaways, and bulleted digests from text and transcripts.",
        category="AI & Tutoring",
        tags=["ai", "summarizer", "notes", "digest", "tutoring"],
        input_kinds=[PortKind.text, PortKind.document, PortKind.any],
        output_kinds=[PortKind.document, PortKind.text],
        parameters_schema={
            "text": {
                "type": "string",
                "title": "Input Text",
                "description": "Enter or paste raw text/transcript to summarize (or select file below).",
                "widget": "textarea",
                "default": "",
                "placeholder": "Paste transcript, lecture notes, or document excerpt here...",
            },
            "input_path": {
                "type": "string",
                "title": "Input File (Optional)",
                "description": "Path to document file to summarize.",
                "default": "",
            },
            "max_bullets": {
                "type": "number",
                "title": "Maximum Key Takeaways",
                "description": "Number of key takeaway bullet points to extract.",
                "default": 5,
            },
            "format": {
                "type": "string",
                "title": "Output Format",
                "enum": ["markdown", "plain"],
                "default": "markdown",
            },
        },
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        input_path = context.params.get("input_path")
        content = ""
        if input_path and Path(input_path).exists():
            content = Path(input_path).read_text(encoding="utf-8", errors="replace")
        elif "text" in context.params and str(context.params["text"]).strip():
            content = str(context.params["text"]).strip()
        else:
            return ToolResult(artifacts=[], status="failed", error="Please provide text or an input file to summarize.")

        dest_dir = tool_downloads_dir("summarizer") if context.kind == "standalone" else run_dir(context.workspace_id or "tmp", context.run_id or "tmp")
        dest_dir.mkdir(parents=True, exist_ok=True)

        try:
            max_bullets = int(context.params.get("max_bullets", 5))
        except (TypeError, ValueError):
            return ToolResult(artifacts=[], status="failed", error="max_bullets must be a number")
        sentences = [s.strip() for s in re.split(r"[.!?\n]+", content) if len(s.strip()) > 15]
        selected = sentences[:max_bullets] if sentences else ["No substantial text extracted to summarize."]

        out_name = "summary.md"
        out_path = dest_dir / out_name
        md_lines = ["# Executive Summary\n", "## Key Takeaways\n"]
        for s in selected:
            md_lines.append(f"- {s}.")

        md_content = "\n".join(md_lines)
        out_path.write_text(md_content, encoding="utf-8")
        return ToolResult(
            artifacts=[Artifact(path=str(out_path), kind=PortKind.document, name=out_name)],
            status="completed",
            data={
                "title": "Executive Summary",
                "takeaways": selected,
                "bullet_count": len(selected),
                "markdown": md_content,
            },
            output_text=md_content,
        )
