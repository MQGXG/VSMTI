"""记忆系统 — .memory/ 文件 + MEMORY.md 索引 + 提取 + 整理 + 边界管控"""

import json
import logging
import re
import time
from pathlib import Path

logger = logging.getLogger(__name__)

MEMORY_DIR = Path(__file__).resolve().parent.parent.parent / ".memory"
MEMORY_INDEX = MEMORY_DIR / "MEMORY.md"
CONSOLIDATE_THRESHOLD = 10

# 不应存入记忆的内容关键词（用于过滤）
EXCLUDED_PATTERNS = [
    r"(?:src|app|lib|tests?)/[\w/.]+",     # 文件路径
    r"def \w+\(.*\):",                      # 函数签名
    r"class \w+",                           # 类名
    r"^import ",                            # import 语句
    r"^from .+ import ",                    # from import
    r"(?:password|secret|token|key|api_key)",  # 凭证
    r"(?:分支|branch|PR|commit)\s*:?\s*\S+",   # 临时分支/PR
    r"当前(?:分支|目录|任务).*",             # 当前状态
]

# 禁止存储的记忆类型
FORBIDDEN_MEMORY_PATTERNS = [
    "当前分支", "今天改了", "本周 PR", "现在正在",
    "当前工作目录", "当前目录", "task_",
    "branch:", "分支名",
]


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text
    meta = {}
    for line in parts[1].strip().splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip().strip('"').strip("'")
    return meta, parts[2].strip()


def _rebuild_index():
    """重建 MEMORY.md 索引"""
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    lines = []
    for f in sorted(MEMORY_DIR.glob("*.md")):
        if f.name == "MEMORY.md":
            continue
        raw = f.read_text(encoding="utf-8")
        meta, body = _parse_frontmatter(raw)
        name = meta.get("name", f.stem)
        desc = meta.get("description", body.split("\n")[0][:80])
        lines.append(f"- [{name}]({f.name}) — {desc}")
    MEMORY_INDEX.write_text("\n".join(lines) + "\n" if lines else "", encoding="utf-8")


def _is_valid_memory(name: str, description: str, body: str) -> tuple[bool, str]:
    """检查记忆是否符合存储规则"""
    combined = (name + " " + description + " " + body).lower()

    for pattern in FORBIDDEN_MEMORY_PATTERNS:
        if pattern.lower() in combined:
            return False, f"包含禁止内容: {pattern}"

    for pattern in EXCLUDED_PATTERNS:
        if re.search(pattern, combined):
            return False, f"包含不应存储的临时信息"

    if len(body) < 10:
        return False, "内容过短"

    if len(body) > 5000:
        return False, "内容过长"

    return True, ""


def write_memory(name: str, mem_type: str, description: str, body: str,
                 scope: str = "private") -> Path | None:
    """写入一条记忆（含边界检查 + 作用域）

    scope: 'private' 仅当前用户可见, 'team' 团队共享
    """
    valid, reason = _is_valid_memory(name, description, body)
    if not valid:
        logger.debug("[Memory] 拒绝写入 '%s': %s", name, reason)
        return None

    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    slug = name.lower().replace(" ", "-").replace("/", "-")
    filepath = MEMORY_DIR / f"{slug}.md"
    filepath.write_text(
        f"---\nname: {name}\ndescription: {description}\ntype: {mem_type}\n"
        f"scope: {scope}\n---\n\n{body}\n",
        encoding="utf-8",
    )
    _rebuild_index()
    logger.info("[Memory] 写入: %s (%s, scope=%s)", name, mem_type, scope)
    return filepath


def read_memory_index() -> str:
    """读取 MEMORY.md 索引"""
    if not MEMORY_INDEX.exists():
        return ""
    return MEMORY_INDEX.read_text(encoding="utf-8").strip()


def list_memory_files() -> list[dict]:
    """列出所有记忆文件"""
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    result = []
    for f in sorted(MEMORY_DIR.glob("*.md")):
        if f.name == "MEMORY.md":
            continue
        raw = f.read_text(encoding="utf-8")
        meta, body = _parse_frontmatter(raw)
        result.append({
            "filename": f.name,
            "name": meta.get("name", f.stem),
            "description": meta.get("description", ""),
            "type": meta.get("type", "user"),
            "body": body,
        })
    return result


def _keyword_match(messages: list, files: list, max_items: int = 5) -> list[str]:
    """关键词匹配降级方案"""
    recent_texts = []
    for msg in reversed(messages):
        if msg.get("role") == "user":
            content = msg.get("content", "")
            if isinstance(content, list):
                content = " ".join(str(b) for b in content if hasattr(b, "text"))
            if isinstance(content, str) and content.strip():
                recent_texts.append(content)
            if len(recent_texts) >= 3:
                break
    recent = " ".join(reversed(recent_texts))[:2000]
    if not recent.strip():
        return []

    keywords = [w.lower() for w in recent.split() if len(w) > 3]
    selected = []
    for f in files:
        text = (f["name"] + " " + f["description"]).lower()
        if any(kw in text for kw in keywords):
            selected.append(f["filename"])
            if len(selected) >= max_items:
                break
    return selected


