import * as fs from "fs/promises"
import * as path from "path"
import { z } from "zod"
import { make } from "../tool"

export const editFileTool = make({
  name: "edit_file",
  description:
    "Replace exact text in one file. Uses exact string matching. oldString must match exactly including whitespace and indentation. Set replaceAll to true to replace all occurrences.",
  inputSchema: z.object({
    path: z.string().describe("File path to edit (absolute or relative to workspace)"),
    oldString: z.string().describe("Exact text to replace"),
    newString: z.string().describe("Replacement text, must differ from oldString"),
    replaceAll: z.boolean().optional().default(false).describe("Replace all occurrences (default false)"),
  }),
  outputSchema: z.string(),
  permission: "edit",

  async execute(input, ctx) {
    const resolved = path.resolve(ctx.workspace, input.path)
    if (!resolved.startsWith(ctx.workspace)) {
      return { success: false, error: `Path escapes workspace: ${input.path}` }
    }

    if (input.oldString === input.newString) {
      return { success: false, error: "oldString and newString are identical, no changes to apply" }
    }

    if (input.oldString === "") {
      return { success: false, error: "oldString must not be empty. Use write_file to create files." }
    }

    let content: string
    try {
      content = await fs.readFile(resolved, "utf-8")
    } catch (e: unknown) {
      return { success: false, error: `Cannot read ${input.path}: ${e}` }
    }

    // Normalize line endings for matching
    const normalize = (s: string) => s.replace(/\r\n/g, "\n")
    const fileEnding = content.includes("\r\n") ? "\r\n" : "\n"
    const normalized = normalize(content)
    const oldNorm = normalize(input.oldString)
    const newNorm = normalize(input.newString)

    // Count occurrences
    const count = normalized.split(oldNorm).length - 1
    if (count === 0) {
      return {
        success: false,
        error: "Could not find oldString in the file. It must match exactly, including whitespace and indentation.",
      }
    }
    if (count > 1 && !input.replaceAll) {
      return {
        success: false,
        error: `Found ${count} exact matches. Provide more surrounding context or set replaceAll to true.`,
      }
    }

    // Perform replacement
    const replaced = input.replaceAll
      ? normalized.split(oldNorm).join(newNorm)
      : normalized.replace(oldNorm, newNorm)

    // Restore original line endings
    const finalContent = fileEnding === "\r\n" ? replaced.replace(/\n/g, "\r\n") : replaced

    try {
      await fs.writeFile(resolved, finalContent, "utf-8")
      const replacements = input.replaceAll ? count : 1
      const lines = input.oldString.split("\n")
      const preview = lines.length <= 3 ? input.oldString : lines.slice(0, 3).join("\n") + "\n..."
      return {
        success: true,
        output: `Edited ${resolved}: ${replacements} replacement(s)\n\nReplaced:\n\`\`\`\n${preview}\n\`\`\``,
        metadata: { replacements, path: resolved },
      }
    } catch (e: unknown) {
      return { success: false, error: `Cannot write ${input.path}: ${e}` }
    }
  },
})
