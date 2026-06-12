"""权限系统 — 声明式配置 + 硬拒绝 + 路径安全 + 分组"""

import logging
from pathlib import Path

from app.core.permission_config import permission_config, HARD_DENY, SENSITIVE_DIRS

logger = logging.getLogger(__name__)

WORKDIR = Path(__file__).resolve().parent.parent.parent.parent


def _in_hard_deny(command: str) -> bool:
    for pattern in HARD_DENY:
        if pattern in command:
            return True
    return False


def _is_sensitive_path(path: str) -> bool:
    p = path.replace("\\", "/").lower()
    for d in SENSITIVE_DIRS:
        if p.startswith(d):
            return True
    return False


def _is_outside_workspace(path: str) -> bool:
    p = Path(path)
    if p.is_absolute():
        resolved = p.resolve()
    else:
        resolved = (WORKDIR / p).resolve()
    try:
        return not resolved.is_relative_to(WORKDIR)
    except ValueError:
        return True


def need_user_approval(tool_name: str, args: dict) -> str | None:
    """返回需要审批的原因，None 表示直接通过

    决策顺序:
    1. 硬拒绝 (Gate 1) — bash 危险命令
    2. 声明式配置 — allow/deny/ask
    3. 路径安全检查 — 敏感路径 / 工作区外路径
    4. 默认行为 — ask
    """

    # === Gate 1: 硬拒绝 ===
    if tool_name == "bash":
        cmd = args.get("command", "")
        if _in_hard_deny(cmd):
            return f"硬拒绝: 危险命令"

    # === Gate 2: 声明式配置 ===
    behavior = permission_config.get_behavior(tool_name)
    if behavior == "allow":
        # allow 但仍需过路径安全检查
        pass
    elif behavior == "deny":
        return f"配置拒绝: {tool_name} 已被禁用"
    elif behavior == "ask":
        reason = f"需要审批: {tool_name}"
        group = permission_config.get_group_name(tool_name)
        if group:
            reason += f" (分组: {group})"
        return reason

    # === Gate 3: 路径安全检查 ===
    if tool_name == "read_file":
        path = args.get("path", "")
        if _is_sensitive_path(path):
            return f"读取系统敏感文件: {path}"

    if tool_name in ("write_file", "edit_file"):
        path = args.get("path", "")
        if _is_sensitive_path(path):
            return f"写入系统敏感路径: {path}"
        if _is_outside_workspace(path):
            return f"写入工作区外路径: {path}"

    if tool_name == "bash":
        cmd = args.get("command", "")
        if any(kw in cmd for kw in ["rm ", "> /etc/", "chmod 777"]):
            return f"潜在破坏性命令"
        if any(kw in cmd for kw in ["pip uninstall", "npm uninstall"]):
            return f"卸载包操作"

    # === 默认行为 ===
    # 未配置的工具默认 allow（路径安全检查仍生效）
    return None
