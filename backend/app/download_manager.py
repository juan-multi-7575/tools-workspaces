import asyncio
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
            }
            for t in self.tasks.values()
        ]

    def cancel(self, task_id: str) -> bool:
        task = self.tasks.get(task_id)
        if task is None:
            return False
        task.cancel_event.set()
        if task.status == "queued":
            task.status = "cancelled"
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
            if task.cancel_event.is_set() and result.status != "completed":
                task.status = "cancelled"
            else:
                task.status = result.status
                task.error = result.error
                task.result = result.model_dump()
        except Exception as e:
            task.status = "failed"
            task.error = str(e)


manager = DownloadManager()


def get_manager() -> DownloadManager:
    return manager
