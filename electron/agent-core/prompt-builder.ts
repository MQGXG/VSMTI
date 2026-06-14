/**
 * 提示词构建器 — 分节拼接 system prompt
 * 替代 Python prompt_builder.py
 */

export interface PromptSection {
  title: string
  content: string
  priority: number  // 数字越大越靠前
}

export class PromptBuilder {
  private sections: PromptSection[] = []

  add(title: string, content: string, priority = 0): void {
    if (!content) return
    this.sections.push({ title, content, priority })
  }

  addToolList(tools: Array<{ name: string; description: string }>): void {
    if (tools.length === 0) return
    const lines = tools.map((t) => `- ${t.name}: ${t.description}`)
    this.add("可用工具", lines.join("\n"), 50)
  }

  addInstructions(instructions: string): void {
    if (!instructions) return
    this.add("指令", instructions, 40)
  }

  addPermissions(permissions: Array<{ action: string; effect: string }>): void {
    const writeTools = permissions.filter((p) => p.effect === "ask" || p.effect === "deny")
    if (writeTools.length === 0) return
    const lines = writeTools.map((p) => `- ${p.action}: ${p.effect === "ask" ? "需要用户确认" : "已禁止"}`)
    this.add("权限", lines.join("\n"), 20)
  }

  addMemory(memoryPrompt: string): void {
    if (!memoryPrompt) return
    this.add("记忆", memoryPrompt, 10)
  }

  addContext(summary: string): void {
    if (!summary) return
    this.add("上下文", summary, 5)
  }

  build(): string {
    const sorted = [...this.sections].sort((a, b) => b.priority - a.priority)
    return sorted.map((s) => `[${s.title}]\n${s.content}`).join("\n\n")
  }

  clear(): void {
    this.sections = []
  }
}
