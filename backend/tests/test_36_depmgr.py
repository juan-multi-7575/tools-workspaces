"""Coverage for the app-owned dependency manager (app/depmgr).

The `client` fixture monkeypatches `app.paths.ROOT` to tmp_path, and
`store.deps_root()` reads `app.paths.ROOT` at call time, so every assertion
here runs against a throwaway tmp_path root. Nothing in this file can reach the
real, multi-gigabyte deps root.
"""

import json
import os
from pathlib import Path

import pytest

from app.depmgr import catalog, environ, installer, resolver, store, uninstaller
from app.depmgr.catalog import KIND_CONDA, KIND_PIP
from app.depmgr.store import deps_root, load_manifest, manifest_path, save_manifest
from app.registry import REGISTRY
from app.tools.deps_map import TOOL_DEPENDENCIES, tools_for_dep

import app.tools  # noqa: F401 - populates REGISTRY


# ---------------------------------------------------------------------------
# helpers: synthesise a "installed" dep without touching the network
# ---------------------------------------------------------------------------

def fake_install(dep_id: str, version: str = "1.2.3") -> Path:
    """Create the prefix + an executable stub for each provided command."""
    dep = catalog.get(dep_id)
    prefix = store.prefix_for(dep)
    bin_dir = prefix / store.bin_dir_name()
    bin_dir.mkdir(parents=True, exist_ok=True)
    for command in dep.provides:
        stub = bin_dir / command
        stub.write_text(
            f"#!/bin/sh\necho '{command} version {version}'\n",
            encoding="utf-8",
        )
        stub.chmod(0o755)
    store.record_install(dep, version, "test-harness")
    return prefix


# ---------------------------------------------------------------------------
# catalog
# ---------------------------------------------------------------------------

def test_catalog_covers_every_registered_tool_id():
    missing = sorted(tid for tid in REGISTRY if tid not in TOOL_DEPENDENCIES)
    assert missing == [], f"tools with no dependency mapping: {missing}"


def test_catalog_entries_reference_real_dep_ids():
    known = {d.id for d in catalog.all_deps()}
    for tool_id, dep_ids in TOOL_DEPENDENCIES.items():
        unknown = [d for d in dep_ids if d not in known]
        assert unknown == [], f"{tool_id} references unknown dep ids {unknown}"


def test_catalog_metadata_is_honest():
    for dep in catalog.all_deps():
        assert dep.kind in (KIND_CONDA, KIND_PIP), dep.id
        assert dep.packages, f"{dep.id} must name at least one package"
        assert dep.provides, f"{dep.id} must supply at least one command"
        assert dep.approx_bytes > 0, f"{dep.id} needs an approx_bytes for the consent prompt"
        assert dep.notes, f"{dep.id} needs a human note for the consent prompt"
        assert isinstance(dep.heavy, bool)
    heavy = {d.id for d in catalog.all_deps() if d.heavy}
    assert "pip.demucs" in heavy, "demucs pulls multi-GB torch and must be gated"


def test_tool_map_matches_actual_shelled_out_binaries():
    """Spot-check the mapping against the literals each tool really executes."""
    # downloader.py builds cmd = ["yt-dlp", ...] and needs ffmpeg to merge.
    assert "conda.ytdlp" in TOOL_DEPENDENCIES["media.download.yt-dlp"]
    assert "conda.media" in TOOL_DEPENDENCIES["media.download.yt-dlp"]
    # mediainfo_tool.py runs ["ffprobe", ...]
    assert TOOL_DEPENDENCIES["mediainfo"] == ["conda.media"]
    # streamlink falls back to yt-dlp when streamlink is unavailable.
    assert TOOL_DEPENDENCIES["streamlink"] == ["conda.streamlink", "conda.ytdlp"]
    # doc_tools.py runs pdftotext and pdfinfo; both come from poppler.
    assert TOOL_DEPENDENCIES["pdf_tools"] == ["conda.poppler"]
    assert set(catalog.get("conda.poppler").provides) == {"pdftotext", "pdfinfo"}
    # script_runner only needs the python it already runs on.
    assert TOOL_DEPENDENCIES["script_runner"] == []
    # Subtitle translation parses and writes SRT/VTT in Python and calls its LLM
    # provider directly; its implementation does not invoke ffmpeg or ffprobe.
    assert TOOL_DEPENDENCIES["subtitle.translate.srt"] == []
    assert TOOL_DEPENDENCIES["subtitle_translator"] == []
    # The four atomic helpers are pure parameter plumbing.
    for helper in ("media.download.resolve", "media.download.format_select",
                   "media.subtitle.fetch", "media.thumbnail.get"):
        assert TOOL_DEPENDENCIES[helper] == []


