from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


class PortKind(str):
    """Open, string-compatible PortKind allowing any MIME type while preserving
    classic attribute access (PortKind.audio, PortKind.any, etc.) for backward compatibility.
    """
    any: str = "any"
    audio: str = "audio"
    video: str = "video"
    text: str = "text"
    folder: str = "folder"
    image: str = "image"
    document: str = "document"
    code: str = "code"
    binary: str = "binary"
    json: str = "json"
    csv: str = "csv"
    stream: str = "stream"

    @classmethod
    def __get_pydantic_core_schema__(cls, source_type: Any, handler: Any) -> Any:
        from pydantic_core import core_schema
        return core_schema.no_info_after_validator_function(
            lambda v: str(v),
            core_schema.str_schema(),
        )


class PortSpec(BaseModel):
    name: str
    kind: PortKind = PortKind.any
    mime_type: str | None = None
    description: str | None = None
    required: bool = True
    cardinality: Literal["single", "multiple"] = "single"


def normalize_port_type(port_type: str | PortKind) -> str:
    """Normalize a port type or legacy kind into a standard MIME-like string."""
    if not port_type:
        return "*/*"
    raw = str(port_type).split(";")[0].strip().lower()
    legacy_map = {
        "any": "*/*",
        "audio": "audio/*",
        "video": "video/*",
        "text": "text/*",
        "folder": "directory/*",
        "image": "image/*",
        "document": "document/*",
        "code": "text/code",
        "binary": "application/octet-stream",
        "json": "application/json",
        "csv": "text/csv",
        "stream": "stream/*",
    }
    return legacy_map.get(raw, raw)


def is_assignable(source_type: str | PortKind, target_type: str | PortKind) -> bool:
    """Checks whether an output port of source_type can satisfy an input port of target_type.
    Supports wildcards (*/*, audio/*, image/*) and exact subtype matching.
    """
    src = normalize_port_type(source_type)
    tgt = normalize_port_type(target_type)

    if tgt == "*/*" or src == "*/*" or tgt == "any" or src == "any":
        return True
    if src == tgt:
        return True

    src_parts = src.split("/", 1)
    tgt_parts = tgt.split("/", 1)

    if len(src_parts) == 2 and len(tgt_parts) == 2:
        src_cat, src_sub = src_parts
        tgt_cat, tgt_sub = tgt_parts
        if tgt_cat == src_cat:
            if tgt_sub == "*" or src_sub == "*":
                return True

    return False
