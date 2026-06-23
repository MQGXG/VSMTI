import { createLLMClient, type LLMMessage } from "./llm-sdk"
import { logError } from "./logger"

export interface GoalConfig {
  apiKey: string
  apiUrl: string
  model: string
  provider: string
}

export interface Goal {
  id: string
  description: string
  createdAt: string
  status: "active" | "satisfied" | "failed" | "cancelled"
  satisfiedAt: string | null
  evaluations: GoalEvaluation[]
}

export interface GoalEvaluation {
  timestamp: string
  satisfied: boolean
  reasoning: string
  confidence: number
}

const JUDGE_SYSTEM_PROMPT = `You are an impartial goal evaluation judge. Your role is to determine whether a given goal has been achieved based on the conversation history.

Rules:
1. Be strict — only mark satisfied if there is clear evidence the goal is fully achieved
2. Consider partial progress as NOT satisfied
3. If the agent is still working toward the goal, mark as not satisfied
4. Look for concrete results, not just intent

Respond in JSON format:
{
  "satisfied": boolean,
  "reasoning": "Concise explanation of your decision",
  "confidence": 0.0-1.0
}`

export class GoalJudge {
  private goals: Goal[] = []
  private goalCounter = 0
  private judgeConfig: GoalConfig | null = null

  setJudgeConfig(config: GoalConfig): void {
    this.judgeConfig = config
  }

  setGoal(description: string): Goal {
    for (const goal of this.goals) {
      if (goal.status === "active") {
        goal.status = "cancelled"
      }
    }

    this.goalCounter++
    const goal: Goal = {
      id: `goal-${this.goalCounter}`,
      description,
      createdAt: new Date().toISOString(),
      status: "active",
      satisfiedAt: null,
      evaluations: [],
    }

    this.goals.push(goal)
    return goal
  }

  getActiveGoal(): Goal | null {
    return this.goals.find(g => g.status === "active") || null
  }

  getAllGoals(): Goal[] {
    return [...this.goals]
  }

  cancelGoal(): boolean {
    const active = this.getActiveGoal()
    if (!active) return false
    active.status = "cancelled"
    return true
  }

  /**
   * 判断 agent 是否应该继续工作
   * 如果有活跃 goal 且未被裁判确认满足，则继续
   */
  shouldContinue(goal: Goal): boolean {
    return goal.status === "active"
  }

  /**
   * 用独立裁判模型评估 goal 是否满足
   */
  async evaluate(
    goal: Goal,
    messages: LLMMessage[],
    config?: GoalConfig,
  ): Promise<GoalEvaluation> {
    const effectiveConfig = config || this.judgeConfig
    if (!effectiveConfig) {
      return {
        timestamp: new Date().toISOString(),
        satisfied: false,
        reasoning: "No judge model configured",
        confidence: 0,
      }
    }

    const evaluation: GoalEvaluation = {
      timestamp: new Date().toISOString(),
      satisfied: false,
      reasoning: "",
      confidence: 0,
    }

    try {
      const conversationText = this.formatConversation(messages)
      const evalMessages: LLMMessage[] = [
        { role: "system", content: JUDGE_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `Goal: ${goal.description}`,
            "",
            `Previous evaluations:`,
            ...goal.evaluations.slice(-3).map(e =>
              `- ${e.timestamp}: ${e.satisfied ? "satisfied" : "not satisfied"} (confidence: ${e.confidence}) - ${e.reasoning}`
            ),
            "",
            `Conversation history:`,
            conversationText,
            "",
            `Determine if the goal has been fully achieved.`,
          ].join("\n"),
        },
      ]

      const client = createLLMClient({
        provider: effectiveConfig.provider,
        model: effectiveConfig.model,
        apiKey: effectiveConfig.apiKey,
        apiUrl: effectiveConfig.apiUrl,
      })

      let responseText = ""
      for await (const event of client.stream({ messages: evalMessages })) {
        if (event.type === "delta") {
          responseText += event.delta
        }
      }

      const parsed = this.parseJudgeResponse(responseText)
      evaluation.satisfied = parsed.satisfied
      evaluation.reasoning = parsed.reasoning
      evaluation.confidence = parsed.confidence
    } catch (err) {
      logError(`[GoalJudge] Evaluation failed for goal ${goal.id}`, err)
      evaluation.reasoning = `Evaluation error: ${String(err)}`
    }

