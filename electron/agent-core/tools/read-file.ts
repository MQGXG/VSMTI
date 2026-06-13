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
    let content = await fs.readFile(resolved, "utf-8")
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
