import * as fs from "fs/promises"
import * as path from "path"
import { z } from "zod"
import { make } from "../tool"

export const writeFileTool = make({
  name: "write_file",
  description: "Write content to a file. Creates parent directories if needed.",
  inputSchema: z.object({
    path: z.string().describe("File path (absolute or relative)"),
    content: z.string().describe("Content to write"),
  }),
  outputSchema: z.string(),
  permission: "edit",
  async execute(input, ctx) {
    const resolved = path.resolve(ctx.workspace, input.path)
    await fs.mkdir(path.dirname(resolved), { recursive: true })
    await fs.writeFile(resolved, input.content, "utf-8")
    return { success: true, output: `Wrote ${input.content.length} bytes to ${resolved}` }
  },
})