    goal.evaluations.push(evaluation)
    if (evaluation.satisfied && evaluation.confidence >= 0.6) {
      goal.status = "satisfied"
      goal.satisfiedAt = evaluation.timestamp
    }

    return evaluation
  }

  /**
   * 快速预检 — 检查是否有明显证据表明 goal 已满足
   * 轻量级检查，不调用 LLM，基于关键词
   */
  quickCheck(goal: Goal, messages: LLMMessage[]): GoalEvaluation | null {
    const description = goal.description.toLowerCase()
    const lastMessages = messages.slice(-4)

    const allText = lastMessages
      .filter(m => m.role === "assistant" || m.role === "user")
      .map(m => typeof m.content === "string" ? m.content : "")
      .join(" ")

    const goalKeywords = description.split(/\s+/).filter(w => w.length > 3)
    const matchCount = goalKeywords.filter(kw => allText.includes(kw)).length
    const matchRatio = matchCount / goalKeywords.length

    const completionPhrases = [
      "已完成", "任务完成", "done", "completed", "finished",
      "已实现", "已部署", "已交付", "已提交",
    ]

    const hasCompletion = completionPhrases.some(p => allText.includes(p))
    const hasToolResult = lastMessages.some(m => m.role === "tool")

    if (hasCompletion && matchRatio > 0.6 && !hasToolResult) {
      return {
        timestamp: new Date().toISOString(),
        satisfied: true,
        reasoning: "Quick check: completion language detected with key terms matched",
        confidence: 0.7,
      }
    }

    return null
  }

  toSystemPrompt(): string {
    const active = this.getActiveGoal()
    if (!active) return ""

    const satisfied = active.evaluations.filter(e => e.satisfied).length
    const total = active.evaluations.length

    return [
      `[Active Goal]`,
      `Description: ${active.description}`,
      `Status: ${active.status}`,
      `Evaluations: ${satisfied}/${total} satisfied`,
      total > 0
        ? `Last evaluation: ${active.evaluations[active.evaluations.length - 1].reasoning}`
        : "No evaluations yet",
      "",
      `[Goal Protocol]`,
      `When you believe the goal is complete, summarize what was done.`,
      `The system will then evaluate whether the goal has been fully achieved.`,
    ].join("\n")
  }

  toText(): string {
    const lines: string[] = ["# Goals"]
    for (const goal of this.goals) {
      const icon = { active: "●", satisfied: "✓", failed: "✗", cancelled: "⊘" }[goal.status]
      lines.push(`\n## ${icon} ${goal.id}: ${goal.description}`)
      lines.push(`- Status: ${goal.status}`)
      lines.push(`- Created: ${goal.createdAt}`)
      if (goal.satisfiedAt) lines.push(`- Satisfied: ${goal.satisfiedAt}`)
      if (goal.evaluations.length > 0) {
        const last = goal.evaluations[goal.evaluations.length - 1]
        lines.push(`- Last evaluation: ${last.satisfied ? "satisfied" : "not satisfied"} (${last.confidence})`)
        lines.push(`  ${last.reasoning}`)
      }
    }
    return lines.join("\n")
  }

  private formatConversation(messages: LLMMessage[]): string {
    return messages
      .filter(m => m.role === "user" || m.role === "assistant")
      .slice(-10)
      .map(m => {
        const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content)
        return `[${m.role}]: ${content.slice(0, 600)}`
      })
      .join("\n\n")
  }

  private parseJudgeResponse(response: string): {
    satisfied: boolean
    reasoning: string
    confidence: number
  } {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
        return {
          satisfied: Boolean(parsed.satisfied),
          reasoning: String(parsed.reasoning || ""),
          confidence: Number(parsed.confidence) || 0,
        }
      }
    } catch {
      // JSON 解析失败，回退到关键词检测
    }

    const satisfied = /satisfied|achieved|completed|done|yes|true/i.test(response)
    return {
      satisfied,
      reasoning: response.slice(0, 500),
      confidence: satisfied ? 0.5 : 0,
    }
  }
}
