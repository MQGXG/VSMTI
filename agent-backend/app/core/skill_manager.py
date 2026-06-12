"""技能管理系统 — 两级加载：目录在 SYSTEM 中，内容按需加载"""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

SKILLS_DIR = Path(__file__).resolve().parent.parent.parent / "skills"
SKILL_REGISTRY: dict[str, dict] = {}


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    """解析 SKILL.md 的 YAML frontmatter"""
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


def scan_skills():
    """扫描 skills/ 目录，填充注册表"""
    SKILL_REGISTRY.clear()
    if not SKILLS_DIR.exists():
        logger.info("技能目录不存在: %s", SKILLS_DIR)
        return
    for d in sorted(SKILLS_DIR.iterdir()):
        if not d.is_dir():
            continue
        manifest = d / "SKILL.md"
        if manifest.exists():
            raw = manifest.read_text(encoding="utf-8")
            meta, body = _parse_frontmatter(raw)
            name = meta.get("name", d.name)
            desc = meta.get("description", raw.split("\n")[0].lstrip("#").strip())
            SKILL_REGISTRY[name] = {
                "name": name,
                "description": desc,
                "content": raw,
            }
            logger.info("技能加载: %s — %s", name, desc)


def list_skills() -> str:
    """返回技能目录（用于注入 SYSTEM）"""
    if not SKILL_REGISTRY:
        return "(暂无可用技能)"
    return "\n".join(f"- {s['name']}: {s['description']}" for s in SKILL_REGISTRY.values())


def load_skill(name: str) -> str | None:
    """按名称加载技能完整内容"""
    skill = SKILL_REGISTRY.get(name)
    if not skill:
        available = ", ".join(SKILL_REGISTRY.keys()) or "(无)"
        return f"未找到技能: {name}。可用: {available}"
    return skill["content"]


# 启动时扫描
scan_skills()
