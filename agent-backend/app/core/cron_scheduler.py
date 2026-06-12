"""Cron 调度器 — 独立线程 + 持久化作业"""

import json
import logging
import random
import threading
import time
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Callable

logger = logging.getLogger(__name__)

SCHEDULED_FILE = Path(__file__).resolve().parent.parent.parent / ".scheduled_tasks.json"


@dataclass
class CronJob:
    id: str
    cron: str        # "0 9 * * *" (五段式)
    prompt: str      # 触发时注入的提示
    recurring: bool  # True=循环, False=一次性
    durable: bool    # True=持久化到磁盘


_scheduled: dict[str, CronJob] = {}
_queue: list[CronJob] = []
_lock = threading.Lock()
_last_fired: dict[str, str] = {}
_scheduler_started = False


def _field_matches(field: str, value: int) -> bool:
    if field == "*":
        return True
    if field.startswith("*/"):
        step = int(field[2:])
        return step > 0 and value % step == 0
    if "," in field:
        return any(_field_matches(f.strip(), value) for f in field.split(","))
    if "-" in field:
        lo, hi = field.split("-", 1)
        return int(lo) <= value <= int(hi)
    return value == int(field)


def cron_matches(expr: str, dt: datetime) -> bool:
    fields = expr.strip().split()
    if len(fields) != 5:
        return False
    minute, hour, dom, month, dow = fields
    dow_val = (dt.weekday() + 1) % 7
    m = _field_matches(minute, dt.minute)
    h = _field_matches(hour, dt.hour)
    dom_ok = _field_matches(dom, dt.day)
    month_ok = _field_matches(month, dt.month)
    dow_ok = _field_matches(dow, dow_val)
    if not (m and h and month_ok):
        return False
    if dom == "*" and dow == "*":
        return True
    if dom == "*":
        return dow_ok
    if dow == "*":
        return dom_ok
    return dom_ok or dow_ok


def validate_cron(expr: str) -> str | None:
    fields = expr.strip().split()
    if len(fields) != 5:
        return "需要 5 段"
    bounds = [(0, 59), (0, 23), (1, 31), (1, 12), (0, 6)]
    names = ["分钟", "小时", "日", "月", "星期"]
    for i, (field, (lo, hi), name) in enumerate(zip(fields, bounds, names)):
        if field == "*" or field.startswith("*/"):
            continue
        for part in field.split(","):
            if "-" in part:
                a, b = part.split("-", 1)
                if not a.isdigit() or not b.isdigit():
                    return f"{name}: 非法范围 {part}"
            elif not part.isdigit():
                return f"{name}: 非法值 {part}"
    return None


def _load_durable():
    if not SCHEDULED_FILE.exists():
        return
    try:
        data = json.loads(SCHEDULED_FILE.read_text(encoding="utf-8"))
        for item in data:
            job = CronJob(**item)
            if validate_cron(job.cron) is None:
                _scheduled[job.id] = job
        if _scheduled:
            logger.info("[Cron] 加载 %d 个持久化作业", len(_scheduled))
    except Exception as e:
        logger.warning("[Cron] 加载失败: %s", e)


def _save_durable():
    durable = [asdict(j) for j in _scheduled.values() if j.durable]
    SCHEDULED_FILE.write_text(json.dumps(durable, indent=2, ensure_ascii=False), encoding="utf-8")


def schedule(cron: str, prompt: str, recurring: bool = True, durable: bool = True) -> str:
    err = validate_cron(cron)
    if err:
        return f"cron 格式错误: {err}"
    job = CronJob(
        id=f"cron_{random.randint(0, 999999):06d}",
        cron=cron, prompt=prompt,
        recurring=recurring, durable=durable,
    )
    with _lock:
        _scheduled[job.id] = job
    if durable:
        _save_durable()
    logger.info("[Cron] 注册: %s '%s' → %s", job.id, cron, prompt[:40])
    return f"已调度 {job.id}: '{cron}' → {prompt[:40]}"


def cancel(job_id: str) -> str:
    with _lock:
        job = _scheduled.pop(job_id, None)
    if not job:
        return f"未找到: {job_id}"
    if job.durable:
        _save_durable()
    logger.info("[Cron] 取消: %s", job_id)
    return f"已取消 {job_id}"


def list_jobs() -> list[CronJob]:
    with _lock:
        return list(_scheduled.values())


def consume_queue() -> list[CronJob]:
    with _lock:
        fired = list(_queue)
        _queue.clear()
    return fired


def _scheduler_loop():
    while True:
        time.sleep(1)
        now = datetime.now()
        marker = now.strftime("%Y-%m-%d %H:%M")
        with _lock:
            for job in list(_scheduled.values()):
                try:
                    if cron_matches(job.cron, now) and _last_fired.get(job.id) != marker:
                        _queue.append(job)
                        _last_fired[job.id] = marker
                        logger.info("[Cron] 触发: %s → %s", job.id, job.prompt[:40])
                        if not job.recurring:
                            _scheduled.pop(job.id, None)
                            if job.durable:
                                _save_durable()
                except Exception as e:
                    logger.error("[Cron] 作业 %s 错误: %s", job.id, e)


def start_scheduler():
    global _scheduler_started
    if _scheduler_started:
        return
    _load_durable()
    thread = threading.Thread(target=_scheduler_loop, daemon=True)
    thread.start()
    _scheduler_started = True
    logger.info("[Cron] 调度器已启动")


def ensure_running():
    if not _scheduler_started:
        start_scheduler()
