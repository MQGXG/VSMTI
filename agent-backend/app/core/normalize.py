"""消息规范化 — 发送前清理消息列表以符合 API 协议"""

import logging

logger = logging.getLogger(__name__)

INTERNAL_PREFIXES = ("_internal", "_source", "_timestamp")


def _has_tool_use(content) -> bool:
    if not isinstance(content, list):
        return False
    for block in content:
        if isinstance(block, dict) and block.get("type") == "tool_use":
            return True
        if hasattr(block, "type") and getattr(block, "type") == "tool_use":
            return True
    return False


def _is_tool_result_block(block) -> bool:
    return isinstance(block, dict) and block.get("type") == "tool_result"


def normalize_messages(messages: list) -> list:
    """将内部消息列表规范化为 API 可接受的格式。

    三条约束:
    1. 每个 tool_use 必须有匹配的 tool_result
    2. user/assistant 消息必须严格交替
    3. 只接受协议定义的字段
    """
    if not messages:
        return messages

    normalized = []

    # Step 1: 剥离内部字段
    for msg in messages:
        clean = {"role": msg.get("role", "user")}
        content = msg.get("content", "")
        if isinstance(content, str):
            clean["content"] = content
        elif isinstance(content, list):
            clean["content"] = [
                {k: v for k, v in block.items()
                 if isinstance(block, dict) and not k.startswith(INTERNAL_PREFIXES)}
                if isinstance(block, dict) else block
                for block in content
            ]
        else:
            clean["content"] = str(content)
        normalized.append(clean)

    # Step 2: tool_result 配对补齐
    existing_results = set()
    for msg in normalized:
        if isinstance(msg.get("content"), list):
            for block in msg["content"]:
                if isinstance(block, dict) and _is_tool_result_block(block):
                    tid = block.get("tool_use_id")
                    if tid:
                        existing_results.add(tid)

    for msg in normalized:
        if msg.get("role") != "assistant":
            continue
        content = msg.get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if not isinstance(block, dict):
                continue
            if (block.get("type") == "tool_use"
                    and block.get("id") not in existing_results):
                normalized.append({
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": block["id"],
                        "content": "(cancelled)",
                    }],
                })

    # Step 3: 合并连续同角色消息
    merged = [normalized[0]] if normalized else []
    for msg in normalized[1:]:
        if msg["role"] == merged[-1]["role"]:
            prev = merged[-1]
            prev_content = prev.get("content", "")
            curr_content = msg.get("content", "")

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
