/**
 * LSP 工具 — 让 Agent 通过 LSP 协议理解代码
 * 类似 OpenCode 的 lsp.ts 工具
 */

import { z } from "zod"
import { make } from "../tool"
import { lspManager } from "../lsp/manager"
import * as path from "path"

export const lspDefinitionTool = make({
  name: "lsp_definition",
  description: "跳转到符号定义处。输入文件路径和行列位置，返回定义所在的文件、行、列。",
  inputSchema: z.object({
    path: z.string().describe("文件路径（相对 workspace）"),
    line: z.number().describe("行号（从 0 开始）"),
    column: z.number().describe("列号（从 0 开始）"),
  }),
  outputSchema: z.string(),
  permission: "read",
  async execute(input, ctx) {
    try {
      const locations = await lspManager.getDefinition(ctx.workspace, input.path, input.line, input.column)
      if (locations.length === 0) return { success: true, output: "未找到定义" }
      return {
        success: true,
        output: locations
          .map((loc) => {
            const relPath = path.relative(ctx.workspace, loc.uri.replace(/^file:\/\//, ""))
            return `${relPath}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`
          })
          .join("\n"),
      }
    } catch (e) {
      return { success: false, error: `LSP 查询失败: ${e instanceof Error ? e.message : String(e)}` }
    }
  },
})

export const lspReferencesTool = make({
  name: "lsp_references",
  description: "查找符号的所有引用位置。输入文件路径和行列位置，返回所有引用的文件:行:列。",
  inputSchema: z.object({
    path: z.string().describe("文件路径（相对 workspace）"),
    line: z.number().describe("行号（从 0 开始）"),
    column: z.number().describe("列号（从 0 开始）"),
  }),
  outputSchema: z.string(),
  permission: "read",
  async execute(input, ctx) {
    try {
      const refs = await lspManager.getReferences(ctx.workspace, input.path, input.line, input.column)
      if (refs.length === 0) return { success: true, output: "未找到引用" }
      return {
        success: true,
        output: refs
          .slice(0, 50)
          .map((ref) => {
            const relPath = path.relative(ctx.workspace, ref.uri.replace(/^file:\/\//, ""))
            return `${relPath}:${ref.range.start.line + 1}:${ref.range.start.character + 1}`
          })
          .join("\n") + (refs.length > 50 ? `\n... (共 ${refs.length} 处引用，显示前 50 处)` : ""),
      }
    } catch (e) {
      return { success: false, error: `LSP 查询失败: ${e instanceof Error ? e.message : String(e)}` }
    }
  },
})

export const lspHoverTool = make({
  name: "lsp_hover",
  description: "获取符号的类型信息和文档。输入文件路径和行列位置，返回类型定义和文档字符串。",
  inputSchema: z.object({
    path: z.string().describe("文件路径（相对 workspace）"),
    line: z.number().describe("行号（从 0 开始）"),
    column: z.number().describe("列号（从 0 开始）"),
  }),
  outputSchema: z.string(),
  permission: "read",
  async execute(input, ctx) {
    try {
      const info = await lspManager.getHoverInfo(ctx.workspace, input.path, input.line, input.column)
      if (!info) return { success: true, output: "该位置无类型信息" }
      return { success: true, output: info.contents }
    } catch (e) {
      return { success: false, error: `LSP 查询失败: ${e instanceof Error ? e.message : String(e)}` }
    }
  },
})
