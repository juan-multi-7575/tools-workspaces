import pytest
from app.core.ports import PortKind, PortSpec, is_assignable, normalize_port_type
from app.tools.base import ToolManifest, Artifact, ToolResult


def test_port_kind_backward_compatibility():
    # Existing test assumptions: PortKind has audio, video, text, folder, any attributes
    assert PortKind.audio == "audio"
    assert PortKind.video == "video"
    assert PortKind.text == "text"
    assert PortKind.folder == "folder"
    assert PortKind.any == "any"
    assert PortKind.image == "image"
    assert PortKind.document == "document"


def test_normalize_port_type():
    assert normalize_port_type("audio") == "audio/*"
    assert normalize_port_type("video") == "video/*"
    assert normalize_port_type("image") == "image/*"
    assert normalize_port_type("document") == "document/*"
    assert normalize_port_type("any") == "*/*"
    assert normalize_port_type("application/pdf") == "application/pdf"
    assert normalize_port_type("audio/wav; codec=pcm") == "audio/wav"


def test_is_assignable_wildcard():
    # any satisfies any
    assert is_assignable("any", "audio")
    assert is_assignable("audio", "any")
    assert is_assignable("*/*", "image/png")
    assert is_assignable("image/png", "*/*")


def test_is_assignable_category_subsumption():
    assert is_assignable("audio/wav", "audio/*")
    assert is_assignable("audio/*", "audio/wav")
    assert is_assignable("image/png", "image/jpeg") is False
    assert is_assignable("image/png", "image/*") is True
    assert is_assignable("document/pdf", "audio/*") is False


def test_tool_manifest_pydantic_v2():
    manifest = ToolManifest(
        id="custom_tool",
        name="Custom Tool",
        description="A test tool",
        category="Security",
        tags=["sec", "scanner"],
        input_kinds=[PortKind.text],
        output_kinds=[PortKind.json],
        parameters_schema={"target": {"type": "string"}},
    )
    dump = manifest.model_dump()
    assert dump["id"] == "custom_tool"
    assert dump["category"] == "Security"
    assert "scanner" in dump["tags"]
    assert dump["input_kinds"] == ["text"]
    assert dump["output_kinds"] == ["json"]
