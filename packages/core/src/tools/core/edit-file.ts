/**
 * Edit File 工具 — 增强版，参考 OpenCode 的 9 种匹配策略
 *
 * 匹配策略（按优先级）：
 * 1. SimpleReplacer — 精确匹配
 * 2. LineTrimmedReplacer — 行首尾空白忽略
 * 3. BlockAnchorReplacer — 首尾行锚点 + Levenshtein 相似度
 * 4. WhitespaceNormalizedReplacer — 空白归一化
 * 5. IndentationFlexibleReplacer — 缩进灵活匹配
 */

import * as fs from "fs/promises"
import * as path from "path"
import { z } from "zod"
import { make, type Content } from "../../shared/tool"
import { getSnapshotManager } from "../../session/snapshot"
import { realPath, contains } from "./path-util"
import { invalidateFileState, isFileChanged } from "./file-state-cache"
import { normalizeEditInput } from "./escape-util"
import { lspManager } from "../../lsp/manager"
import { pathToFileURL } from "url"

/** 进程级文件写入锁 — 同一文件串行写入 */
const writeLocks = new Map<string, Promise<void>>()

async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeLocks.get(filePath) || Promise.resolve()
  const next = prev.then(fn, fn)
  writeLocks.set(filePath, next.then(() => {}, () => {}))
  return next
}

/** 使用 diff 库生成标准 diff 报告 */
import { createTwoFilesPatch } from "diff"

function previewLines(value: string, prefix: string): string[] {
  const lines = value.split("\n")
  const shown = lines.slice(0, 6).map((line) => `${prefix}${line.length > 240 ? `${line.slice(0, 240)}...` : line}`)
  if (lines.length > shown.length) shown.push(`${prefix}...`)
  return shown
}

const BOM = "\uFEFF"
function stripBom(text: string): { bom: boolean; text: string } {
  return text.startsWith(BOM) ? { bom: true, text: text.slice(1) } : { bom: false, text }
}
function joinBom(text: string, bom: boolean): string {
  return bom ? `${BOM}${text}` : text
}

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

// ─── 匹配策略 ───────────────────────────────────────────

/** Levenshtein 距离 */
function levenshtein(a: string, b: string): number {
  if (a === "" || b === "") return Math.max(a.length, b.length)
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost)
    }
  }
  return matrix[a.length][b.length]
}

/** 策略 1: 精确匹配 */
function* simpleReplacer(content: string, find: string): Generator<string> {
  yield find
}

/** 策略 2: 行首尾空白忽略 */
function* lineTrimmedReplacer(content: string, find: string): Generator<string> {
  const originalLines = content.split("\n")
  const searchLines = find.split("\n")
  if (searchLines[searchLines.length - 1] === "") searchLines.pop()

  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    let matches = true
    for (let j = 0; j < searchLines.length; j++) {
      if (originalLines[i + j].trim() !== searchLines[j].trim()) { matches = false; break }
    }
    if (matches) {
      let start = 0
      for (let k = 0; k < i; k++) start += originalLines[k].length + 1
      let end = start
      for (let k = 0; k < searchLines.length; k++) {
        end += originalLines[i + k].length
        if (k < searchLines.length - 1) end += 1
      }
      yield content.substring(start, end)
    }
  }
}

/** 策略 3: 首尾行锚点 + 相似度 */
function* blockAnchorReplacer(content: string, find: string): Generator<string> {
  const originalLines = content.split("\n")
  const searchLines = find.split("\n")
  if (searchLines.length < 3) return
  if (searchLines[searchLines.length - 1] === "") searchLines.pop()

  const firstLine = searchLines[0].trim()
  const lastLine = searchLines[searchLines.length - 1].trim()
  const blockSize = searchLines.length
  const maxDelta = Math.max(1, Math.floor(blockSize * 0.25))

  const candidates: Array<{ start: number; end: number }> = []
  for (let i = 0; i < originalLines.length; i++) {
    if (originalLines[i].trim() !== firstLine) continue
    for (let j = i + 2; j < originalLines.length; j++) {
      if (originalLines[j].trim() === lastLine) {
        if (Math.abs((j - i + 1) - blockSize) <= maxDelta) {
          candidates.push({ start: i, end: j })
        }
        break
      }
    }
  }

  if (candidates.length === 0) return

  let best = candidates[0]
  let bestScore = 0

  for (const c of candidates) {
    let score = 0
    const mid = Math.min(searchLines.length - 2, (c.end - c.start + 1) - 2)
    if (mid > 0) {
      for (let j = 1; j <= mid; j++) {
        const maxLen = Math.max(originalLines[c.start + j].trim().length, searchLines[j].trim().length)
        if (maxLen > 0) score += 1 - levenshtein(originalLines[c.start + j].trim(), searchLines[j].trim()) / maxLen
      }
      score /= mid
    } else {
      score = 1.0
    }
    if (score > bestScore) { bestScore = score; best = c }
  }

  if (bestScore >= 0.65) {
    let start = 0
    for (let k = 0; k < best.start; k++) start += originalLines[k].length + 1
    let end = start
    for (let k = best.start; k <= best.end; k++) {
      end += originalLines[k].length
      if (k < best.end) end += 1
    }
    yield content.substring(start, end)
  }
}

