import asyncio
import json
import pytest
from app.main import app
from fastapi.testclient import TestClient


def test_live_health(client):
    response = client.get('/api/health')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'
    assert response.json()['version'] == app.version


def test_unexpected_error_is_sanitized_and_logged(client, monkeypatch, caplog):
    def fail(*args, **kwargs):
        raise RuntimeError('secret /home/alice/private/token.txt')
    monkeypatch.setattr('app.main.mux_subtitles_to_video', fail)
    response = client.post('/api/workspaces/a/mux-subtitles', json={'video_path': 'x', 'subtitle_path': 'y'})
    assert response.status_code == 500
    assert response.json()['error']['code'] == 'INTERNAL_ERROR'
    assert '/home/alice' not in response.text
    assert 'secret /home/alice' in caplog.text


def test_stream_errors_are_structured(client, monkeypatch):
    async def fail(*args, **kwargs):
        raise RuntimeError('secret /home/alice/private/token.txt')
    monkeypatch.setattr('app.main.execute_dag_pipeline', fail)
    response = client.post('/api/workspaces/a/pipeline/run-stream', json={'nodes': []})
    events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
    assert events[-1]['error']['code'] == 'INTERNAL_ERROR'
    assert '/home/alice' not in response.text


def test_url_dependency_error_has_code(client, monkeypatch):
    def fail(*args, **kwargs):
        raise FileNotFoundError('/home/alice/private/yt-dlp')
    monkeypatch.setattr('app.tools.downloader.subprocess.run', fail)
    result = client.post('/api/workspaces/a/pipeline/resolve-url', json={'url': 'https://example.com/video'}).json()
    assert result['error']['code'] == 'DEPENDENCY_UNAVAILABLE'
    assert '/home/alice' not in json.dumps(result)


@pytest.mark.anyio
async def test_stream_emits_heartbeat_until_terminal(monkeypatch):
    import app.main as main
    async def delayed(*args, **kwargs):
        await asyncio.sleep(0.04)
        return []
    monkeypatch.setattr(main, 'execute_dag_pipeline', delayed)
    monkeypatch.setattr(main, 'STREAM_HEARTBEAT_SECONDS', 0.01)
    response = await main.run_workspace_pipeline_stream('a', {'nodes': []})
    chunks = [chunk async for chunk in response.body_iterator]
    assert ': heartbeat\n\n' in chunks
    assert 'pipeline_finished' in chunks[-1]


def test_missing_branch_run_returns_structured_404(client):
    response = client.post('/api/workspaces/a/runs/missing/branch')
    assert response.status_code == 404
    assert response.json()['error']['code'] == 'RUN_NOT_FOUND'


def test_artifact_paths_remain_intact():
    from app.errors import stream_public_data
    result = stream_public_data({'artifacts': [{'path': '/home/alice/output.mp4'}], 'error': 'Cannot open /home/alice/private/token.txt'})
    assert result['artifacts'][0]['path'] == '/home/alice/output.mp4'
    assert '/home/alice' not in result['error']['message']


def test_nonstream_tool_failure_sanitizes_error_preserves_artifacts(client, monkeypatch):
    from types import SimpleNamespace
    from app.tools.base import ToolResult, Artifact
    async def execute(context):
        return ToolResult(status='failed', error='input file not found: /home/alice/private/input.txt', artifacts=[Artifact(name='output', path='/home/alice/output.txt', kind='text')])
    monkeypatch.setattr('app.main.get', lambda _: SimpleNamespace(manifest=SimpleNamespace(parameters_schema={}), execute=execute))
    response = client.post('/api/tools/test/execute', json={'kind': 'workspace', 'destination': '/tmp', 'params': {}})
    result = response.json()
    assert result['error']['code'] == 'TOOL_EXECUTION_FAILED'
    assert '/home/alice' not in result['error']['message']
    assert result['artifacts'][0]['path'] == '/home/alice/output.txt'


def test_nonstream_pipeline_errors_are_safe(client, monkeypatch):
    async def execute(*args, **kwargs):
        return [{'error': 'input file not found: /home/alice/private/input.txt', 'artifacts': [{'path': '/home/alice/output.txt'}]}]
    monkeypatch.setattr('app.main.execute_dag_pipeline', execute)
    result = client.post('/api/workspaces/a/pipeline/run', json={'nodes': []}).json()['results'][0]
    assert result['error']['code'] == 'TOOL_EXECUTION_FAILED'
    assert '/home/alice' not in result['error']['message']
    assert result['artifacts'][0]['path'] == '/home/alice/output.txt'


@pytest.mark.anyio
async def test_active_status_and_duplicate_stream_rejection(monkeypatch):
    import app.main as main
    from fastapi import HTTPException
    started = asyncio.Event()
    finished = asyncio.Event()
    async def execute(*args, **kwargs):
        started.set()
        await finished.wait()
        return []
    monkeypatch.setattr(main, 'execute_dag_pipeline', execute)
    response = await main.run_workspace_pipeline_stream('active-workspace', {'nodes': []})
    await started.wait()
    assert (await main.pipeline_status('active-workspace'))['active'] is True
    with pytest.raises(HTTPException) as caught:
        await main.run_workspace_pipeline_stream('active-workspace', {'nodes': []})
    assert caught.value.status_code == 409
    finished.set()
    chunks = [chunk async for chunk in response.body_iterator]
    assert 'pipeline_finished' in chunks[-1]
    assert (await main.pipeline_status('active-workspace'))['active'] is False
