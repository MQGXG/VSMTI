"""文件工具 — 使用新工具系统，支持结构化输出"""

import os
import mimetypes
from pathlib import Path
from datetime import datetime
from app.tools.base import BaseTool, ToolParam, ToolResult, ToolContext, ToolMeta
from app.core.workspace import workspace

# 编码优先级：UTF-8 > GBK > GB2312 > latin-1
_FALLBACK_ENCODINGS = ["utf-8", "gbk", "gb2312", "latin-1"]

# 二进制文件扩展名（不尝试读取内容）
_BINARY_EXTENSIONS = {
    # 图片
    ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".ico", ".webp", ".svg", ".tiff", ".tif",
    # 音频
    ".mp3", ".wav", ".flac", ".aac", ".ogg", ".wma", ".m4a",
    # 视频
    ".mp4", ".avi", ".mkv", ".mov", ".wmv", ".flv", ".webm", ".m4v",
    # 压缩包
    ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".tgz",
    # 文档（二进制格式）
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    # 可执行文件
    ".exe", ".dll", ".so", ".dylib", ".bin",
    # 数据库
    ".db", ".sqlite", ".sqlite3",
    # 其他
    ".pyc", ".pyo", ".class", ".o", ".obj",
}


def _resolve_path(path: str) -> Path:
    """解析路径：绝对路径原样，相对路径以工作目录为基准"""
    return workspace.resolve(path)


def _is_binary_file(path: Path) -> bool:
    """检测是否为二进制文件"""
    ext = path.suffix.lower()
    if ext in _BINARY_EXTENSIONS:
        return True
    try:
        with open(path, "rb") as f:
            chunk = f.read(8192)
            if b"\x00" in chunk:
                return True
    except Exception:
        pass
    return False


def _get_file_type_info(path: Path) -> str:
    """获取文件类型信息"""
    ext = path.suffix.lower()
    mime_type, _ = mimetypes.guess_type(str(path))
    
    type_map = {
        ".jpg": "JPEG 图片", ".jpeg": "JPEG 图片", ".png": "PNG 图片",
        ".gif": "GIF 图片", ".bmp": "BMP 图片", ".webp": "WebP 图片",
        ".svg": "SVG 矢量图", ".ico": "图标文件",
        ".mp3": "MP3 音频", ".wav": "WAV 音频", ".flac": "FLAC 音频",
        ".mp4": "MP4 视频", ".avi": "AVI 视频", ".mkv": "MKV 视频",
        ".zip": "ZIP 压缩包", ".rar": "RAR 压缩包", ".7z": "7Z 压缩包",
        ".pdf": "PDF 文档", ".doc": "Word 文档", ".docx": "Word 文档",
        ".xls": "Excel 表格", ".xlsx": "Excel 表格",
        ".ppt": "PPT 演示", ".pptx": "PPT 演示",
        ".exe": "可执行程序", ".dll": "动态链接库",
        ".db": "数据库", ".sqlite": "SQLite 数据库",
    }
    
    file_type = type_map.get(ext, ext.upper().lstrip(".") + " 文件" if ext else "未知类型")
    return f"{file_type} ({mime_type or '未知MIME类型'})"


def _read_text_with_fallback(path: Path) -> str:
    """尝试多种编码读取文本文件"""
    raw = path.read_bytes()
    for enc in _FALLBACK_ENCODINGS:
        try:
            return raw.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
    return raw.decode("utf-8", errors="replace")


def _format_size(size: int) -> str:
    """格式化文件大小"""
    for unit in ["B", "KB", "MB", "GB"]:
        if size < 1024:
            return f"{size:.1f}{unit}" if unit != "B" else f"{size}{unit}"
        size /= 1024
    return f"{size:.1f}TB"