/** 策略 4: 空白归一化 */
function* whitespaceReplacer(content: string, find: string): Generator<string> {
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim()
  const normalizedFind = normalize(find)

  const lines = content.split("\n")
  // 单行匹配
  for (const line of lines) {
    if (normalize(line) === normalizedFind) yield line
  }
  // 多行匹配
  const findLines = find.split("\n")
  if (findLines.length > 1) {
    for (let i = 0; i <= lines.length - findLines.length; i++) {
      if (normalize(lines.slice(i, i + findLines.length).join("\n")) === normalizedFind) {
        yield lines.slice(i, i + findLines.length).join("\n")
      }
    }
  }
}

/** 策略 5: 缩进灵活 */
function* indentReplacer(content: string, find: string): Generator<string> {
  const removeIndent = (text: string) => {
    const lines = text.split("\n")
    const nonEmpty = lines.filter((l) => l.trim().length > 0)
    if (nonEmpty.length === 0) return text
    const min = Math.min(...nonEmpty.map((l) => (l.match(/^(\s*)/)?.[1]?.length || 0)))
    return lines.map((l) => l.trim().length === 0 ? l : l.slice(min)).join("\n")
  }
  const normalizedFind = removeIndent(find)
  const contentLines = content.split("\n")
  const findLines = find.split("\n")

  for (let i = 0; i <= contentLines.length - findLines.length; i++) {
    if (removeIndent(contentLines.slice(i, i + findLines.length).join("\n")) === normalizedFind) {
      yield contentLines.slice(i, i + findLines.length).join("\n")
    }
  }
}

/** 策略 6: 转义字符归一化 */
function* escapeReplacer(content: string, find: string): Generator<string> {
  const unescape = (s: string) => s.replace(/\\(n|t|r|'|"|`|\\)/g, (_, c: string) => {
    switch (c) {
      case "n": return "\n"; case "t": return "\t"; case "r": return "\r"
      case "'": return "'"; case '"': return '"'; case "`": return "`"
      default: return c
    }
  })
  const unescaped = unescape(find)
  if (content.includes(unescaped)) yield unescaped
}

/** 策略 7: 首尾空白裁剪 */
function* trimmedBoundaryReplacer(content: string, find: string): Generator<string> {
  const trimmed = find.trim()
  if (trimmed === find) return
  if (content.includes(trimmed)) yield trimmed
}

/** 策略 8: 上下文感知（首尾行锚点 + 中间行相似度） */
function* contextAwareReplacer(content: string, find: string): Generator<string> {
  const findLines = find.split("\n")
  if (findLines.length < 3) return
  if (findLines[findLines.length - 1] === "") findLines.pop()

  const first = findLines[0].trim()
  const last = findLines[findLines.length - 1].trim()
  const contentLines = content.split("\n")

  for (let i = 0; i < contentLines.length; i++) {
    if (contentLines[i].trim() !== first) continue
    for (let j = i + 2; j < contentLines.length; j++) {
      if (contentLines[j].trim() !== last) continue
      const block = contentLines.slice(i, j + 1)
      if (block.length !== findLines.length) continue

      let match = 0, total = 0
      for (let k = 1; k < block.length - 1; k++) {
        if (block[k].trim().length > 0 || findLines[k].trim().length > 0) {
          total++
          if (block[k].trim() === findLines[k].trim()) match++
        }
      }
      if (total === 0 || match / total >= 0.5) {
        yield block.join("\n")
        return
      }
      break
    }
  }
}

/** 策略 9: 多次出现（yield 所有精确匹配） */
function* multiOccurrenceReplacer(content: string, find: string): Generator<string> {
  let idx = 0
  while (true) {
    const pos = content.indexOf(find, idx)
    if (pos === -1) break
    yield find
    idx = pos + find.length
  }
}

const REPLACERS = [
  simpleReplacer, lineTrimmedReplacer, blockAnchorReplacer,
  whitespaceReplacer, indentReplacer, escapeReplacer,
  trimmedBoundaryReplacer, contextAwareReplacer, multiOccurrenceReplacer,
]

/** 限制 diff 输出行数 */
function limitDiffLines(diff: string, maxLines: number): string {
  const lines = diff.split("\n")
  if (lines.length <= maxLines) return diff
  const head = lines.slice(0, Math.ceil(maxLines / 2)).join("\n")
  const tail = lines.slice(lines.length - Math.floor(maxLines / 2)).join("\n")
  return `${head}\n... (${lines.length - maxLines} lines truncated, see ` + "`git diff`" + ` for full diff)\n${tail}`
}

