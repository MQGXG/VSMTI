"""Worktree 隔离系统 — 独立目录 + 任务绑定 + 生命周期管理"""

import json
import logging
import shutil
import subprocess
import time
from pathlib import Path
from threading import Lock

logger = logging.getLogger(__name__)

WORKTREE_ROOT = Path(__file__).resolve().parent.parent.parent / ".worktrees"
INDEX_PATH = WORKTREE_ROOT / "index.json"
EVENTS_PATH = WORKTREE_ROOT / "events.jsonl"

_index_lock = Lock()


def _ensure_dir():
    WORKTREE_ROOT.mkdir(parents=True, exist_ok=True)


def _load_index() -> dict:
    _ensure_dir()
    if not INDEX_PATH.exists():
        return {"worktrees": []}
    with _index_lock:
        return json.loads(INDEX_PATH.read_text(encoding="utf-8"))


def _save_index(index: dict):
    _ensure_dir()
    with _index_lock:
        INDEX_PATH.write_text(
            json.dumps(index, indent=2, ensure_ascii=False), encoding="utf-8"
        )


def _append_event(event: dict):
    _ensure_dir()
    with open(EVENTS_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")


def _git_available() -> bool:
    try:
        subprocess.run(["git", "--version"], capture_output=True, timeout=5)
        return True
    except Exception:
        return False


def create(name: str, task_id: str, base_branch: str = "main") -> dict:
    """创建 worktree 并绑定到任务"""
    _ensure_dir()
    safe_name = name.lower().replace(" ", "-").replace("/", "-")
    wt_path = WORKTREE_ROOT / safe_name
    branch = f"wt/{safe_name}"

    index = _load_index()
    for wt in index["worktrees"]:
        if wt["name"] == safe_name:
            return {"error": f"Worktree '{safe_name}' 已存在"}

    if _git_available() and wt_path.exists():
        shutil.rmtree(wt_path)

    if _git_available():
        try:
            subprocess.run(
                ["git", "worktree", "add", "-b", branch, str(wt_path), base_branch],
                capture_output=True, text=True, timeout=30,
            )
        except subprocess.CalledProcessError as e:
            logger.warning("Git worktree 创建失败（降级为目录）: %s", e.stderr)
            wt_path.mkdir(parents=True, exist_ok=True)
    else:
        wt_path.mkdir(parents=True, exist_ok=True)

    record = {
        "name": safe_name,
        "path": str(wt_path.resolve()),
        "branch": branch,
        "task_id": task_id,
        "status": "active",
        "created_at": time.time(),
        "last_entered_at": None,
        "last_command_at": None,
        "last_command_preview": None,
        "closeout": None,
    }
    index["worktrees"].append(record)
    _save_index(index)

    _append_event({
        "event": "worktree.created",
        "name": safe_name, "task_id": task_id, "ts": time.time(),
    })
    logger.info("[Worktree] 创建 %s → %s (task: %s)", safe_name, wt_path, task_id)
    return record


def get(name: str) -> dict | None:
    index = _load_index()
    for wt in index["worktrees"]:
        if wt["name"] == name:
            return wt
    return None


def get_by_task(task_id: str) -> dict | None:
    index = _load_index()
    for wt in index["worktrees"]:
        if wt["task_id"] == task_id and wt["status"] == "active":
            return wt
    return None


def list_active() -> list[dict]:
    index = _load_index()
    return [wt for wt in index["worktrees"] if wt["status"] == "active"]


def list_all() -> list[dict]:
    return _load_index()["worktrees"]


def enter(name: str) -> dict:
    """标记进入 worktree"""
    index = _load_index()
    for wt in index["worktrees"]:
        if wt["name"] == name:
            wt["last_entered_at"] = time.time()
            _save_index(index)
            _append_event({
                "event": "worktree.enter",
                "name": name, "ts": time.time(),
            })
            return wt
    return {"error": f"Worktree '{name}' 不存在"}


def get_path(name: str) -> str | None:
    wt = get(name)
    if wt:
        return wt.get("path")
    return None


def run_command(name: str, command: str, timeout: int = 300) -> str:
    """在 worktree 目录中执行命令"""
    wt = get(name)
    if not wt:
        return f"Error: Worktree '{name}' 不存在"
    wt_path = wt.get("path", "")
    if not Path(wt_path).exists():
        return f"Error: Worktree 路径不存在: {wt_path}"

    try:
        r = subprocess.run(
            command, shell=True, cwd=wt_path,
            capture_output=True, text=True, timeout=timeout,
        )
        output = (r.stdout + r.stderr).strip()[:50000]

        index = _load_index()
        for entry in index["worktrees"]:
            if entry["name"] == name:
                entry["last_command_at"] = time.time()
                entry["last_command_preview"] = output[:200]
                break
        _save_index(index)
        return output or "(no output)"
    except subprocess.TimeoutExpired:
        return "Error: Command timed out"
    except Exception as e:
        return f"Error: {e}"


def closeout(name: str, action: str = "keep", reason: str = "") -> dict:
    """收尾 worktree：保留或删除"""
    index = _load_index()
    for wt in index["worktrees"]:
        if wt["name"] == name:
            closeout_record = {
                "action": action,
                "reason": reason,
                "at": time.time(),
            }
            if action == "remove":
                wt_path = Path(wt["path"])
                if wt_path.exists():
                    try:
                        if _git_available():
                            subprocess.run(
                                ["git", "worktree", "remove", str(wt_path)],
                                capture_output=True, timeout=30,
                            )
                        shutil.rmtree(wt_path)
                    except Exception as e:
                        logger.warning("Worktree 删除失败: %s", e)
                wt["status"] = "removed"
                _append_event({
                    "event": "worktree.closeout.remove",
                    "name": name, "reason": reason, "ts": time.time(),
                })
            else:
                wt["status"] = "kept"
                _append_event({
                    "event": "worktree.closeout.keep",
                    "name": name, "reason": reason, "ts": time.time(),
                })
            wt["closeout"] = closeout_record
            _save_index(index)
            logger.info("[Worktree] 收尾 %s: %s (%s)", name, action, reason)
            return closeout_record
    return {"error": f"Worktree '{name}' 不存在"}
