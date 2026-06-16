import * as fs from "fs/promises"
import * as path from "path"
import { z } from "zod"
import { make, type Content } from "../tool"

const SUPPORTED_IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"])
const SUPPORTED_IMAGE_MIMES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp",
}

const IGNORE_DIRS = new Set(["node_modules", ".git", ".svn", ".hg", "target", "dist", "build", ".next", ".nuxt", "venv", "__pycache__", ".cache", ".idea", ".vscode"])

async function realPath(p: string): Promise<string> {
  try { return await fs.realpath(p) } catch { return p }
}

function contains(root: string, target: string): boolean {
  const rel = path.relative(root, target)
  return !rel.startsWith("..") && !path.isAbsolute(rel)
}

const NATIVE_ENCODINGS = new Set(["utf-8", "utf8", "utf-16le", "utf16le", "latin1", "ascii", "hex", "base64"])

function decodeText(buffer: Buffer, encoding: string): string {
  if (NATIVE_ENCODINGS.has(encoding)) {
    return buffer.toString(encoding as any)
  }
  // GBK / Shift-JIS / Big5 -> iconv-lite
  try {
    const iconv = require("iconv-lite")
    if (iconv.encodingExists(encoding)) {
      return iconv.decode(buffer, encoding)
    }
  } catch {}
  throw new Error(`Unsupported encoding: ${encoding}`)
}

export const readFileTool = make({
  name: "read_file",
  description: "Read a text file or supported image, page through a large UTF-8 text file by line offset, or list a directory page. Relative paths resolve from workspace.",
  inputSchema: z.object({
    path: z.string().describe("File or directory path (absolute or relative to workspace)"),
    offset: z.number().optional().default(1).describe("1-based line or entry offset to start reading from"),
    limit: z.number().optional().describe("Max lines (for files) or entries (for directories) to read"),
    encoding: z.string().optional().describe("File encoding: utf-8 (default), utf-16le, latin1, gbk, shift-jis, big5. Requires iconv-lite for gbk/shift-jis/big5."),
  }),
  outputSchema: z.string(),
  permission: "read",
  toModelOutput(input, _output): Content[] {
    return []
  },
  async execute(input, ctx) {
    const absolute = path.resolve(ctx.workspace, input.path)
    if (!path.isAbsolute(input.path) && !contains(ctx.workspace, absolute)) {
      return { success: false, error: `Path escapes workspace: ${input.path}` }
    }

    const real = await realPath(absolute)
    const root = await realPath(ctx.workspace)
    if (!contains(root, real)) {
      return { success: false, error: `Path escapes workspace after symlink resolution: ${input.path}` }
    }

    const stat = await fs.stat(real).catch(() => null)
    if (!stat) return { success: false, error: `Path does not exist: ${input.path}` }

    // === 目录读取 ===
    if (stat.isDirectory()) {
      return await readDirectory(real, input, root)
    }

    // === 图片读取 ===
    const ext = path.extname(real).toLowerCase()
    if (SUPPORTED_IMAGE_EXTS.has(ext)) {
      const buffer = await fs.readFile(real)
      const mime = SUPPORTED_IMAGE_MIMES[ext] || "image/png"
      return {
        success: true,
        output: `${real} (${stat.size} bytes)\n${"─".repeat(40)}\n[图片] ${ext} 文件`,
        metadata: { mime, data: buffer.toString("base64"), name: path.basename(real) },
      }
    }

    // === 文本文件 ===
    const buffer = await fs.readFile(real)
    const isBinary = buffer.includes(0)
    if (isBinary) {
      const hints: Record<string, string> = {
        ".docx": "Word 文档", ".pdf": "PDF 文件", ".xlsx": "Excel 文件",
        ".exe": "可执行文件", ".zip": "ZIP 压缩包", ".dll": "动态链接库",
      }
      return { success: true, output: `${real} (${stat.size} bytes)\n${"─".repeat(40)}\n[二进制文件] ${hints[ext] || `二进制文件 (${ext})`}` }
    }

    return await readTextFile(real, buffer, input, (input as any).path)
  },
})

