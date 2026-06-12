"""任务系统 — DAG 依赖图 + 文件持久化"""

import json
import logging
import random
import time
from dataclasses import dataclass, asdict
from pathlib import Path

logger = logging.getLogger(__name__)

TASKS_DIR = Path(__file__).resolve().parent.parent.parent / ".tasks"


@dataclass
class Task:
    id: str
    subject: str
    description: str
    status: str          # pending | in_progress | completed
    owner: str | None
    blockedBy: list[str]
    worktree: str = ""
    worktree_state: str = "unbound"
    last_worktree: str = ""
    claimed_at: float | None = None
    claim_source: str = ""
    closeout: str = ""


def _ensure_dir():
    TASKS_DIR.mkdir(parents=True, exist_ok=True)


def _task_path(task_id: str) -> Path:
    return TASKS_DIR / f"{task_id}.json"


def create_task(subject: str, description: str = "",
                blockedBy: list[str] | None = None) -> Task:
    _ensure_dir()
    task = Task(
        id=f"task_{int(time.time())}_{random.randint(0, 9999):04d}",
        subject=subject,
        description=description,
        status="pending",
        owner=None,
        blockedBy=blockedBy or [],
    )
    _save(task)
    logger.info("[Task] 创建: %s — %s", task.id, task.subject)
    return task


def _save(task: Task):
    _task_path(task.id).write_text(json.dumps(asdict(task), indent=2, ensure_ascii=False), encoding="utf-8")


def load_task(task_id: str) -> Task | None:
    path = _task_path(task_id)
    if not path.exists():
        return None
    return Task(**json.loads(path.read_text(encoding="utf-8")))


def list_tasks() -> list[Task]:
    _ensure_dir()
    tasks = []
    for p in sorted(TASKS_DIR.glob("task_*.json")):
        try:
            tasks.append(Task(**json.loads(p.read_text(encoding="utf-8"))))
        except Exception as e:
            logger.warning("[Task] 读取失败 %s: %s", p.name, e)
    return tasks


def can_start(task_id: str) -> tuple[bool, str]:
    """检查任务的依赖是否全部完成"""
    task = load_task(task_id)
    if not task:
        return False, "任务不存在"
    for dep_id in task.blockedBy:
        dep = load_task(dep_id)
        if dep is None:
            return False, f"依赖任务不存在: {dep_id}"
        if dep.status != "completed":
            return False, f"依赖未完成: {dep.subject} [{dep.status}]"
    return True, ""


def claim_task(task_id: str, owner: str = "agent", source: str = "manual") -> str:
    task = load_task(task_id)
    if not task:
        return "任务不存在"
    if task.status != "pending":
        return f"任务状态为 {task.status}，不能认领"
    if task.owner:
        return f"任务已被 {task.owner} 认领"
    ok, reason = can_start(task_id)
    if not ok:
        return f"无法开始: {reason}"
    task.owner = owner
    task.status = "in_progress"
    task.claimed_at = time.time()
    task.claim_source = source
    _save(task)
    logger.info("[Task] 认领: %s — %s (by %s, source=%s)", task.id, task.subject, owner, source)
    _append_claim_event(task.id, owner, source)
    return f"已认领 {task.id}: {task.subject}"


def _append_claim_event(task_id: str, owner: str, source: str):
    event_path = TASKS_DIR / "claim_events.jsonl"
    event = {
        "event": "task.claimed",
        "task_id": task_id,
        "owner": owner,
        "source": source,
        "ts": time.time(),
    }
    with open(event_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")


def complete_task(task_id: str, closeout_note: str = "") -> str:
    task = load_task(task_id)
    if not task:
        return "任务不存在"
    if task.status != "in_progress":
        return f"任务状态为 {task.status}，不能完成"
    task.status = "completed"
    if closeout_note:
        task.closeout = closeout_note
    _save(task)
    unblocked = [t for t in list_tasks()
                 if t.status == "pending" and t.blockedBy]
    unlocked = [t.subject for t in unblocked if can_start(t.id)[0]]
    msg = f"已完成 {task.id}: {task.subject}"
    if unlocked:
        msg += f"\n解锁了: {', '.join(unlocked)}"
    logger.info("[Task] 完成: %s", task.id)
    return msg


def get_task_json(task_id: str) -> str | None:
    task = load_task(task_id)
    if not task:
        return None
    return json.dumps(asdict(task), indent=2, ensure_ascii=False)
