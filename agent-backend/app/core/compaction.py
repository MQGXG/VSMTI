"""上下文压缩管线 — 4层：budget→snip→micro→auto，便宜的先跑"""

import json
import logging
import time
from pathlib import Path

logger = logging.getLogger(__name__)

KEEP_RECENT_TOOL_RESULTS = 3
PERSIST_THRESHOLD = 30000
CONTEXT_LIMIT_CHARS = 50000
RESERVED_BUFFER = 10000  # 压缩预留缓冲区，防止压缩过程中溢出
TRANSCRIPT_DIR = Path(__file__).resolve().parent.parent.parent / ".transcripts"
TOOL_RESULTS_DIR = Path(__file__).resolve().parent.parent.parent / ".task_outputs" / "tool-results"


def estimate_size(messages: list) -> int:
    return len(json.dumps(messages, default=str))


def _is_tool_result_block(block) -> bool:
    return isinstance(block, dict) and block.get("type") == "tool_result"


def _message_has_tool_use(msg: dict) -> bool:
    if msg.get("role") != "assistant":
        return False
    content = msg.get("content")
    if not isinstance(content, list):
        return False
    return any(b.get("type") == "tool_use" for b in content if isinstance(b, dict))


def _is_tool_result_message(msg: dict) -> bool:
    if msg.get("role") != "user":
        return False
    content = msg.get("content")
    if not isinstance(content, list):
        return False
    return any(_is_tool_result_block(b) for b in content)


# L1: 裁中间消息
def snip_compact(messages: list, max_messages: int = 50) -> list:
    if len(messages) <= max_messages:
        return messages
    head_end, tail_start = 3, len(messages) - (max_messages - 3)
    if head_end > 0 and _message_has_tool_use(messages[head_end - 1]):
        while head_end < len(messages) and _is_tool_result_message(messages[head_end]):
            head_end += 1
    if (tail_start > 0 and tail_start < len(messages)
            and _is_tool_result_message(messages[tail_start])
            and _message_has_tool_use(messages[tail_start - 1])):
        tail_start -= 1
    if head_end >= tail_start:
        return messages
    snipped = tail_start - head_end
    logger.info("[Compact] L1 snip: 裁掉 %d 条中间消息", snipped)
    return (messages[:head_end]
            + [{"role": "user", "content": f"[截断了 {snipped} 条中间对话]"}]
            + messages[tail_start:])


# L2: 旧 tool_result 占位
def micro_compact(messages: list) -> list:
    tool_results = []
    for mi, msg in enumerate(messages):
        if msg.get("role") != "user" or not isinstance(msg.get("content"), list):
            continue
        for bi, block in enumerate(msg["content"]):
            if _is_tool_result_block(block):
                tool_results.append((mi, bi, block))
    if len(tool_results) <= KEEP_RECENT_TOOL_RESULTS:
        return messages
    for _, _, block in tool_results[:-KEEP_RECENT_TOOL_RESULTS]:
        if len(str(block.get("content", ""))) > 120:
            block["content"] = "[较早的工具执行结果已压缩，需要时重新运行]"
    logger.info("[Compact] L2 micro: %d 条旧结果占位",
                len(tool_results) - KEEP_RECENT_TOOL_RESULTS)
    return messages


# L3: 大结果落盘
def persist_large_output(tool_use_id: str, output: str) -> str:
    if len(output) <= PERSIST_THRESHOLD:
        return output
    TOOL_RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    path = TOOL_RESULTS_DIR / f"{tool_use_id}.txt"
    if not path.exists():
        path.write_text(output, encoding="utf-8")
    logger.info("[Compact] L3 persist: %s (%d chars → disk)", tool_use_id, len(output))
    return (f"<持久化输出>\n完整内容: {path}\n预览:\n{output[:2000]}\n</持久化输出>")


def tool_result_budget(messages: list, max_bytes: int = 200_000) -> list:
    if not messages:
        return messages
    last = messages[-1]
    if last.get("role") != "user" or not isinstance(last.get("content"), list):
        return messages
    blocks = [(i, b) for i, b in enumerate(last["content"]) if _is_tool_result_block(b)]
    total = sum(len(str(b.get("content", ""))) for _, b in blocks)
    if total <= max_bytes:
        return messages
    for _, block in sorted(blocks, key=lambda p: len(str(p[1].get("content", ""))), reverse=True):
        if total <= max_bytes:
            break
        text = str(block.get("content", ""))
        block["content"] = persist_large_output(block.get("tool_use_id", "unknown"), text)
        total = sum(len(str(b.get("content", ""))) for _, b in blocks)
    return messages


# L4: 全量摘要
async def summarize_history(messages: list, llm_call) -> str:
    """调用 LLM 生成对话摘要"""
    conversation = json.dumps(messages, default=str)[:80000]
    prompt = ("总结这段编码对话以便继续工作。保留：当前目标、关键发现、已修改文件、"
              "剩余工作和用户约束。\n\n" + conversation)
    summary = await llm_call(prompt)
    logger.info("[Compact] L4 auto: 生成摘要")
    return summary or "(空摘要)"


async def compact_history(messages: list, llm_call) -> list:
    TRANSCRIPT_DIR.mkdir(parents=True, exist_ok=True)
    path = TRANSCRIPT_DIR / f"transcript_{int(time.time())}.jsonl"
    with open(path, "w", encoding="utf-8") as f:
        for msg in messages:
            f.write(json.dumps(msg, default=str) + "\n")
    logger.info("[Compact] transcript 已保存: %s", path)
    summary = await summarize_history(messages, llm_call)
    return [{"role": "user", "content": f"[已压缩]\n\n{summary}"}]


async def reactive_compact(messages: list, llm_call) -> list:
    TRANSCRIPT_DIR.mkdir(parents=True, exist_ok=True)
    path = TRANSCRIPT_DIR / f"reactive_{int(time.time())}.jsonl"
    with open(path, "w", encoding="utf-8") as f:
        for msg in messages:
            f.write(json.dumps(msg, default=str) + "\n")
    summary = await summarize_history(messages, llm_call)
    tail = messages[-5:]
    return [{"role": "user", "content": f"[应急压缩]\n\n{summary}"}, *tail]


async def run_compaction_pipeline(messages: list, llm_call) -> list:
    """执行完整压缩管线（budget→snip→micro→auto）

    在接近上限 RESERVED_BUFFER 时提前触发，防止压缩过程中溢出。
    """
    messages = tool_result_budget(messages)
    messages = snip_compact(messages)
    messages = micro_compact(messages)

    trigger_at = CONTEXT_LIMIT_CHARS - RESERVED_BUFFER
    current_size = estimate_size(messages)

    if current_size > CONTEXT_LIMIT_CHARS:
        logger.warning("[Compact] 上下文超限 %d > %d，执行 auto compact", current_size, CONTEXT_LIMIT_CHARS)
        messages = await compact_history(messages, llm_call)
    elif current_size > trigger_at:
        logger.info("[Compact] 接近上限 %d > %d (触发于 %d)，执行 auto compact",
                    current_size, CONTEXT_LIMIT_CHARS, trigger_at)
        messages = await compact_history(messages, llm_call)
    return messages
