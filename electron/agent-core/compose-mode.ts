/**
 * Compose Mode Manager — Specs-driven 开发流程
 * 参考 MiMo-Code 的 compose 模式
 * 提供结构化的 specs-driven 开发流程
 * 内置规划、执行、代码审查、TDD、调试、验证、合并等技能
 */

export type ComposePhase =
  | "plan"      // 规划阶段：理解需求，设计方案
  | "execute"   // 执行阶段：编写代码
  | "review"    // 审查阶段：代码审查
  | "test"      // 测试阶段：TDD
  | "debug"     // 调试阶段：修复问题
  | "verify"    // 验证阶段：验证实现
  | "merge"     // 合并阶段：整合变更

export interface ComposeState {
  phase: ComposePhase
  spec: string
  plan: string | null
  codeFiles: string[]
  reviewComments: string[]
  testResults: string[]
  debugLog: string[]
  verificationPassed: boolean
  startedAt: string
  updatedAt: string
}

export interface ComposeSkill {
  name: string
  description: string
  phase: ComposePhase
  systemPrompt: string
  tools: string[]
}

const COMPOSE_SKILLS: Record<ComposePhase, ComposeSkill> = {
  plan: {
    name: "plan",
    description: "理解需求，设计方案",
    phase: "plan",
    systemPrompt: `You are a planning agent. Your task is to:
1. Understand the specification/requirement
2. Analyze the current codebase
3. Design a detailed implementation plan
4. Identify files to modify/create
5. Define success criteria

Output a structured plan with:
- Overview of the solution
- Step-by-step implementation steps
- Files to modify/create
- Risk assessment
- Success criteria`,
    tools: ["read_file", "list_files", "grep", "glob", "web_search", "web_browse", "data_analysis"],
  },
  execute: {
    name: "execute",
    description: "编写代码实现",
    phase: "execute",
    systemPrompt: `You are an execution agent. Your task is to implement the plan:
1. Read the plan carefully
2. Implement each step
3. Follow existing code conventions
4. Write clean, maintainable code
5. Track all files modified

Output:
- Files created/modified
- Implementation summary
- Any deviations from the plan`,
    tools: ["read_file", "write_file", "edit_file", "list_files", "grep", "glob", "bash"],
  },
  review: {
    name: "review",
    description: "代码审查",
    phase: "review",
    systemPrompt: `You are a code review agent. Your task is to review the implementation:
1. Check code quality
2. Verify correctness
3. Check for edge cases
4. Review security implications
5. Suggest improvements

Output:
- Review comments (issues found)
- Suggestions for improvement
- Approval status (approve/request changes)`,
    tools: ["read_file", "list_files", "grep", "glob"],
  },
  test: {
    name: "test",
    description: "TDD 测试",
    phase: "test",
    systemPrompt: `You are a testing agent. Your task is to:
1. Write comprehensive tests
2. Cover edge cases
3. Run tests and verify results
4. Report test coverage

Output:
- Test files created
- Test results
- Coverage report
- Issues found`,
    tools: ["read_file", "write_file", "edit_file", "bash", "code_exec"],
  },
  debug: {
    name: "debug",
    description: "调试修复",
    phase: "debug",
    systemPrompt: `You are a debugging agent. Your task is to:
1. Analyze the issue
2. Find root cause
3. Implement fix
4. Verify the fix

Output:
- Root cause analysis
- Fix implemented
- Verification results`,
    tools: ["read_file", "edit_file", "bash", "code_exec", "grep"],
  },
  verify: {
    name: "verify",
    description: "验证实现",
    phase: "verify",
    systemPrompt: `You are a verification agent. Your task is to:
1. Verify all requirements are met
2. Run integration tests
3. Check for regressions
4. Confirm success criteria

Output:
- Verification checklist
- Test results
- Pass/fail status`,
    tools: ["read_file", "list_files", "bash", "code_exec"],
  },
  merge: {
    name: "merge",
    description: "合并变更",
    phase: "merge",
    systemPrompt: `You are a merge agent. Your task is to:
1. Review all changes
2. Create git commit
3. Handle conflicts if any
4. Prepare for deployment

Output:
- Git commit message
- Files committed
- Any conflicts resolved`,
    tools: ["read_file", "git_status", "git_diff", "git_log", "git_commit"],
  },
}

const PHASE_ORDER: ComposePhase[] = ["plan", "execute", "review", "test", "debug", "verify", "merge"]

export class ComposeModeManager {
  private state: ComposeState | null = null
  private history: ComposeState[] = []