/** 比例失配检测 — 防止替换过大块 */
function isDisproportionate(match: string, find: string): boolean {
  const oldLines = find.split("\n").length
  const matchLines = match.split("\n").length
  if (matchLines >= Math.max(oldLines + 3, oldLines * 2)) return true
  return match.trim().length > Math.max(find.trim().length + 500, find.trim().length * 4)
}

/** 核心替换函数 — 多策略降级 */
function replace(content: string, oldString: string, newString: string, replaceAll = false): string {
  if (oldString === newString) throw new Error("oldString and newString are identical.")
  if (oldString === "") throw new Error("oldString must not be empty.")

  for (const replacer of REPLACERS) {
    for (const match of replacer(content, oldString)) {
      const index = content.indexOf(match)
      if (index === -1) continue
      if (isDisproportionate(match, oldString)) {
        throw new Error("Matched block is much larger than oldString. Re-read the file and provide more context.")
      }
      if (replaceAll) return content.replaceAll(match, newString)
      const last = content.lastIndexOf(match)
      if (index !== last) continue
      return content.substring(0, index) + newString + content.substring(index + match.length)
    }
  }

  throw new Error("Could not find oldString in the file. It must match exactly, including whitespace and indentation.")
}

export const editFileTool = make({
  name: "edit_file",
  description: "Replace specific text in an existing file. Uses fuzzy matching with 9 strategies. ALWAYS read the file first before editing. Use when: fixing bugs in code, updating specific lines, changing function implementations, modifying config values.",
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
    const isAbsolute = path.isAbsolute(input.path)
    const absolute = isAbsolute ? input.path : path.resolve(ctx.workspace, input.path)
    const real = await realPath(absolute)
    const root = await realPath(ctx.workspace)
    if (!isAbsolute && !contains(root, real)) {
      return { success: false, error: `相对路径逃逸工作区: ${input.path}` }
    }

    if (input.oldString === input.newString) {
      return { success: false, error: "No changes to apply: oldString and newString are identical." }
    }
    if (input.oldString === "") {
      return { success: false, error: "oldString must not be empty. Use write_file to create files." }
    }

    // 反转义 LLM 输出的特殊标记
    const { oldString: cleanOld, newString: cleanNew } = normalizeEditInput(input.oldString, input.newString)

    // 快照：编辑前捕获文件状态
    const snapshotMgr = getSnapshotManager(ctx.workspace)
    const snapshotId = await snapshotMgr.capture([real], `edit_file: ${input.path}`)

    let originalBytes: Buffer
    try {
      originalBytes = await fs.readFile(real)
    } catch (e: unknown) {
      return { success: false, error: `Cannot read ${input.path}: ${e}` }
    }

    const { bom, text: sourceText } = stripBom(originalBytes.toString("utf-8"))
    const ending = detectLineEnding(sourceText)
    const oldString = convertToLineEnding(cleanOld, ending)
    const newString = convertToLineEnding(cleanNew, ending)

    let replaced: string
    let usedOldString = oldString
    try {
      replaced = replace(sourceText, oldString, newString, input.replaceAll)
    } catch (e: any) {
      // 9 种策略全部失败 → LSP 增强回退：通过符号名定位代码块
      const lspResult = await tryLspEnhancedEdit(real, oldString, newString, sourceText, ctx.workspace)
      if (lspResult) {
        replaced = lspResult.replaced
        usedOldString = lspResult.usedOldString
      } else {
        return { success: false, error: e.message + "\n\n💡 提示: 尝试使用 apply_patch 或确认代码块与文件中完全一致（包括缩进和空格）。" }
      }
    }

    // 通过写入锁执行写入（含 stale 检测 + 文件写入）
    return withFileLock(real, async () => {
      // Stale 检测（双通道：mtime + 内容级）
      try {
        const stat = await fs.stat(real)
        if (isFileChanged(real, stat.mtimeMs)) {
          return { success: false, error: "File changed after read. Read it again before editing." }
        }
      } catch (e: unknown) {
        return { success: false, error: `Cannot verify file: ${input.path}: ${e}` }
      }
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
        const count = countOccurrences(replaced, newString) - countOccurrences(sourceText, newString)

        // 清除缓存
        invalidateFileState(real)

        // LSP 通知（编辑后刷新诊断）
        if (ctx.workspace) {
          import("../../lsp/manager").then(({ lspManager }) => {
            lspManager.touchFile(ctx.workspace, real).catch(() => {})
          }).catch(() => {})
        }

        const diffOutput = createTwoFilesPatch(
          input.path,
          input.path,
          sourceText,
          replaced,
          "",
          "",
          { context: 3 },
        )
        return {
          success: true,
          output: `Edited ${real}: ${Math.max(count, 1)} replacement(s)\n\n${limitDiffLines(diffOutput, 50)}`,
          metadata: { replacements: Math.max(count, 1), path: real, snapshotId },
        }
      } catch (e: unknown) {
        return { success: false, error: `Cannot write ${input.path}: ${e}` }
      }
    })
  },
})

