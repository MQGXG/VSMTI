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

function previewLines(value: string, prefix: string): string[] {
  const lines = value.split("\n")
  const shown = lines.slice(0, 6).map((line) => `${prefix}${line.length > 240 ? `${line.slice(0, 240)}...` : line}`)
  if (lines.length > shown.length) shown.push(`${prefix}...`)
  return shown
}

// BOM 处理
const BOM = "\uFEFF"
function stripBom(text: string): { bom: boolean; text: string } {
  return text.startsWith(BOM) ? { bom: true, text: text.slice(1) } : { bom: false, text }
}
function joinBom(text: string, bom: boolean): string {
  return bom ? `${BOM}${text}` : text
}

// 行尾处理
const normalizeLineEndings = (s: string) => s.replace(/\r\n/g, "\n")
const detectLineEnding = (s: string): "\n" | "\r\n" => s.includes("\r\n") ? "\r\n" : "\n"
const convertToLineEnding = (s: string, ending: "\n" | "\r\n") =>
  ending === "\n" ? normalizeLineEndings(s) : normalizeLineEndings(s).split("\n").join("\r\n")

function countOccurrences(content: string, search: string): number {
  if (search === "") return 0
  let count = 0, offset = 0
  while ((offset = content.indexOf(search, offset)) !== -1) { count++; offset += search.length }
  return count
}

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
  toModelOutput(input, output): Content[] {
    const outputStr = typeof output === "string" ? output : ""
    const match = outputStr.match(/(\d+) replacement/)
    const count = match ? match[1] : "?"
    const diff = [
      `Edited file successfully. Replacements: ${count}`,
      "```diff",
      ...previewLines(input.oldString as string, "-"),
      ...previewLines(input.newString as string, "+"),
      "```",
    ].join("\n")
    return [{ type: "text", text: diff }]
  },

  async execute(input, ctx) {
    // 路径安全
    const absolute = path.resolve(ctx.workspace, input.path)
    if (!path.isAbsolute(input.path) && !contains(ctx.workspace, absolute)) {
      return { success: false, error: `Path escapes workspace: ${input.path}` }
    }
    const real = await realPath(absolute)
    const root = await realPath(ctx.workspace)
    if (!contains(root, real)) {
      return { success: false, error: `Path escapes workspace: ${input.path}` }
    }

    if (input.oldString === input.newString) {
      return { success: false, error: "No changes to apply: oldString and newString are identical." }
    }
    if (input.oldString === "") {
      return { success: false, error: "oldString must not be empty. Use write_file to create files." }
    }

    // 读取文件（保留原始字节用于 stale 检测）
    let originalBytes: Buffer
    try {
      originalBytes = await fs.readFile(real)
    } catch (e: unknown) {
      return { success: false, error: `Cannot read ${input.path}: ${e}` }
    }

    const { bom, text: sourceText } = stripBom(originalBytes.toString("utf-8"))
    const ending = detectLineEnding(sourceText)
    const oldString = convertToLineEnding(input.oldString, ending)
    const newString = convertToLineEnding(input.newString, ending)
    const replacements = countOccurrences(sourceText, oldString)

    if (replacements === 0) {
      return { success: false, error: "Could not find oldString in the file. It must match exactly, including whitespace and indentation." }
    }
    if (replacements > 1 && input.replaceAll !== true) {
      return { success: false, error: `Found ${replacements} exact matches. Provide more surrounding context or set replaceAll to true.` }
    }

    const replaced = input.replaceAll
      ? sourceText.split(oldString).join(newString)
      : sourceText.replace(oldString, newString)

    // Stale 检测：重新读取文件，与 originalBytes 比较
    try {
      const currentBytes = await fs.readFile(real)
      if (!currentBytes.equals(originalBytes)) {
        return { success: false, error: "File changed after read. Read it again before editing." }
      }
    } catch (e: unknown) {
      return { success: false, error: `Cannot verify file: ${input.path}: ${e}` }
    }

    try {
      const finalContent = joinBom(convertToLineEnding(replaced, ending), bom)
      await fs.writeFile(real, finalContent, "utf-8")
      const count = input.replaceAll ? replacements : 1
      return {
        success: true,
        output: `Edited ${real}: ${count} replacement(s)`,
        metadata: { replacements: count, path: real },
      }
    } catch (e: unknown) {
      return { success: false, error: `Cannot write ${input.path}: ${e}` }
    }
  },
})