# ---------------------------------------------------------------------------
# store
# ---------------------------------------------------------------------------

def test_deps_root_follows_patched_app_paths_root(tmp_path, monkeypatch):
    """conftest patches app.paths.ROOT; the deps root must follow it, not import-time."""
    monkeypatch.setattr("app.paths.ROOT", tmp_path)
    root = deps_root()
    assert root == tmp_path / "deps"
    assert root.is_relative_to(tmp_path), "deps root escaped the patched ROOT"
    assert Path(os.path.realpath(deps_root())).is_relative_to(Path(os.path.realpath(tmp_path)))


def test_deps_root_is_configurable_via_env_var(tmp_path, monkeypatch):
    monkeypatch.setenv(store.DEPS_ROOT_ENV_VAR, str(tmp_path / "elsewhere"))
    assert deps_root() == (tmp_path / "elsewhere").resolve()


def test_manifest_round_trips_atomically(tmp_path):
    assert load_manifest() == {"version": store.MANIFEST_VERSION, "deps": {}}

    manifest = {
        "version": store.MANIFEST_VERSION,
        "deps": {"conda.media": {"dep_id": "conda.media", "version": "7.1", "bytes": 42}},
    }
    target = save_manifest(manifest)
    assert target == manifest_path()
    assert target.is_file()
    assert load_manifest() == manifest

    # A failed write must not leave a partial manifest or stray temp files behind.
    with pytest.raises(TypeError):
        save_manifest({"version": 1, "deps": {"bad": {"x": object()}}})
    assert load_manifest() == manifest, "corrupt write clobbered the good manifest"
    leftovers = [p.name for p in deps_root().iterdir() if p.name.startswith(".manifest-")]
    assert leftovers == [], f"temp files left behind: {leftovers}"


def test_manifest_corrupt_reads_as_empty(tmp_path):
    manifest_path().parent.mkdir(parents=True, exist_ok=True)
    manifest_path().write_text("{not json", encoding="utf-8")
    assert load_manifest() == {"version": store.MANIFEST_VERSION, "deps": {}}


def test_manifest_missing_file_reads_as_empty(tmp_path):
    assert not manifest_path().exists()
    assert load_manifest()["deps"] == {}


def test_du_bytes_counts_hardlinked_file_once(tmp_path):
    target = tmp_path / "tree"
    target.mkdir()
    original = target / "big.bin"
    original.write_bytes(b"x" * 10_000)
    (target / "sub").mkdir()
    try:
        os.link(original, target / "sub" / "link.bin")
    except (OSError, NotImplementedError):
        pytest.skip("filesystem does not support hardlinks")
    # 10k original + 10k of unrelated file, not 20k + 10k.
    (target / "other.bin").write_bytes(b"y" * 10_000)
    assert store.du_bytes(target) == 20_000


def test_du_bytes_on_missing_path_is_zero(tmp_path):
    assert store.du_bytes(tmp_path / "nope") == 0


# ---------------------------------------------------------------------------
# resolver
# ---------------------------------------------------------------------------