// ─── LSP 增强编辑回退 ─────────────────────────────────

/**
 * 当 9 种字符串匹配策略全部失败时，尝试通过 LSP 符号分析定位代码块。
 * 提取 oldString 中的函数/变量名，用 LSP documentSymbols 找到其定义范围，
 * 然后用文件中的实际文本作为 oldString 重新执行替换。
 */
async function tryLspEnhancedEdit(
  filePath: string,
  oldString: string,
  newString: string,
  fileContent: string,
  workspace?: string,
): Promise<{ replaced: string; usedOldString: string } | null> {
  if (!workspace) return null

  // 从 oldString 中提取可能的符号名
  const symbolName = extractSymbolName(oldString)
  if (!symbolName) return null

  try {
    const client = await lspManager.ensureServer(workspace)
    if (!client?.isRunning) return null

    const uri = pathToFileURL(filePath).href
    client.openDocument(uri, detectLanguage(filePath), fileContent)

    // 获取文档符号列表
    const symbols = await client.documentSymbols(uri)

    // 递归查找匹配的符号
    const found = findSymbolInTree(symbols, symbolName)
    if (!found) {
      client.closeDocument(uri)
      return null
    }

    const range = found.range || found.selectionRange
    if (!range) {
      client.closeDocument(uri)
      return null
    }

    const lines = fileContent.split("\n")
    const startLine = range.start.line
    const endLine = range.end.line

    // 从文件中提取该范围的文本作为旧字符串
    const actualOldString = lines.slice(startLine, endLine + 1).join("\n")

    // 验证提取的文本是否包含在我们的 oldString 关键内容中
    const oldStripped = oldString.replace(/\s+/g, "").slice(0, 100)
    const actualStripped = actualOldString.replace(/\s+/g, "").slice(0, 100)

    if (actualStripped === oldStripped || oldStripped.includes(actualStripped) || actualStripped.includes(oldStripped)) {
      // 用实际文本替换
      const replaced = fileContent.replace(actualOldString, newString)
      if (replaced !== fileContent) {
        client.closeDocument(uri)
        return { replaced, usedOldString: actualOldString }
      }
    }

    client.closeDocument(uri)
    return null
  } catch {
    return null
  }
}

/** 从 oldString 中提取可能的符号名（函数名、变量名、类名） */
function extractSymbolName(text: string): string | null {
  // 尝试匹配 function/class/const/let/var 后的名字
  const patterns = [
    /(?:function|class|interface|type|enum)\s+(\w+)/,
    /(?:const|let|var|import)\s+(\w+)/,
    /(\w+)\s*[=:(]/,
    /(?:def|class)\s+(\w+)/, // Python
    /(?:func|type|struct)\s+(\w+)/, // Go
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[1]
  }

  // 取第一个看起来像标识符的单词
  const words = text.match(/\b([a-zA-Z_$][\w$]*)\b/g)
  if (words) {
    // 过滤掉关键字
    const keywords = new Set(["if", "else", "for", "while", "return", "const", "let", "var",
      "function", "class", "import", "export", "from", "async", "await", "new", "this",
      "true", "false", "null", "undefined", "try", "catch", "throw", "switch", "case",
      "default", "break", "continue", "type", "interface", "enum"])
    for (const word of words) {
      if (!keywords.has(word) && word.length > 2) return word
    }
  }

  return null
}

/** 在 LSP documentSymbols 树中递归查找匹配的符号 */
function findSymbolInTree(symbols: any, name: string): any {
  if (!Array.isArray(symbols)) return null

  for (const sym of symbols) {
    if (sym.name === name) return sym
    if (sym.children) {
      const found = findSymbolInTree(sym.children, name)
      if (found) return found
    }
  }
  return null
}

/** 根据文件扩展名检测语言 ID */
function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase()
  const langMap: Record<string, string> = {
    ts: "typescript", tsx: "typescriptreact", js: "javascript", jsx: "javascriptreact",
    json: "json", md: "markdown", css: "css", scss: "scss", html: "html",
    py: "python", rs: "rust", go: "go", java: "java", kt: "kotlin",
    swift: "swift", c: "c", cpp: "cpp", h: "c", hpp: "cpp",
    yml: "yaml", yaml: "yaml", toml: "toml", xml: "xml",
    sh: "shell", bash: "shell", zsh: "shell",
    sql: "sql", graphql: "graphql", prisma: "prisma",
  }
  return langMap[ext || ""] || "plaintext"
}


