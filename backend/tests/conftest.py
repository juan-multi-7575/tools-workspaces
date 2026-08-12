import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(autouse=True)
def _reset_layout(tmp_path, monkeypatch):
    monkeypatch.setattr("app.paths.ROOT", tmp_path)
    monkeypatch.setattr("app.paths.DOWNLOADS", tmp_path / "downloads")
    monkeypatch.setattr("app.paths.WORKSPACES", tmp_path / "workspaces")
    monkeypatch.setattr("app.paths.CONFIG", tmp_path / "config")
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
