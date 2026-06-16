/**
 * LSP 代码上下文 — 自动注入代码智能到 Agent 上下文
 * 
 * 参考 OpenCode 的 LSP 集成模式（自动加载 + 上下文注入）
 * 不再需要 LLM 主动调用 lsp_definition/lsp_references 等工具
 */

export interface CodeIntel {
  symbols: string[]
  diagnostics: string[]
}

export class CodeContext {
  async getContextForFile(filePath: string): Promise<CodeIntel> {
    try {
      const symbols = await this.getSymbols(filePath)
      return { symbols, diagnostics: [] }
    } catch {
      return { symbols: [], diagnostics: [] }
    }
  }

  async buildSystemPromptSuffix(workspace: string, currentFile?: string): Promise<string> {
    const parts: string[] = []

    try {
      const languages = this.detectLanguages(workspace)
      if (languages.length > 0) {
        parts.push(`Project languages: ${languages.join(", ")}`)
      }

      if (currentFile) {
        const intel = await this.getContextForFile(currentFile)
        if (intel.symbols.length > 0) {
          parts.push(`Current file symbols: ${intel.symbols.slice(0, 20).join(", ")}`)
        }
      }
    } catch {
      // 静默失败
    }

    return parts.length > 0 ? `\n[Code Context]\n${parts.join("\n")}` : ""
  }

  private async getSymbols(_filePath: string): Promise<string[]> {
    // LSP 符号获取功能待完善
    return []
  }

  private detectLanguages(workspace: string): string[] {
    const { existsSync, readdirSync } = require("fs")
    const { join } = require("path")

    const indicators: Record<string, string[]> = {
      typescript: ["tsconfig.json", "*.ts", "*.tsx"],
      javascript: ["package.json", "*.js", "*.jsx"],
      python: ["requirements.txt", "setup.py", "*.py"],
      rust: ["Cargo.toml", "*.rs"],
      go: ["go.mod", "*.go"],
      java: ["pom.xml", "build.gradle", "*.java"],
    }

    try {
      if (!existsSync(join(workspace, "package.json"))) {
        try {
          const entries = readdirSync(workspace)
          for (const [lang, hints] of Object.entries(indicators)) {
            if (hints.some((h) => entries.some((e: string) => e.endsWith(h.replace("*", "")) || e === h))) {
              return [lang]
            }
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }

    return []
  }
}
