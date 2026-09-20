import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any


@dataclass
class DownloadTask:
    id: str
    params: dict[str, Any]
    status: str = "queued"
    progress: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)
    progress_queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=50))
    result: dict[str, Any] | None = None
    created_at: float = field(default_factory=time.time)
    started_at: float | None = None
    completed_at: float | None = None


class DownloadManager:
    def __init__(self, max_concurrent: int = 2):
        self.max_concurrent = max_concurrent
        self.tasks: dict[str, DownloadTask] = {}
        self._workers: list[asyncio.Task] = []

    def set_max_concurrent(self, value: int) -> None:
        self.max_concurrent = max(1, int(value))

    def enqueue(self, params: dict[str, Any]) -> DownloadTask:
        task_id = uuid.uuid4().hex[:12]
        task = DownloadTask(id=task_id, params=params)
        self.tasks[task_id] = task
        return task

    def get(self, task_id: str) -> DownloadTask | None:
        return self.tasks.get(task_id)

    def list_tasks(self) -> list[dict[str, Any]]:
        return [
            {
                "id": t.id,
                "status": t.status,
                "progress": t.progress,
                "error": t.error,
                "params": {
                    "url": t.params.get("url", ""),
                    "format_preset": t.params.get("format_preset"),
                    "download_mode": t.params.get("download_mode"),
                },
                "result": t.result,
                "created_at": t.created_at,
                "started_at": t.started_at,
                "completed_at": t.completed_at,
            }
            for t in self.tasks.values()
        ]

    def clear_history(self) -> int:
        to_delete = [
            tid for tid, t in self.tasks.items()
            if t.status in ("completed", "failed", "cancelled")
        ]
        for tid in to_delete:
            del self.tasks[tid]
        return len(to_delete)

    def remove_task(self, task_id: str) -> bool:
        task = self.tasks.get(task_id)
        if task is None:
            return False
        if task.status in ("running", "queued"):
            self.cancel(task_id)
        if task_id in self.tasks:
            del self.tasks[task_id]
        return True

    def cancel(self, task_id: str) -> bool:
        task = self.tasks.get(task_id)
        if task is None:
            return False
        task.cancel_event.set()
        if task.status == "queued":
            task.status = "cancelled"
            task.completed_at = time.time()
        return True

    def active_count(self) -> int:
        return sum(1 for t in self.tasks.values() if t.status == "running")

    async def start(self) -> None:
        while True:
            if self.active_count() < self.max_concurrent:
                for t in self.tasks.values():
                    if t.status == "queued":
                        t.status = "running"
                        self._workers.append(asyncio.create_task(self._run(t)))
                        break
            await asyncio.sleep(0.2)

    async def _run(self, task: DownloadTask) -> None:
        from app.tools.base import ToolRunContext
        from app.tools.downloader import DownloaderTool

        task.started_at = time.time()
        tool = DownloaderTool()
        if task.progress_queue is None:
            task.progress_queue = asyncio.Queue(maxsize=50)
        params = {k: v for k, v in task.params.items() if k != "outdir"}
        ctx = ToolRunContext(
            kind="standalone",
            destination=task.params.get("outdir", ""),
            params=params,
            cancel_event=task.cancel_event,
            progress_queue=task.progress_queue,
        )
        try:
            result = await tool.execute(ctx)
            task.completed_at = time.time()
            if task.cancel_event.is_set() and result.status != "completed":
                task.status = "cancelled"
            else:
                task.status = result.status
                task.error = result.error
                task.result = result.model_dump()
        except Exception as e:
            task.completed_at = time.time()
            task.status = "failed"
            task.error = str(e)


manager = DownloadManager()


def get_manager() -> DownloadManager:
    return manager
