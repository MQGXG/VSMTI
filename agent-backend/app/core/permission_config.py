"""声明式权限配置 — 从 omniagent.json 加载工具权限规则"""

import json
import fnmatch
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / "omniagent.json"

# 工具分组 (权限分组)
TOOL_GROUPS = {
    "edit": ["write_file", "edit_file"],
    "read": ["read_file", "list_files"],
    "bg": ["background_run", "background_check"],
    "task": ["create_task", "list_tasks", "get_task", "claim_task", "complete_task"],
    "cron": ["schedule_cron", "list_crons", "cancel_cron"],
    "team": ["spawn_teammate", "send_message", "check_inbox",
             "request_shutdown", "request_plan", "review_plan"],
    "worktree": ["worktree_create", "worktree_enter", "worktree_run",
                 "worktree_closeout", "worktree_list"],
}

# 模式到分组的反向映射
_pattern_to_group: dict[str, str] = {}
for group, tools in TOOL_GROUPS.items():
    for tool in tools:
        _pattern_to_group[tool] = group


# 内置硬拒绝 (始终拦截，不可配置)
HARD_DENY = [
    "rm -rf /", "sudo", "shutdown", "reboot",
    "mkfs", "dd if=", ":(){ :|:& };:",
]

# 系统敏感路径 (始终拦截)
SENSITIVE_DIRS = [
    "/etc", "/var", "/sys", "/proc", "/boot", "/dev",
    "/usr/lib", "/usr/include", "/System", "/Library",
    "c:/windows", "c:/program files", "c:/programdata",
    "c:/system32", "c:/users/all users",
]


class PermissionConfig:
    def __init__(self, path: str | Path = CONFIG_PATH):
        self.path = Path(path)
        self._rules: dict[str, str] = {}  # tool_name -> behavior
        self._wildcards: list[tuple[str, str]] = []  # (pattern, behavior)
        self._load()

    def _load(self):
        self._rules = {}
        self._wildcards = []

        if not self.path.exists():
            logger.info("权限配置不存在: %s，使用默认规则", self.path)
            return

        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            perm = data.get("permission", {})

            for key, behavior in perm.items():
                if behavior not in ("allow", "deny", "ask"):
                    logger.warning("跳过非法权限值: %s=%s", key, behavior)
                    continue

                # 检查是否是分组名
                if key in TOOL_GROUPS:
                    for tool in TOOL_GROUPS[key]:
                        self._rules[tool] = behavior
                    continue

                # 检查是否含通配符
                if "*" in key:
                    self._wildcards.append((key, behavior))
                else:
                    self._rules[key] = behavior

            logger.info("权限配置加载: %d 条规则, %d 个通配符",
                        len(self._rules), len(self._wildcards))
        except Exception as e:
            logger.warning("权限配置加载失败: %s，使用默认规则", e)

    def get_behavior(self, tool_name: str) -> str | None:
        """返回工具行为的配置: allow / deny / ask / None(未配置)"""
        # 优先精确匹配
        if tool_name in self._rules:
            return self._rules[tool_name]

        # 匹配通配符
        for pattern, behavior in self._wildcards:
            if fnmatch.fnmatch(tool_name, pattern):
                return behavior

        return None

    def get_group_name(self, tool_name: str) -> str | None:
        """返回工具所属分组名"""
        return _pattern_to_group.get(tool_name)

    def reload(self):
        self._load()


permission_config = PermissionConfig()
