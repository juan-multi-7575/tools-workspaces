import pytest
from pathlib import Path

from app.tools.translator_tool import (
    SubtitleTranslatorTool,
    SubtitleCue,
    parse_srt_content,
    parse_vtt_content,
    format_cues_to_srt,
    format_cues_to_vtt,
)


def test_parse_srt_content():
    sample_srt = """1
00:00:01,000 --> 00:00:04,500
인터뷰 때 그 얘기했어?

2
00:00:04,700 --> 00:00:08,200
누가 제일 먼저 결혼할 것 같냐고?
"""
    cues = parse_srt_content(sample_srt)
    assert len(cues) == 2
    assert cues[0].index == 1
    assert cues[0].timing == "00:00:01,000 --> 00:00:04,500"
    assert cues[0].text == "인터뷰 때 그 얘기했어?"

    assert cues[1].index == 2
    assert cues[1].timing == "00:00:04,700 --> 00:00:08,200"
    assert cues[1].text == "누가 제일 먼저 결혼할 것 같냐고?"


def test_parse_vtt_content():
    sample_vtt = """WEBVTT

1
00:00:01.000 --> 00:00:04.500
인터뷰 때 그 얘기했어?

2
00:00:04.700 --> 00:00:08.200
누가 제일 먼저 결혼할 것 같냐고?
"""
    cues = parse_vtt_content(sample_vtt)
    assert len(cues) == 2
    assert cues[0].index == 1
    assert cues[0].text == "인터뷰 때 그 얘기했어?"


def test_format_cues_to_srt_and_vtt():
    cues = [
        SubtitleCue(index=1, timing="00:00:01,000 --> 00:00:04,500", text="Hello world"),
        SubtitleCue(index=2, timing="00:00:05,000 --> 00:00:08,000", text="Second cue"),
    ]
    srt = format_cues_to_srt(cues)
    assert "1\n00:00:01,000 --> 00:00:04,500\nHello world" in srt

    vtt = format_cues_to_vtt(cues)
    assert "WEBVTT" in vtt
    assert "00:00:01.000 --> 00:00:04.500\nHello world" in vtt


def test_parse_batch_response():
    tool = SubtitleTranslatorTool()
    sample_response = """
[1] Did you talk about that in the interview?
[2] Who do you think will get married first?
"""
    parsed = tool._parse_batch_response(sample_response)
    assert parsed[1] == "Did you talk about that in the interview?"
    assert parsed[2] == "Who do you think will get married first?"


def test_subtitle_translator_execution(client, tmp_path, monkeypatch):
    from app.tools.translator_tool import SubtitleTranslatorTool

    srt_file = tmp_path / "sample.ko.srt"
    srt_file.write_text(
        "1\n00:00:01,000 --> 00:00:03,000\n안녕하세요\n\n2\n00:00:03,500 --> 00:00:05,000\n반갑습니다\n",
        encoding="utf-8",
    )

    async def fake_call_llm_chat(self, provider, key, model, system_prompt, user_prompt, timeout=120.0):
        return "[1] Hello\n[2] Nice to meet you"

    monkeypatch.setattr(SubtitleTranslatorTool, "_call_llm_chat", fake_call_llm_chat)
    monkeypatch.setenv("GROQ_API_KEY", "gsk_test_key_for_translation")

    resp = client.post(
        "/api/tools/subtitle_translator/execute",
        json={
            "kind": "standalone",
            "destination": str(tmp_path / "out"),
            "params": {
                "input_path": str(srt_file),
                "target_lang": "English",
                "provider": "groq",
            },
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "completed"
    artifact_names = {a["name"] for a in body["artifacts"]}
    assert "sample.en.srt" in artifact_names
    assert "sample.en.vtt" in artifact_names
    assert "sample_en_clean.txt" in artifact_names

    out_srt = tmp_path / "out" / "sample.en.srt"
    assert out_srt.exists()
    content = out_srt.read_text(encoding="utf-8")
    assert "00:00:01,000 --> 00:00:03,000" in content
    assert "Hello" in content
    assert "Nice to meet you" in content


def test_resolve_input_file_with_brackets(tmp_path, monkeypatch):
    from app import paths

    # Set uploads dir to tmp_path
    monkeypatch.setattr(paths, "UPLOADS", tmp_path / "uploads")
    paths.UPLOADS.mkdir(parents=True, exist_ok=True)

    korean_bracket_file = paths.UPLOADS / "김유정이 [구르미] 테스트.srt"
    korean_bracket_file.write_text("1\n00:00:01,000 --> 00:00:02,000\n안녕\n", encoding="utf-8")

    # Resolving via full path
    res1 = paths.resolve_input_file(str(korean_bracket_file))
    assert res1 is not None and res1.exists()

    # Resolving via bare filename containing brackets
    res2 = paths.resolve_input_file("김유정이 [구르미] 테스트.srt")
    assert res2 is not None and res2.exists()
    assert res2.resolve() == korean_bracket_file.resolve()


def test_upload_api_endpoint(client, tmp_path, monkeypatch):
    from app import paths

    monkeypatch.setattr(paths, "UPLOADS", tmp_path / "uploads")

    # Upload via multipart form
    file_bytes = b"1\n00:00:00,000 --> 00:00:01,000\nTest\n"
    resp = client.post(
        "/api/upload",
        files={"file": ("test_upload [bracket].srt", file_bytes, "text/plain")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "test_upload [bracket].srt"
    assert Path(data["path"]).exists()
    assert Path(data["path"]).read_bytes() == file_bytes
    assert data["kind"] == "srt"