async function readTextFile(real: string, buffer: Buffer, input: { offset?: number; limit?: number; encoding?: string }, requestPath?: string): Promise<{ success: boolean; output: string }> {
  const enc = (input.encoding || "utf-8").toLowerCase()

  // 解码
  let text: string
  try {
    text = decodeText(buffer, enc)
  } catch (e: any) {
    // 如果指定编码解码失败，回退 UTF-8
    text = buffer.toString("utf-8")
    if (enc !== "utf-8") {
      return { success: true, output: `${real}\n${"-".repeat(40)}\n[编码警告] 指定编码 "${enc}" 解码失败，已回退 UTF-8。${e.message || ""}\n\n${text.slice(0, 50000)}` }
    }
  }

  // 检测 UTF-8 解码后是否有替换字符（疑似编码错误）
  if (enc === "utf-8" && text.includes("\uFFFD")) {
    return {
      success: true,
      output: `${real}\n${"-".repeat(40)}\n[编码提示] 文件包含无效的 UTF-8 字节序列。尝试指定 encoding 参数:
- GBK: read_file("${requestPath || real}", encoding="gbk")
- UTF-16: read_file("${requestPath || real}", encoding="utf-16le")
- Latin-1: read_file("${requestPath || real}", encoding="latin1")

文件前 200 字符:
${text.slice(0, 200)}`,
    }
  }

  const lines = text.split("\n")
  const total = lines.length
  const offset = (input.offset || 1) - 1 // 转 0-based
  const limit = input.limit || 0

  let content: string
  if (limit > 0) {
    const selected = lines.slice(offset, offset + limit)
    content = selected.join("\n")
    const header = `${real} (${total} lines, showing ${offset + 1}-${Math.min(offset + limit, total)})`
    if (offset + limit < total) content += `\n... (${total - offset - limit} more lines, use offset=${offset + limit + 1}&limit=${limit} to continue)`
    return { success: true, output: `${header}\n${"-".repeat(40)}\n${content}` }
  }

  content = text
  if (content.length > 50000) {
    content = content.slice(0, 50000) + "\n... (truncated at 50000 chars)"
  }
  return { success: true, output: `${real} (${statSizeText(content.length)})\n${"-".repeat(40)}\n${content}` }
}

async function readDirectory(real: string, input: { offset?: number; limit?: number }, root: string): Promise<{ success: boolean; output: string }> {
  const allEntries = await fs.readdir(real, { withFileTypes: true })
  const filtered = allEntries.filter((e) => !IGNORE_DIRS.has(e.name) && !e.name.startsWith("."))
  const total = filtered.length
  const offset = (input.offset || 1) - 1
  const limit = input.limit || 20

  const selected = filtered.slice(offset, offset + limit)
  const lines = selected.map((e) => {
    const icon = e.isDirectory() ? "📁" : e.isFile() ? "📄" : "🔗"
    return `${icon}  ${e.name}`
  })

  const relative = path.relative(root, real) || "."
  const header = `📁 ${relative}/ (${total} entries, showing ${offset + 1}-${Math.min(offset + limit, total)})`
  let output = `${header}\n${"-".repeat(40)}\n${lines.join("\n")}`

  if (offset + limit < total) {
    output += `\n... (${total - offset - limit} more, use read_file with offset=${offset + limit + 1} to continue)`
  }
  // 提示用户可以用 read_file 进入子目录
  const subdirs = selected.filter((e) => e.isDirectory() && !IGNORE_DIRS.has(e.name))
  if (subdirs.length > 0) {
    output += `\n\n子目录: ${subdirs.map((e) => e.name).join(", ")}`
  }

  return { success: true, output }
}

function statSizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
