"""Hook 事件系统 — 4 个事件点挂载扩展逻辑"""

from typing import Any, Callable, Coroutine

HookCallback = Callable[..., Coroutine[Any, Any, str | None]]


class Hooks:
    """事件总线：注册和触发钩子"""

    def __init__(self):
        self._hooks: dict[str, list[HookCallback]] = {
            "UserPromptSubmit": [],
            "PreToolUse": [],
            "PostToolUse": [],
            "Stop": [],
        }

    def register(self, event: str, callback: HookCallback):
        if event not in self._hooks:
            raise ValueError(f"未知事件: {event}，可选: {list(self._hooks.keys())}")
        self._hooks[event].append(callback)

    async def trigger(self, event: str, *args) -> str | None:
        if event not in self._hooks:
            return None
        for cb in self._hooks[event]:
            result = await cb(*args)
            if result is not None:
                return result
        return None

    @property
    def events(self) -> list[str]:
        return list(self._hooks.keys())


hooks = Hooks()
