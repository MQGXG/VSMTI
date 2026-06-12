"""三道闸门权限系统 — Gate 1:硬拒绝, Gate 2:规则匹配, Gate 3:用户审批"""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Gate 1: 硬拒绝列表 — 永远禁止的操作
DENY_LIST = [
    "rm -rf /", "sudo", "shutdown", "reboot",
    "mkfs", "dd if=", "> /dev/sda", "> /dev/sd",
    ":(){ :|:& };:",  # fork 炸弹
    "wget -O /dev/null", "curl -o /dev/null",
]

# Gate 2: 权限规则 — 上下文相关的检查
SENSITIVE_DIRS = [
    "/etc", "/var", "/sys", "/proc", "/boot", "/dev",
    "/usr/lib", "/usr/include", "/System", "/Library",
    "c:/windows", "c:/program files", "c:/programdata",
    "c:/system32", "c:/users/all users",
]


def _is_sensitive_path(path: str) -> bool:
    p = path.replace("\\", "/").lower()
    for d in SENSITIVE_DIRS:
        if p.startswith(d):
            return True
    return False


PERMISSION_RULES = [
    {
        "tools": ["read_file"],
        "check": lambda args: _is_sensitive_path(args.get("path", "")),
        "message": "读取系统敏感文件",
    },
    {
        "tools": ["write_file", "edit_file"],
        "check": lambda args: (
            "../" in args.get("path", "")
            or args.get("path", "").startswith("/")
            or args.get("path", "").startswith("~")
        ),
        "message": "写入工作区外路径",
    },
    {
        "tools": ["bash"],
        "check": lambda args: any(kw in args.get("command", "") for kw in ["rm ", "> /etc/", "chmod 777"]),
        "message": "潜在破坏性命令",
    },
    {
        "tools": ["bash"],
        "check": lambda args: any(kw in args.get("command", "") for kw in ["pip uninstall", "npm uninstall"]),
        "message": "卸载包操作",
    },
]


def check_deny_list(command: str) -> str | None:
    """Gate 1: 硬拒绝检查"""
    for pattern in DENY_LIST:
        if pattern in command:
            return f"被拒绝: '{pattern}' 在硬拒绝列表中"
    return None


def check_rules(tool_name: str, args: dict) -> str | None:
    """Gate 2: 规则匹配"""
    for rule in PERMISSION_RULES:
        if tool_name in rule["tools"] and rule["check"](args):
            return rule["message"]
    return None


def need_user_approval(tool_name: str, args: dict) -> str | None:
    """返回需要审批的原因，None 表示直接通过"""
    if tool_name == "bash":
        reason = check_deny_list(args.get("command", ""))
        if reason:
            return reason
    reason = check_rules(tool_name, args)
    return reason
