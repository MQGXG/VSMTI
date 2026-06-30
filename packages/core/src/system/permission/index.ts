export interface PermissionRule {
  action: string    // read / write / bash / web_search / *
  resource: string  // * / ** / src/** / npm * / rm -rf *
  effect: "allow" | "deny" | "ask"
}

function wildcardMatch(pattern: string, value: string): boolean {
  if (pattern === "*") return true
  if (pattern === value) return true
  if (pattern.includes("**")) return doubleStarMatch(pattern, value)
  return singleStarMatch(pattern, value)
}

function singleStarMatch(pattern: string, value: string): boolean {
  const pSegments = pattern.split("/")
  const vSegments = value.split("/")
  if (pSegments.length !== vSegments.length) return false
  for (let i = 0; i < pSegments.length; i++) {
    if (!segmentMatch(pSegments[i], vSegments[i])) return false
  }
  return true
}

function doubleStarMatch(pattern: string, value: string): boolean {
  const pSegments = pattern.split("/")
  const vSegments = value.split("/")
  return matchSegments(pSegments, vSegments, 0, 0)
}

function matchSegments(pParts: string[], vParts: string[], pi: number, vi: number): boolean {
  while (pi < pParts.length) {
    if (pParts[pi] === "**") {
      pi++
      if (pi === pParts.length) return true
      for (let skip = 0; skip <= vParts.length - vi; skip++) {
        if (matchSegments(pParts, vParts, pi, vi + skip)) return true
      }
      return false
    }
    if (vi >= vParts.length) return false
    if (!segmentMatch(pParts[pi], vParts[vi])) return false
    pi++
    vi++
  }
  return vi === vParts.length
}

function segmentMatch(pattern: string, value: string): boolean {
  if (pattern === "*") return true
  if (pattern === value) return true
  if (!pattern.includes("*")) return pattern === value
  const literals = pattern.split("*").filter(p => p !== "")
  if (literals.length === 0) return true
  let vIdx = 0
  for (const lit of literals) {
    const found = value.indexOf(lit, vIdx)
    if (found === -1) return false
    vIdx = found + lit.length
  }
  if (!pattern.endsWith("*")) {
    return value.endsWith(literals[literals.length - 1])
  }
  return true
}

/** Gate 1: 硬拒绝列表 — 任何匹配这些模式的 bash 命令直接拒绝 */
const HARD_DENY_PATTERNS = [
  "rm -rf /",
  "rm -rf /*",
  "sudo",
  "shutdown",
  "reboot",
  "mkfs",
  "dd if=",
  "> /dev/sd",
  ":(){ :|:& };:",  // fork bomb
  "chmod -R 000 /",
  "mv /* /dev/null",
]

export function checkHardDeny(command: string): string | null {
  for (const pattern of HARD_DENY_PATTERNS) {
    if (command.includes(pattern)) return `Blocked: '${pattern}' is on the deny list`
  }
  return null
}

export class PermissionSet {
  private rules: PermissionRule[]
  private matchCache = new Map<string, "allow" | "deny" | "ask">()

  constructor(rules: PermissionRule[] = []) {
    this.rules = rules
  }

  isAllowed(action: string, permission?: string): boolean {
    const result = this.evaluate(action, permission)
    return result === "allow" || result === "ask"
  }

  needsApproval(action: string, resource?: string): boolean {
    if (resource !== undefined) return this.evaluateResource(action, resource) === "ask"
    return this.evaluate(action) === "ask"
  }

  /**
   * 评估权限（向后兼容版本）
   * 第二个参数是 permission alias（如工具定义中的 `permission` 字段）
   * 用于 registry.ts 的工具可见性过滤
   */
  evaluate(action: string, permission?: string): "allow" | "deny" | "ask" {
    const actionName = permission || action
    const cacheKey = actionName
    const cached = this.matchCache.get(cacheKey)
    if (cached !== undefined) return cached

    for (let i = this.rules.length - 1; i >= 0; i--) {
      const rule = this.rules[i]
      if (wildcardMatch(rule.action, actionName)) {
        this.matchCache.set(cacheKey, rule.effect)
        return rule.effect
      }
    }
    this.matchCache.set(cacheKey, "allow")
    return "allow"
  }

  /**
   * 命令级别权限评估（新）
   * 同时匹配 action（工具名）和 resource（命令/路径内容）
   * 用于 permission-gate.ts 的精确权限检查
   */
  evaluateResource(action: string, resource: string): "allow" | "deny" | "ask" {
    const cacheKey = `${action}::${resource}`
    const cached = this.matchCache.get(cacheKey)
    if (cached !== undefined) return cached

    for (let i = this.rules.length - 1; i >= 0; i--) {
      const rule = this.rules[i]
      if (!wildcardMatch(rule.action, action)) continue
      if (rule.resource !== "*" && !wildcardMatch(rule.resource, resource)) continue
      this.matchCache.set(cacheKey, rule.effect)
      return rule.effect
    }
    this.matchCache.set(cacheKey, "allow")
    return "allow"
  }

  getAll(): PermissionRule[] {
    return [...this.rules]
  }

  static fromConfig(config: Record<string, unknown>): PermissionSet {
    const rules: PermissionRule[] = []
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === "string" && ["allow", "deny", "ask"].includes(value)) {
        rules.push({ action: key, resource: "*", effect: value as PermissionRule["effect"] })
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        for (const [pattern, action] of Object.entries(value as Record<string, string>)) {
          if (["allow", "deny", "ask"].includes(action)) {
            rules.push({ action: key, resource: pattern, effect: action as PermissionRule["effect"] })
          }
        }
      }
    }
    return new PermissionSet(rules)
  }

  static merge(...rulesets: PermissionRule[][]): PermissionSet {
    return new PermissionSet(rulesets.flat())
  }
}

const basePermissionRules: PermissionRule[] = [
  // 只读工具：直接允许（使用别名匹配）
  { action: "read", resource: "*", effect: "allow" },
  { action: "read_file", resource: "*", effect: "allow" },
  { action: "list_files", resource: "*", effect: "allow" },
  { action: "glob", resource: "*", effect: "allow" },
  { action: "grep", resource: "*", effect: "allow" },
  { action: "web_search", resource: "*", effect: "allow" },
  { action: "web_fetch", resource: "*", effect: "allow" },
  { action: "web_browse", resource: "*", effect: "allow" },
  // bash: 安全的命令自动允许
  { action: "bash", resource: "ls *", effect: "allow" },
  { action: "bash", resource: "cat *", effect: "allow" },
  { action: "bash", resource: "which *", effect: "allow" },
  { action: "bash", resource: "echo *", effect: "allow" },
  { action: "bash", resource: "pwd", effect: "allow" },
  { action: "bash", resource: "node --version", effect: "allow" },
  // bash: 其他需要确认
  { action: "bash", resource: "*", effect: "ask" },
  // 写操作：需要确认（使用别名匹配）
  { action: "edit", resource: "*", effect: "ask" },
  { action: "write_file", resource: "*", effect: "ask" },
  { action: "edit_file", resource: "*", effect: "ask" },
  { action: "run_code", resource: "*", effect: "ask" },
  { action: "code_exec", resource: "*", effect: "ask" },
]

export const defaultPermissions = new PermissionSet(basePermissionRules)

export function permissionsForMode(
  mode: string,
  modeRules: PermissionRule[],
): PermissionSet {
  const allRules = [...modeRules, ...basePermissionRules]
  return new PermissionSet(allRules)
}
