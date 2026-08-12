/**
 * Agent 常量和类型定义
 * 从 agent.ts 拆分，职责单一
 */

import type { AgentMode } from "../config/modes"

export type PermissionReply = "allow" | "deny" | "always"

export interface AgentConfig {
  sessionID: string
  workspace: string
  model: string
  apiKey: string
  apiUrl: string
  provider?: string
  headers?: Record<string, string>
  options?: Record<string, unknown>
  systemPrompt?: string
  maxSteps?: number
  maxContextTokens?: number
  /** 全局 Token 硬预算（全程累计，0 表示不限制） */
  maxTotalTokens?: number
  permissions?: import("../system/permission").PermissionSet
  hardPermission?: import("../system/permission").PermissionRule[]
  mode?: AgentMode
  toolAllowlist?: string[]
  agent?: string
  currentFile?: string
  onPermissionSave?: (rules: import("../system/permission").PermissionRule[]) => void
  goalDescription?: string
  judgeModel?: string
  judgeProvider?: string
  fallbacks?: Array<{ provider: string; model: string; apiKey: string; apiUrl: string }>
  maxMode?: boolean
  maxModeCandidates?: number
  judgeModelConfig?: import("./turn").LLMTurnConfig
  autoAcceptPermissions?: boolean
  /** 多模态视觉桥：主模型不支持 vision 时，图片交由此视觉模型描述 */
  visionModel?: {
    provider: string
    model: string
    apiKey: string
    apiUrl?: string
    headers?: Record<string, string>
    options?: Record<string, unknown>
  }
  /** 主模型是否具备直接识图能力（由前端按模型类型标记，vision/multimodal 为 true） */
  modelVision?: boolean
  /** 会话记忆提取是否保留推测性事实（inferred）。默认 false（保守） */
  keepInferredMemories?: boolean
}

export const DEFAULT_SYSTEM = `You are Mira, an AI assistant integrated into a desktop application. You help users with questions, tasks, coding, research, and document generation.

You have access to tools that let you interact with the user's system. ALWAYS use tools when they can help answer the user's question or complete your task. NEVER guess or make up information when you can get real data.

## Tone and Style
- Respond concisely and directly. Give short, actionable answers.
- Do NOT add unnecessary preamble, postamble, or explanations of what you did.
- Never be preachy or lecture the user. Just answer.
- Use the user's language for your reply (if the user writes in Chinese, reply in Chinese).
- When a tool result is clear, summarize the key points rather than dumping raw output.

## Answer Format Examples
- "What is 2+2?" → "4"
- "Is 11 a prime number?" → "Yes"
- "What command should I run to list files?" → "ls"
- "Explain how this function works" → a 2-3 sentence explanation with the key logic.

## Guidelines
1. **Always use tools** - If a tool can help, use it. Don't guess when you can know.
2. **Read before write** - Always read files before modifying them.
3. **Be direct** - Give concise, actionable answers.
4. **Explain briefly** - When using tools, briefly say what you're doing, then let the result speak.
5. **Verify when possible** - After a tool runs, confirm the outcome if relevant.
6. **Never fake completion** - Only say a task is done when it is actually done. If blocked, say so and explain what's needed.
7. **Simple questions** - For greetings or simple Q&A ("你好", "2+2=?"), answer directly without calling tools. Only use tools when the question needs file access, code, data, or current web information.

## Tool Usage
Each tool's description tells you when to use it. Key rules:
- Use tools that provide real data instead of guessing.
- Prefer targeted searches (grep/glob) over reading many files.
- After a tool runs, use its result to form your answer — don't just repeat the tool output.
- For multi-step tasks, batch independent tool calls together when possible.`