  /**
   * 开始新的 Compose 流程
   */
  start(spec: string): ComposeState {
    // 保存当前状态到历史
    if (this.state) {
      this.history.push({ ...this.state })
    }

    this.state = {
      phase: "plan",
      spec,
      plan: null,
      codeFiles: [],
      reviewComments: [],
      testResults: [],
      debugLog: [],
      verificationPassed: false,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    return { ...this.state }
  }

  /**
   * 获取当前状态
   */
  getState(): ComposeState | null {
    return this.state ? { ...this.state } : null
  }

  /**
   * 获取当前阶段的 Skill
   */
  getCurrentSkill(): ComposeSkill | null {
    if (!this.state) return null
    return COMPOSE_SKILLS[this.state.phase]
  }

  /**
   * 推进到下一阶段
   */
  advance(): ComposePhase | null {
    if (!this.state) return null

    const currentIdx = PHASE_ORDER.indexOf(this.state.phase)
    if (currentIdx === PHASE_ORDER.length - 1) {
      // 已经是最后阶段
      return null
    }

    this.state.phase = PHASE_ORDER[currentIdx + 1]
    this.state.updatedAt = new Date().toISOString()
    return this.state.phase
  }

  /**
   * 跳转到指定阶段
   */
  goTo(phase: ComposePhase): boolean {
    if (!this.state) return false
    if (!PHASE_ORDER.includes(phase)) return false

    this.state.phase = phase
    this.state.updatedAt = new Date().toISOString()
    return true
  }

  /**
   * 更新状态
   */
  update(updates: Partial<ComposeState>): void {
    if (!this.state) return
    Object.assign(this.state, updates, { updatedAt: new Date().toISOString() })
  }

  /**
   * 添加代码文件
   */
  addCodeFile(filePath: string): void {
    if (!this.state) return
    if (!this.state.codeFiles.includes(filePath)) {
      this.state.codeFiles.push(filePath)
      this.state.updatedAt = new Date().toISOString()
    }
  }

  /**
   * 添加审查评论
   */
  addReviewComment(comment: string): void {
    if (!this.state) return
    this.state.reviewComments.push(comment)
    this.state.updatedAt = new Date().toISOString()
  }

  /**
   * 添加测试结果
   */
  addTestResult(result: string): void {
    if (!this.state) return
    this.state.testResults.push(result)
    this.state.updatedAt = new Date().toISOString()
  }

  /**
   * 添加调试日志
   */
  addDebugLog(log: string): void {
    if (!this.state) return
    this.state.debugLog.push(log)
    this.state.updatedAt = new Date().toISOString()
  }

  /**
   * 设置验证状态
   */
  setVerificationPassed(passed: boolean): void {
    if (!this.state) return
    this.state.verificationPassed = passed
    this.state.updatedAt = new Date().toISOString()
  }

  /**
   * 完成当前流程
   */
  complete(): ComposeState | null {
    if (!this.state) return null
    const completed = { ...this.state }
    this.history.push(completed)
    this.state = null
    return completed
  }

  /**
   * 取消当前流程
   */
  cancel(): ComposeState | null {
    if (!this.state) return null
    const cancelled = { ...this.state, phase: "plan" as ComposePhase }
    this.history.push(cancelled)
    this.state = null
    return cancelled
  }

  /**
   * 获取历史记录
   */
  getHistory(): ComposeState[] {
    return [...this.history]
  }

  /**
   * 生成状态文本
   */
  toText(): string {
    if (!this.state) return "No active compose session"

    const lines: string[] = [
      "# Compose Session",
      "",
      `Phase: ${this.state.phase}`,
      `Spec: ${this.state.spec}`,
      `Started: ${this.state.startedAt}`,
      `Updated: ${this.state.updatedAt}`,
    ]

    if (this.state.plan) {
      lines.push("", "## Plan", this.state.plan)
    }

    if (this.state.codeFiles.length > 0) {
      lines.push("", "## Code Files", ...this.state.codeFiles.map(f => `- ${f}`))
    }

    if (this.state.reviewComments.length > 0) {
      lines.push("", "## Review Comments", ...this.state.reviewComments.map(c => `- ${c}`))
    }

    if (this.state.testResults.length > 0) {
      lines.push("", "## Test Results", ...this.state.testResults.map(r => `- ${r}`))
    }

    if (this.state.debugLog.length > 0) {
      lines.push("", "## Debug Log", ...this.state.debugLog.map(l => `- ${l}`))
    }

    lines.push("", `Verification: ${this.state.verificationPassed ? "PASSED" : "NOT PASSED"}`)

    return lines.join("\n")
  }

  /**
   * 生成系统提示
   */
  toSystemPrompt(): string {
    if (!this.state) return ""

    const skill = this.getCurrentSkill()
    if (!skill) return ""

    return (
      `[Compose Mode: ${this.state.phase}]\n` +
      `Spec: ${this.state.spec}\n` +
      (this.state.plan ? `Plan: ${this.state.plan.slice(0, 200)}...\n` : "") +
      `Task: ${skill.description}\n` +
      `Available tools: ${skill.tools.join(", ")}`
    )
  }

  /**
   * 获取所有可用的 Compose Skills
   */
  static getSkills(): ComposeSkill[] {
    return PHASE_ORDER.map(p => COMPOSE_SKILLS[p])
  }

  /**
   * 获取阶段顺序
   */
  static getPhaseOrder(): ComposePhase[] {
    return [...PHASE_ORDER]
  }
}
