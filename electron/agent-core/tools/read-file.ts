import * as fs from "fs/promises"
import * as path from "path"
import { z } from "zod"
import { make } from "../tool"

export const readFileTool = make({
  name: "read_file",
  description: "Read file contents. Supports text files with auto-encoding detection. Relative paths resolve from workspace.",
  inputSchema: z.object({
    path: z.string().describe("File path (absolute or relative to workspace)"),
    limit: z.number().optional().describe("Max lines to read"),
  }),
  outputSchema: z.string(),
  permission: "read",
  async execute(input, ctx) {
    const resolved = path.resolve(ctx.workspace, input.path)
    if (!resolved.startsWith(ctx.workspace)) {
      return { success: false, error: `Path escapes workspace: ${input.path}` }
    }
    const stat = await fs.stat(resolved)
    if (!stat.isFile()) return { success: false, error: `Not a file: ${input.path}` }

    // 检测二进制文件
    const buffer = await fs.readFile(resolved)
    const isBinary = buffer.includes(0) // 包含 null 字节即为二进制
    if (isBinary) {
      const ext = path.extname(resolved).toLowerCase()
      const binaryHints: Record<string, string> = {
        '.docx': 'Word 文档（.docx）。建议用 .docx 到 .md 转换工具处理后阅读',
        '.pdf': 'PDF 文件。建议用 PDF 阅读器打开',
        '.xlsx': 'Excel 文件。建议用 Excel 打开',
        '.png': '图片文件',
        '.jpg': '图片文件',
        '.jpeg': '图片文件',
        '.gif': '图片文件',
        '.exe': '可执行文件',
        '.zip': 'ZIP 压缩包',
        '.dll': '动态链接库',
      }
      const hint = binaryHints[ext] || `二进制文件 (${ext})，无法直接读取文本内容`
      return { success: true, output: `${resolved} (${stat.size} bytes)\n${"─".repeat(40)}\n[二进制文件] ${hint}` }
    }

    let content = buffer.toString("utf-8")
    if (input.limit && input.limit > 0) {
      const lines = content.split("\n")
      content = lines.slice(0, input.limit).join("\n")
      if (lines.length > input.limit) content += `\n... (${lines.length} total, showing ${input.limit})`
    }
    const maxChars = 50000
    if (content.length > maxChars) content = content.slice(0, maxChars) + `\n... (truncated at ${maxChars} chars)`
    return {
      success: true,
      output: `${resolved} (${stat.size} bytes)\n${"-".repeat(40)}\n${content}`,
    }
  },
})
