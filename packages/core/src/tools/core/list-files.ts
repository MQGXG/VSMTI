import * as fs from "fs/promises"
import * as path from "path"
import { z } from "zod"
import { make } from "../tool"

export const listFilesTool = make({
  name: "list_files",
  description: "List directory contents. Shows files and subdirectories with sizes.",
  inputSchema: z.object({
    path: z.string().optional().default(".").describe("Directory path (default: workspace root)"),
  }),
  outputSchema: z.string(),
  permission: "read",

  async execute(input, ctx) {
    const resolved = path.resolve(ctx.workspace, input.path || ".")
    const stat = await fs.stat(resolved)
    if (!stat.isDirectory()) return { success: false, error: `Not a directory: ${input.path}` }

    const entries = await fs.readdir(resolved, { withFileTypes: true })
    const dirs: string[] = []
    const files: string[] = []

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) dirs.push(`📁 ${entry.name}/`)
      else if (entry.isFile()) {
        try {
          const fileStat = await fs.stat(path.join(resolved, entry.name))
          files.push(`📄 ${entry.name} (${fileStat.size} bytes)`)
        } catch {
          files.push(`📄 ${entry.name}`)
        }
      }
    }

    const output = [...dirs, ...files]
    return {
      success: true,
      output: output.length > 0 ? output.join("\n") : "(empty directory)",
    }
  },
})