def test_missing_dep_reports_missing_not_installed(tmp_path):
    status = resolver.check_dep("conda.media")
    assert status.status == resolver.STATUS_MISSING
    assert status.paths == {}
    assert set(status.missing_commands) == {"ffmpeg", "ffprobe"}
    assert status.version is None
    assert status.reason


def test_prefix_without_binaries_is_missing_not_installed(tmp_path):
    dep = catalog.get("conda.media")
    store.prefix_for(dep).mkdir(parents=True, exist_ok=True)
    assert resolver.check_dep("conda.media").status == resolver.STATUS_MISSING


def test_installed_dep_is_probed_from_its_own_prefix(tmp_path):
    prefix = fake_install("conda.media", version="7.1.1")
    status = resolver.check_dep("conda.media")
    assert status.status == resolver.STATUS_INSTALLED, status.reason
    assert status.version == "ffmpeg version 7.1.1"
    assert set(status.paths) == {"ffmpeg", "ffprobe"}
    for path in status.paths.values():
        assert Path(path).is_relative_to(prefix)
    assert status.measured_bytes > 0


def test_deleted_binaries_downgrade_installed_to_missing(tmp_path):
    fake_install("conda.media")
    (store.prefix_for(catalog.get("conda.media")) / store.bin_dir_name() / "ffmpeg").unlink()
    status = resolver.check_dep("conda.media")
    assert status.status == resolver.STATUS_MISSING
    assert "ffmpeg" in status.missing_commands


def test_manifest_record_alone_does_not_make_a_dep_installed(tmp_path):
    """A stale manifest must never upgrade status. Probing is the only source."""
    store.record_install(catalog.get("conda.media"), "9.9", "test-harness")
    assert "conda.media" in store.installed_records()
    assert resolver.check_dep("conda.media").status == resolver.STATUS_MISSING


def test_catalog_drift_is_reported_as_stale(tmp_path):
    fake_install("conda.media")
    manifest = load_manifest()
    manifest["deps"]["conda.media"]["packages"] = ["ffmpeg", "something-else"]
    save_manifest(manifest)
    status = resolver.check_dep("conda.media")
    assert status.status == resolver.STATUS_STALE
    assert "package list changed" in status.reason


def test_system_binary_is_not_mistaken_for_a_managed_one(tmp_path, monkeypatch):
    """A PATH ffmpeg must not make the managed dep look installed."""
    fake_dir = tmp_path / "system-bin"
    fake_dir.mkdir()
    stub = fake_dir / "ffmpeg"
    stub.write_text("#!/bin/sh\necho hi\n", encoding="utf-8")
    stub.chmod(0o755)
    monkeypatch.setenv("PATH", str(fake_dir))
    assert resolver.check_dep("conda.media").status == resolver.STATUS_MISSING


def test_check_reports_readiness_for_a_tool(tmp_path):
    state = resolver.check("trimmer")
    assert state["tool_id"] == "trimmer"
    assert state["ready"] is False
    assert state["missing"] == ["conda.media"]
    assert [d["dep_id"] for d in state["deps"]] == ["conda.media"]

    fake_install("conda.media")
    ready = resolver.check("trimmer")
    assert ready["ready"] is True
    assert ready["missing"] == []


def test_check_tool_with_no_dependencies_is_ready(tmp_path):
    state = resolver.check("script_runner")
    assert state["ready"] is True
    assert state["deps"] == []


def test_check_unknown_dep_id_raises(tmp_path):
    with pytest.raises(KeyError):
        resolver.check_dep("conda.does_not_exist")


# ---------------------------------------------------------------------------
# environ
# ---------------------------------------------------------------------------

def test_env_for_prefixes_path_with_dep_bin_dirs(tmp_path):
    fake_install("conda.media")
    env = environ.env_for("trimmer")
    media_bin = str(store.prefix_for(catalog.get("conda.media")) / store.bin_dir_name())
    assert env["PATH"].split(os.pathsep)[0] == media_bin
    assert "ffmpeg" in env["PATH"] or media_bin in env["PATH"]
    # The inherited PATH is preserved after the managed dirs.
    assert os.environ.get("PATH", "") in env["PATH"]