async def select_relevant_memories(messages: list, llm_call, max_items: int = 5) -> list[str]:
    """选择与当前对话相关的记忆文件"""
    files = list_memory_files()
    if not files:
        return []

    recent_texts = []
    for msg in reversed(messages):
        if msg.get("role") == "user":
            content = msg.get("content", "")
            if isinstance(content, list):
                content = " ".join(str(b) for b in content if hasattr(b, "text"))
            if isinstance(content, str) and content.strip():
                recent_texts.append(content)
            if len(recent_texts) >= 3:
                break
    recent = " ".join(reversed(recent_texts))[:2000]
    if not recent.strip():
        return []

    catalog = "\n".join(f"{i}: {f['name']} — {f['description']}" for i, f in enumerate(files))
    prompt = ("根据最近对话和记忆目录，选择相关的记忆索引。"
              f"只返回 JSON 数组如 [0, 3]。不相关返回 []。\n\n"
              f"最近对话:\n{recent}\n\n记忆目录:\n{catalog}")

    try:
        text = await llm_call(prompt)
        match = re.search(r'\[.*?\]', text, re.DOTALL)
        if match:
            indices = json.loads(match.group())
            selected = []
            for idx in indices:
                if isinstance(idx, int) and 0 <= idx < len(files) and len(selected) < max_items:
                    selected.append(files[idx]["filename"])
            return selected
    except Exception:
        pass
    return _keyword_match(messages, files, max_items)


async def extract_memories(messages: list, llm_call):
    """从对话中提取新记忆"""
    dialogue_parts = []
    for msg in messages[-10:]:
        content = msg.get("content", "")
        if isinstance(content, list):
            content = " ".join(str(b) for b in content if hasattr(b, "text"))
        if isinstance(content, str) and content.strip():
            dialogue_parts.append(f"{msg['role']}: {content}")
    dialogue = "\n".join(dialogue_parts)
    if not dialogue.strip():
        return

    existing = list_memory_files()
    existing_desc = "\n".join(f"- {m['name']}: {m['description']}" for m in existing) if existing else "(无)"

    prompt = ("从对话中提取用户偏好、约束或项目事实。"
              "返回 JSON 数组，每项含 name, type(user/feedback/project/reference), "
              "description, body, scope(private/team)。"
              "规则：不要提取文件路径、函数签名、当前任务状态等临时信息。"
              "scope=private 用于个人偏好和反馈，scope=team 用于团队约定。"
              "如果没有新内容或已有记录，返回 []。\n\n"
              f"已有记忆:\n{existing_desc}\n\n对话:\n{dialogue[:4000]}")

    try:
        text = await llm_call(prompt)
        match = re.search(r'\[.*\]', text, re.DOTALL)
        if not match:
            return
        items = json.loads(match.group())
        count = 0
        for mem in items:
            name = mem.get("name", f"memory_{int(time.time())}")
            if mem.get("description") and mem.get("body"):
                result = write_memory(
                    name, mem.get("type", "user"),
                    mem["description"], mem["body"],
                    scope=mem.get("scope", "private"),
                )
                if result:
                    count += 1
        if count:
            logger.info("[Memory] 提取 %d 条新记忆", count)
    except Exception as e:
        logger.debug("[Memory] 提取失败: %s", e)


async def consolidate_memories(llm_call):
    """整理记忆：去重合并"""
    files = list_memory_files()
    if len(files) < CONSOLIDATE_THRESHOLD:
        return

    catalog = "\n\n".join(f"## {f['filename']}\n{f['body']}" for f in files)
    prompt = ("整理以下记忆文件。规则：1.合并重复 2.删除过时 3.保留总数不超过30 "
              "4.优先保留用户偏好。返回 JSON 数组，每项含 name, type, description, body。\n\n"
              f"{catalog[:16000]}")

    try:
        text = await llm_call(prompt)
        match = re.search(r'\[.*\]', text, re.DOTALL)
        if not match:
            return
        items = json.loads(match.group())

        for f in MEMORY_DIR.glob("*.md"):
            if f.name != "MEMORY.md":
                f.unlink()

        for mem in items:
            if mem.get("description") and mem.get("body"):
                write_memory(mem["name"], mem.get("type", "user"), mem["description"], mem["body"])

        logger.info("[Memory] 整理: %d → %d 条", len(files), len(items))
    except Exception as e:
        logger.debug("[Memory] 整理失败: %s", e)


async def load_relevant_memories(messages: list, llm_call,
                                scope_filter: str | None = None) -> str:
    """加载相关记忆内容，用于注入上下文

    scope_filter: None=全部, 'private'=仅私有, 'team'=仅团队
    """
    selected = await select_relevant_memories(messages, llm_call)
    if not selected:
        return ""

    parts = ["<相关记忆>"]
    for filename in selected:
        path = MEMORY_DIR / filename
        if path.exists():
            content = path.read_text(encoding="utf-8")
            if scope_filter:
                meta, _ = _parse_frontmatter(content)
                mem_scope = meta.get("scope", "private")
                if mem_scope != scope_filter:
                    continue
            parts.append(content)
    parts.append("</相关记忆>")
    return "\n\n".join(parts)
