"""可配置工作目录管理 — 与运行时数据目录分离"""

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

# 项目数据目录（固定）：存储会话、记忆、任务、worktree 等运行时数据
DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# 工作区配置文件
WORKSPACE_CONFIG = DATA_DIR / "workspace.json"


class WorkspaceManager:
    """管理用户的工作目录，与运行时数据目录分离"""

    def __init__(self):
        self._workspace: Path = self._load_default()

    def _load_default(self) -> Path:
        """加载持久化的工作目录，或使用默认值"""
        if WORKSPACE_CONFIG.exists():
            try:
                data = json.loads(WORKSPACE_CONFIG.read_text(encoding="utf-8"))
                path = Path(data.get("path", ""))
                if path.exists():
                    return path.resolve()
            except Exception:
                pass
        # 默认：用户 home 目录
        home = Path.home()
        if home.exists():
            return home
        return Path.cwd()

    def _save(self):
        WORKSPACE_CONFIG.parent.mkdir(parents=True, exist_ok=True)
        WORKSPACE_CONFIG.write_text(
            json.dumps({"path": str(self._workspace)}, ensure_ascii=False),
            encoding="utf-8",
        )

    @property
    def path(self) -> Path:
        return self._workspace

    @path.setter
    def path(self, new_path: str | Path):
        p = Path(new_path).resolve()
        if not p.exists():
            raise ValueError(f"目录不存在: {p}")
        if not p.is_dir():
            raise ValueError(f"不是目录: {p}")
        self._workspace = p
        self._save()
        logger.info("[Workspace] 切换至: %s", p)

    def get_subdir(self, name: str) -> Path:
        """在工作目录下获取子目录"""
        sub = self._workspace / name
        sub.mkdir(parents=True, exist_ok=True)
        return sub

    def resolve(self, path: str) -> Path:
        """将用户路径解析为绝对路径（相对路径基于 workspace）"""
        p = Path(path)
        if p.is_absolute():
            return p.resolve()
        return (self._workspace / p).resolve()

    def is_inside(self, path: str | Path) -> bool:
        """检查路径是否在工作目录内"""
        try:
            p = Path(path).resolve()
            return p.is_relative_to(self._workspace)
        except (ValueError, Exception):
            return False

    def get_relative(self, path: str | Path) -> str:
        """获取相对于工作目录的路径"""
        try:
            p = Path(path).resolve()
            return str(p.relative_to(self._workspace))
        except (ValueError, Exception):
            return str(path)


workspace = WorkspaceManager()