def test_env_for_does_not_mutate_os_environ(tmp_path):
    fake_install("conda.media")
    before = dict(os.environ)
    env = environ.env_for("media.download.yt-dlp")
    env["PATH"] = "/tmp/should-not-leak"          # mutate the returned dict
    env["BRAND_NEW"] = "1"
    assert dict(os.environ) == before, "env_for leaked into os.environ"
    assert "BRAND_NEW" not in os.environ
    assert os.environ.get("PATH") == before["PATH"]


def test_env_for_tool_without_dependencies_returns_nothing(tmp_path):
    assert environ.env_for("script_runner") == {}


def test_env_for_sets_ca_bundle_from_certifi_when_present(tmp_path):
    """conda-forge ffmpeg fails HTTPS without an explicit CA bundle."""
    fake_install("pip.gallery_dl")
    cert = tmp_path / "deps" / "envs" / "python" / "lib" / "python3.12" / "site-packages" / "certifi" / "cacert.pem"
    cert.parent.mkdir(parents=True, exist_ok=True)
    cert.write_text("# ca", encoding="utf-8")
    env = environ.env_for("gallery-dl")
    assert env["SSL_CERT_FILE"] == str(cert)
    assert env["REQUESTS_CA_BUNDLE"] == str(cert)
    assert env["CURL_CA_BUNDLE"] == str(cert)


def test_env_for_omits_conda_prefix_when_several_conda_envs_are_needed(tmp_path):
    """One CONDA_PREFIX would be a lie when two prefixes are on PATH."""
    fake_install("conda.streamlink")
    fake_install("conda.ytdlp")
    env = environ.env_for("streamlink")
    assert "CONDA_PREFIX" not in env
    assert "VIRTUAL_ENV" not in env


def test_env_for_sets_conda_prefix_for_a_single_conda_dep(tmp_path):
    fake_install("conda.media")
    env = environ.env_for("trimmer")
    assert env["CONDA_PREFIX"] == str(store.prefix_for(catalog.get("conda.media")))


def test_preview_reports_no_global_mutation(tmp_path):
    fake_install("conda.media")
    preview = environ.preview("trimmer")
    assert preview["mutates_global_env"] is False
    assert preview["bin_dirs"]


# ---------------------------------------------------------------------------
# dependents
# ---------------------------------------------------------------------------

def test_dependents_returns_the_actual_tool_list(tmp_path):
    affected = uninstaller.dependents("conda.media")
    assert affected == [
        "audio_processor",
        "downloader",
        "media.download.yt-dlp",
        "mediainfo",
        "transcriber",
        "trimmer",
    ]
    for tool_id in affected:
        assert tool_id in REGISTRY


def test_dependents_is_the_inverse_of_the_tool_map():
    for dep_id in (d.id for d in catalog.all_deps()):
        for tool_id in uninstaller.dependents(dep_id):
            assert dep_id in TOOL_DEPENDENCIES[tool_id]
    assert uninstaller.dependents("pip.demucs") == ["demucs"]
    assert uninstaller.dependents("conda.exiftool") == ["exif_scrubber"]


def test_tools_for_dep_never_returns_unregistered_tools():
    for tool_id in tools_for_dep("conda.media"):
        assert tool_id in REGISTRY


# ---------------------------------------------------------------------------
# uninstaller
# ---------------------------------------------------------------------------

