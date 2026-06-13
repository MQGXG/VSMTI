"""消息规范化 — 发送前清理消息列表以符合 API 协议"""

import logging

logger = logging.getLogger(__name__)

INTERNAL_PREFIXES = ("_internal", "_source", "_timestamp")

ALLOWED_FIELDS = {
    "system": {"role", "content"},
    "user": {"role", "content"},
    "assistant": {"role", "content", "tool_calls"},
    "tool": {"role", "content", "tool_call_id"},
}


def _clean_value(v):
    if isinstance(v, str):
        return v
    if isinstance(v, (int, float, bool)):
        return v
    if v is None:
        return None
    if isinstance(v, dict):
        return {k: _clean_value(v) for k, v in v.items() if not k.startswith(INTERNAL_PREFIXES)}
    if isinstance(v, list):
        return [_clean_value(i) for i in v]
    return str(v)


def normalize_messages(messages: list) -> list:
    if not messages:
        return messages

    normalized = []

    for msg in messages:
        role = msg.get("role", "user")
        allowed = ALLOWED_FIELDS.get(role, {"role", "content"})

        clean = {"role": role}
        for field in allowed:
            if field == "role":
                continue
            value = msg.get(field)
            if value is not None:
                clean[field] = _clean_value(value)

        normalized.append(clean)

    merged = [normalized[0]] if normalized else []
    for msg in normalized[1:]:
        if msg["role"] == merged[-1]["role"]:
            prev = merged[-1]
            prev_content = prev.get("content", "")
            curr_content = msg.get("content", "")

            if not prev_content and not curr_content:
                merged.pop()
                merged.append(msg)
                continue
            elif not curr_content:
                continue
            elif not prev_content:
                merged.pop()
                merged.append(msg)
                continue

            prev_list = prev_content if isinstance(prev_content, list) else (
                [{"type": "text", "text": str(prev_content)}] if prev_content else []
            )
            curr_list = curr_content if isinstance(curr_content, list) else (
                [{"type": "text", "text": str(curr_content)}] if curr_content else []
            )
            merged[-1]["content"] = prev_list + curr_list
        else:
            merged.append(msg)

    return merged
