import * as fs from "fs/promises"
import * as path from "path"
import { z } from "zod"
import { make, type Content } from "../tool"

async function realPath(p: string): Promise<string> {
  try { return await fs.realpath(p) } catch { return p }
}

function contains(root: string, target: string): boolean {
  const rel = path.relative(root, target)
  return !rel.startsWith("..") && !path.isAbsolute(rel)
}

export const writeFileTool = make({
  name: "write_file",
  description: "Create a new file or completely replace file content. Creates parent directories automatically. Use for new files or full rewrites. Use when: creating new files, saving generated code, writing config files, completely replacing file content.",
  inputSchema: z.object({
    path: z.string().describe("File path (absolute or relative)"),
    content: z.string().describe("Content to write"),
  }),
  outputSchema: z.string(),
  permission: "edit",
  toModelOutput(input, output): Content[] {
    return [{ type: "text", text: typeof output === "string" ? output : "" }]
  },
  async execute(input, ctx) {
    const absolute = path.resolve(ctx.workspace, input.path)
    if (!path.isAbsolute(input.path) && !contains(ctx.workspace, absolute)) {
      return { success: false, error: `Path escapes workspace: ${input.path}` }
    }
    const root = await realPath(ctx.workspace)
    const resolved = path.resolve(root, input.path)
    if (!contains(root, resolved)) {
      return { success: false, error: `Path escapes workspace: ${input.path}` }
    }

    await fs.mkdir(path.dirname(resolved), { recursive: true })

    // BOM 检测：如果原文件有 BOM，保留；否则按内容决定
    let content = input.content
    try {
      const existing = await fs.readFile(resolved, "utf-8")
      if (existing.startsWith("\uFEFF") && !content.startsWith("\uFEFF")) {
        content = "\uFEFF" + content
      }
    } catch {
      // 文件不存在，忽略
    }

    await fs.writeFile(resolved, content, "utf-8")
    return { success: true, output: `Wrote ${content.length} bytes to ${resolved}` }
  },
})