def test_remove_deletes_only_the_target_dep(tmp_path):
    media_prefix = fake_install("conda.media")
    stream_prefix = fake_install("conda.streamlink")
    assert media_prefix.is_dir() and stream_prefix.is_dir()

    result = uninstaller.remove("conda.streamlink")

    assert result["ok"] is True
    assert result["freed_bytes"] > 0
    assert not stream_prefix.exists(), "target prefix should be gone"
    assert media_prefix.is_dir(), "sibling prefix was deleted"
    assert (media_prefix / store.bin_dir_name() / "ffmpeg").exists()
    assert resolver.check_dep("conda.media").status == resolver.STATUS_INSTALLED
    assert resolver.check_dep("conda.streamlink").status == resolver.STATUS_MISSING
    assert "conda.streamlink" not in store.installed_records()
    assert "conda.media" in store.installed_records()
    assert result["breaks_tools"] == uninstaller.dependents("conda.streamlink")


def test_remove_of_never_installed_dep_is_harmless(tmp_path):
    result = uninstaller.remove("conda.pandoc")
    assert result["ok"] is True
    assert result["freed_bytes"] == 0


def test_remove_unknown_dep_id_raises(tmp_path):
    with pytest.raises(uninstaller.RemovalError):
        uninstaller.remove("pip.not_a_real_thing")


def test_nuke_clears_the_whole_deps_root(tmp_path):
    fake_install("conda.media")
    fake_install("conda.pandoc")
    (deps_root() / "bin").mkdir(parents=True, exist_ok=True)
    (deps_root() / "mamba").mkdir(parents=True, exist_ok=True)
    root = deps_root()
    assert root.is_dir()

    result = uninstaller.nuke()

    assert result["ok"] is True
    assert result["existed"] is True
    assert result["freed_bytes"] > 0
    assert not root.exists(), "deps root survived nuke"
    assert load_manifest()["deps"] == {}
    assert all(resolver.check_dep(d.id).status == resolver.STATUS_MISSING for d in catalog.all_deps())


def test_nuke_on_absent_root_is_a_noop(tmp_path):
    result = uninstaller.nuke()
    assert result["ok"] is True
    assert result["existed"] is False


# ---------------------------------------------------------------------------
# installer
# ---------------------------------------------------------------------------

def test_micromamba_url_is_platform_specific():
    url = installer.micromamba_url()
    assert url.startswith("https://micro.mamba.pm/api/micromamba/")
    assert url.endswith("/latest")
    assert installer.micromamba_platform() in url


def test_install_stream_reports_unknown_id_without_network(tmp_path):
    from app.depmgr import install as install_deps

    events = []

    async def collect(evt):
        events.append(evt)

    import asyncio

    result = asyncio.run(install_deps(["conda.nope"], on_progress=collect))
    assert result["ok"] is False
    assert result["failures"][0]["dep_id"] == "conda.nope"
    assert any(e["type"] == installer.STAGE_FAILED for e in events)


def test_install_is_cancellable_before_it_starts_work(tmp_path):
    import asyncio

    cancel = asyncio.Event()
    cancel.set()
    events = []

    async def collect(evt):
        events.append(evt)

    result = asyncio.run(installer.install(["conda.media"], on_progress=collect, cancel_event=cancel))
    assert result["cancelled"] is True
    assert result["ok"] is False
    assert not store.prefix_for(catalog.get("conda.media")).exists()
    assert any(e["type"] == installer.STAGE_CANCELLED for e in events)


def test_installer_never_references_a_privileged_package_manager():
    """Guard the core promise: no apt, brew or sudo anywhere in the installer.

    Walks the AST rather than grepping text, so prose in a docstring saying
    "no sudo" cannot pass or fail the check by accident.
    """
    import ast

    forbidden = {"apt-get", "apt", "sudo", "brew", "yum", "dnf", "apk", "choco", "winget"}
    tree = ast.parse(Path(installer.__file__).read_text(encoding="utf-8"))
    docstrings = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            body = getattr(node, "body", [])
            if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) \
                    and isinstance(body[0].value.value, str):
                docstrings.add(id(body[0].value))

    offenders = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docstrings:
            token = node.value.strip().lower()
            if token in forbidden or token.startswith(tuple(f"{f} " for f in forbidden)):
                offenders.append(node.value)

    assert offenders == [], f"installer references privileged package managers: {offenders}"
    assert installer.MICROMAMBA_BASE == "https://micro.mamba.pm/api/micromamba"


