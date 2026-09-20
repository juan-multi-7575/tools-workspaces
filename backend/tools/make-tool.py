"""One-command scaffold for a new atomic tool (Task 4).

Generates backend/app/tools/<domain>/<stem>.py and
backend/app/tools/<domain>/<stem>.manifest.yaml from a dotted tool id.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path


def split_id(tool_id: str) -> tuple[str, str, str]:
    if "." not in tool_id:
        raise ValueError(f"tool id must be dotted domain.verb.engine form, got {tool_id!r}")
    parts = tool_id.split(".")
    domain = parts[0]
    stem = "_".join(parts[1:])
    cls = "".join(w.capitalize() for p in parts[1:] for w in p.replace("-", "_").split("_")) + "Tool"
    return domain, stem, cls


def render_stub(tool_id: str, cls: str, kind: str, input_kind: str, output_kind: str, runner: str) -> str:
    if runner == "python":
        body = '        raise NotImplementedError("fill in execute")\n'
    else:
        body = (
            "        import subprocess\n"
            "        proc = subprocess.run(\n"
            '            ["echo", "fill in command"],\n'
            "            capture_output=True, text=True, timeout=300,\n"
            "        )\n"
            "        return ToolResult(artifacts=[], status=\"completed\", output_text=proc.stdout)\n"
        )
    return (
        "from app.tools.base import Artifact, Tool, ToolManifest, ToolRunContext, ToolResult\n"
        "\n"
        "\n"
        f"class {cls}(Tool):\n"
        "    manifest = ToolManifest(\n"
        f'        id="{tool_id}",\n'
        f'        name="{cls.removesuffix("Tool")}",\n'
        f'        description="TODO: describe {tool_id}.",\n'
        f'        category="{kind.title()}",\n'
        f'        tags=["{kind}"],\n'
        f'        input_kinds=["{input_kind}"],\n'
        f'        output_kinds=["{output_kind}"],\n'
        '        parameters_schema={"input_path": {"type": "string", "title": "Input path"}},\n'
        "    )\n"
        "\n"
        "    async def execute(self, context: ToolRunContext) -> ToolResult:\n"
        f"{body}"
    )


def render_manifest(tool_id: str, cls: str, kind: str, input_kind: str, output_kind: str) -> str:
    return (
        f'id: "{tool_id}"\n'
        f'name: "{cls.removesuffix("Tool")}"\n'
        f'description: "TODO: describe {tool_id}."\n'
        f'category: "{kind.title()}"\n'
        f'tags: ["{kind}"]\n'
        f'input_kinds: ["{input_kind}"]\n'
        f'output_kinds: ["{output_kind}"]\n'
        "parameters_schema:\n"
        '  input_path: {"type": "string", "title": "Input path"}\n'
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Scaffold a new atomic tool.")
    parser.add_argument("--id", required=True)
    parser.add_argument("--kind", default="general")
    parser.add_argument("--in", dest="input_kind", default="any")
    parser.add_argument("--out", dest="output_kind", default="any")
    parser.add_argument("--runner", choices=["subprocess", "python"], default="subprocess")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    try:
        domain, stem, cls = split_id(args.id)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

    root = Path(".").resolve()
    stub = root / "backend" / "app" / "tools" / domain / f"{stem}.py"
    manifest = root / "backend" / "app" / "tools" / domain / f"{stem}.manifest.yaml"

    if args.dry_run:
        print(stub)
        print(manifest)
        return 0

    for path in (stub, manifest):
        if path.exists():
            raise FileExistsError(f"refusing to overwrite existing tool file: {path}")
    stub.parent.mkdir(parents=True, exist_ok=True)
    stub.write_text(render_stub(args.id, cls, args.kind, args.input_kind, args.output_kind, args.runner))
    manifest.write_text(render_manifest(args.id, cls, args.kind, args.input_kind, args.output_kind))
    print(stub)
    print(manifest)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except FileExistsError as e:
        print(f"error: {e}", file=sys.stderr)
        raise SystemExit(1)