class FileReadTool(BaseTool):
    """读取文件内容"""
    
    name = "read_file"
    description = "读取文件内容。支持文本文件（自动检测编码UTF-8/GBK/GB2312等）和二进制文件（返回元信息）。"

    parameters = [
        ToolParam(name="path", type="string", description="文件路径（绝对或相对路径）"),
        ToolParam(name="limit", type="integer", description="最多读取行数（仅文本文件有效）", required=False),
    ]

    @property
    def meta(self) -> ToolMeta:
        return ToolMeta(
            tags=["file", "read"],
            permission="read",
            readonly=True,
        )

    async def execute(self, context: ToolContext | None = None, path: str = "", limit: int | None = None, **kwargs) -> ToolResult:
        try:
            full_path = self._check_path(path)
            if not full_path.exists():
                return ToolResult(success=False, error=f"文件不存在: {full_path}")
            if not full_path.is_file():
                return ToolResult(success=False, error=f"不是文件: {path}")

            stat = full_path.stat()
            size = stat.st_size
            modified = datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
            
            if _is_binary_file(full_path):
                file_type = _get_file_type_info(full_path)
                output = (
                    f"📄 文件: {full_path.name}\n"
                    f"📁 路径: {full_path}\n"
                    f"📦 类型: {file_type}\n"
                    f"📏 大小: {size:,} 字节 ({_format_size(size)})\n"
                    f"📅 修改时间: {modified}\n\n"
                    f"⚠️ 这是二进制文件，无法直接读取内容。"
                )
                return ToolResult(
                    success=True, 
                    output=output,
                    metadata={"file_type": "binary", "size": size, "path": str(full_path)},
                )

            content = _read_text_with_fallback(full_path)
            if limit:
                lines = content.splitlines()
                content = "\n".join(lines[:limit])
                if len(lines) > limit:
                    content += f"\n... (共 {len(lines)} 行，显示前 {limit} 行)"

            max_chars = 50000
            if len(content) > max_chars:
                content = content[:max_chars] + f"\n... (内容过长，截断至 {max_chars} 字符)"

            header = f"📄 {full_path.name} ({size:,} 字节, 修改于 {modified})\n{'─' * 40}\n"
            return ToolResult(
                success=True, 
                output=header + content,
                metadata={"file_type": "text", "size": size, "path": str(full_path), "encoding": "auto"},
            )
        except PermissionError:
            return ToolResult(success=False, error=f"无权限读取: {path}")
        except Exception as e:
            return ToolResult(success=False, error=str(e))


class FileWriteTool(BaseTool):
    """写入文件内容"""
    
    name = "write_file"
    description = "写入文件内容。超出工作区路径会触发权限审批。"

    parameters = [
        ToolParam(name="path", type="string", description="文件路径（绝对或相对路径）"),
        ToolParam(name="content", type="string", description="文件内容"),
    ]

    @property
    def meta(self) -> ToolMeta:
        return ToolMeta(
            tags=["file", "write"],
            permission="edit",
            dangerous=False,
        )

    async def execute(self, context: ToolContext | None = None, path: str = "", content: str = "", **kwargs) -> ToolResult:
        try:
            full_path = self._check_path(path)
            full_path.parent.mkdir(parents=True, exist_ok=True)
            full_path.write_text(content, encoding="utf-8")
            return ToolResult(
                success=True, 
                output=f"已写入 {len(content)} 字节到 {full_path}",
                metadata={"path": str(full_path), "bytes_written": len(content)},
            )
        except PermissionError:
            return ToolResult(success=False, error=f"无权限写入: {path}")
        except Exception as e:
            return ToolResult(success=False, error=str(e))


class FileListTool(BaseTool):
    """列出目录内容"""
    
    name = "list_files"
    description = "列出目录中的文件和子目录。支持绝对路径和相对路径。"

    parameters = [
        ToolParam(name="path", type="string", description="目录路径（绝对或相对，默认为当前目录）", required=False),
    ]

    @property
    def meta(self) -> ToolMeta:
        return ToolMeta(
            tags=["file", "read", "list"],
            permission="read",
            readonly=True,
        )

    async def execute(self, context: ToolContext | None = None, path: str = "", **kwargs) -> ToolResult:
        try:
            target = self._check_path(path) if path else workspace.path
            if not target.exists():
                return ToolResult(success=False, error=f"目录不存在: {target}")
            if not target.is_dir():
                return ToolResult(success=False, error=f"不是目录: {path}")

            items = []
            dirs = []
            files = []
            for f in sorted(target.iterdir()):
                try:
                    size = f.stat().st_size if f.is_file() else 0
                    if f.is_dir():
                        dirs.append(f"📁 {f.name}/")
                    else:
                        files.append(f"📄 {f.name} ({_format_size(size)})")
                except OSError:
                    items.append(f"❓ {f.name}")

            result = dirs + files
            return ToolResult(
                success=True, 
                output="\n".join(result) if result else "目录为空",
                metadata={"path": str(target), "dirs": len(dirs), "files": len(files)},
            )
        except PermissionError:
            return ToolResult(success=False, error=f"无权限访问: {path}")
        except Exception as e:
            return ToolResult(success=False, error=str(e))