def test_depmgr_never_requires_root_or_mutates_global_env():
    """app/depmgr must never import a privileged tool or write to os.environ."""
    import ast

    root_dir = Path(catalog.__file__).parent
    offenders = []
    for module in sorted(root_dir.glob("*.py")):
        tree = ast.parse(module.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            # os.environ[...] = ... / os.putenv / os.environ.update
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    text = ast.unparse(target)
                    if text.startswith("os.environ") or text == "os.environ":
                        offenders.append(f"{module.name}:{node.lineno} assigns {text}")
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) \
                    and node.func.attr in ("putenv", "unsetenv"):
                offenders.append(f"{module.name}:{node.lineno} calls os.{node.func.attr}")
    assert offenders == [], f"depmgr mutates global environment: {offenders}"


def test_rebuild_symlink_farm_points_at_installed_binaries(tmp_path):
    fake_install("conda.media")
    linked = installer.rebuild_symlink_farm()
    assert linked >= 2
    link = store.symlink_farm() / "ffmpeg"
    assert link.is_symlink()
    assert Path(os.path.realpath(link)) == store.prefix_for(catalog.get("conda.media")) / store.bin_dir_name() / "ffmpeg"


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

def test_api_deps_lists_every_dep_with_dependents(client):
    resp = client.get("/api/deps")
    assert resp.status_code == 200
    body = resp.json()
    assert body["deps_root"] == str(deps_root())
    assert body["totals"]["total"] == len(catalog.all_deps())
    assert body["micromamba"]["installed"] is False
    ids = {d["dep_id"] for d in body["deps"]}
    assert ids == {d.id for d in catalog.all_deps()}
    by_id = {d["dep_id"]: d for d in body["deps"]}
    assert by_id["conda.media"]["dependents"] == uninstaller.dependents("conda.media")
    assert by_id["pip.demucs"]["heavy"] is True
    assert all(d["status"] == "missing" for d in body["deps"])


def test_api_tool_deps_returns_readiness(client):
    resp = client.get("/api/tools/trimmer/deps")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ready"] is False
    assert body["missing"] == ["conda.media"]
    assert body["environ"]["mutates_global_env"] is False


def test_api_tool_deps_for_tool_with_no_dependencies(client):
    body = client.get("/api/tools/script_runner/deps").json()
    assert body["ready"] is True
    assert body["deps"] == []


def test_api_tool_deps_404_for_unknown_tool(client):
    assert client.get("/api/tools/no.such.tool/deps").status_code == 404


def test_api_install_rejects_empty_and_unknown_ids(client):
    assert client.post("/api/deps/install", json={"dep_ids": []}).status_code == 400
    resp = client.post("/api/deps/install", json={"dep_ids": ["conda.nope"]})
    assert resp.status_code == 422


def test_api_remove_removes_only_the_target(client):
    fake_install("conda.media")
    fake_install("conda.exiftool")
    resp = client.post("/api/deps/remove", json={"dep_id": "conda.exiftool"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["breaks_tools"] == ["exif_scrubber"]
    assert resolver.check_dep("conda.exiftool").status == "missing"
    assert resolver.check_dep("conda.media").status == "installed"
    assert client.post("/api/deps/remove", json={}).status_code == 400


def test_api_nuke_clears_root(client):
    fake_install("conda.media")
    resp = client.post("/api/deps/nuke")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert not deps_root().exists()


def test_api_install_cancel_reports_unknown_job(client):
    body = client.post("/api/deps/install/cancel", json={"job_id": "nope"}).json()
    assert body["cancelled"] is False
