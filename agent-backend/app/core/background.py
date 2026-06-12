"""后台任务系统 — RuntimeTaskRecord + 通知队列 + 主循环注入"""

import json
import logging
import threading
import time
from pathlib import Path
from typing import Callable

logger = logging.getLogger(__name__)

BG_DIR = Path(__file__).resolve().parent.parent.parent / ".runtime-tasks"

_runtime_tasks: dict[str, dict] = {}
_notification_queue: list[dict] = []
_lock = threading.Lock()
_counter = 0


def _ensure_dir():
    BG_DIR.mkdir(parents=True, exist_ok=True)


def _record_path(task_id: str) -> Path:
    return BG_DIR / f"{task_id}.json"


def _log_path(task_id: str) -> Path:
    return BG_DIR / f"{task_id}.log"


def _save_record(task_id: str):
    with _lock:
        record = _runtime_tasks.get(task_id)
        if record:
            _ensure_dir()
            _record_path(task_id).write_text(
                json.dumps(record, indent=2, ensure_ascii=False, default=str),
                encoding="utf-8",
            )


def is_slow_operation(tool_name: str, args: dict) -> bool:
    """判断是否可能是慢操作"""
    if tool_name != "bash":
        return False
    cmd = args.get("command", "").lower()
    slow_keywords = [
        "install", "build", "test", "deploy", "compile",
        "pip install", "npm install", "cargo build",
        "pytest", "make", "docker build",
    ]
    return any(kw in cmd for kw in slow_keywords)


def should_run_background(tool_name: str, args: dict) -> bool:
    if args.get("run_in_background"):
        return True
    return is_slow_operation(tool_name, args)


def start_background(name: str, run_fn: Callable) -> str:
    """启动后台任务，返回 task_id"""
    global _counter
    _counter += 1
    task_id = f"bg_{int(time.time())}_{_counter:04d}"

    record = {
        "id": task_id,
        "name": name,
        "status": "running",
        "started_at": time.time(),
        "completed_at": None,
        "result_preview": "",
        "output_file": "",
    }

    with _lock:
        _runtime_tasks[task_id] = record
    _save_record(task_id)

    def worker():
        try:
            result = run_fn()
            preview = str(result)[:500]
            status = "completed"

            log_path = _log_path(task_id)
            log_path.write_text(str(result), encoding="utf-8")

            with _lock:
                if task_id in _runtime_tasks:
                    _runtime_tasks[task_id].update({
                        "status": status,
                        "completed_at": time.time(),
                        "result_preview": preview,
                        "output_file": str(log_path),
                    })
                _notification_queue.append({
                    "type": "background_completed",
                    "task_id": task_id,
                    "name": name,
                    "status": status,
                    "preview": preview,
                })
            _save_record(task_id)
            logger.info("[Background] 完成 %s: %s", task_id, name)
        except Exception as e:
            preview = f"Error: {e}"
            with _lock:
                if task_id in _runtime_tasks:
                    _runtime_tasks[task_id].update({
                        "status": "failed",
                        "completed_at": time.time(),
                        "result_preview": preview,
                    })
                _notification_queue.append({
                    "type": "background_completed",
                    "task_id": task_id,
                    "name": name,
                    "status": "failed",
                    "preview": preview,
                })
            logger.warning("[Background] 失败 %s: %s", task_id, e)

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    logger.info("[Background] 启动 %s: %s", task_id, name)
    return task_id


def drain_notifications() -> list[dict]:
    """排空通知队列（在主循环调用模型前执行）"""
    with _lock:
        result = list(_notification_queue)
        _notification_queue.clear()
    return result


def get_record(task_id: str) -> dict | None:
    with _lock:
        record = _runtime_tasks.get(task_id)
        if record:
            return dict(record)
    path = _record_path(task_id)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def list_active() -> list[dict]:
    with _lock:
        return [dict(r) for r in _runtime_tasks.values() if r["status"] == "running"]


def poll_background_results() -> list[dict]:
    """兼容旧接口：直接排空通知并返回"""
    return drain_notifications()
