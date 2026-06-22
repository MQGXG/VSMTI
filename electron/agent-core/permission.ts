/**
 * 声明式权限系统
 * 参考 OpenCode 的 Wildcard.match — 安全通配符匹配（非正则）
 */

export interface PermissionRule {
  action: string    // read / write / bash / web_search / *
  resource: string  // * / ** / src/** / etc
  effect: "allow" | "deny" | "ask"
}

/**
 * 安全通配符匹配 — 替代正则，防止 ReDoS 攻击
 * 支持 * (单段) 和 ** (递归) 匹配
 * 参考 OpenCode 的 Wildcard.match 实现
 */
function wildcardMatch(pattern: string, value: string): boolean {
  if (pattern === "*") return true
  if (pattern === value) return true

  // ** 递归匹配
  if (pattern.includes("**")) {
    return doubleStarMatch(pattern, value)
  }

  // 单 * 匹配：foo/*.ts 匹配 foo/bar.ts（不跨 /）
  return singleStarMatch(pattern, value)
}

/** 单 * 匹配：按 / 分段，每段内用 * 通配 */
function singleStarMatch(pattern: string, value: string): boolean {
  const pSegments = pattern.split("/")
  const vSegments = value.split("/")

  if (pSegments.length !== vSegments.length) return false

  for (let i = 0; i < pSegments.length; i++) {
    if (!segmentMatch(pSegments[i], vSegments[i])) return false
  }
  return true
}

/** ** 递归匹配：按 / 分段匹配 */
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

/** 单段匹配：支持 * 通配 */
function segmentMatch(pattern: string, value: string): boolean {
  if (pattern === "*") return true
  if (pattern === value) return true
  if (!pattern.includes("*")) return pattern === value

  // 按 * 分割，检查每段 literal 是否按顺序出现在 value 中
  const literals = pattern.split("*").filter(p => p !== "")
  if (literals.length === 0) return true // 全是 *

  let vIdx = 0
  for (const lit of literals) {
    const found = value.indexOf(lit, vIdx)
    if (found === -1) return false
    vIdx = found + lit.length
  }

  // 如果 pattern 不以 * 结尾，value 必须以最后一段 literal 结尾
  if (!pattern.endsWith("*")) {
    return value.endsWith(literals[literals.length - 1])
  }

  return true
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

  needsApproval(action: string, permission?: string): boolean {
    return this.evaluate(action, permission) === "ask"
  }

  evaluate(action: string, permission?: string): "allow" | "deny" | "ask" {
    const actionName = permission || action
    const cacheKey = actionName

    const cached = this.matchCache.get(cacheKey)
    if (cached !== undefined) return cached

    // 从后往前匹配（最后一条规则优先）
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

  getAll(): PermissionRule[] {
    return [...this.rules]
  }

  /** 从配置对象创建（支持嵌套结构） */
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

  /** 合并多个规则集 */
  static merge(...rulesets: PermissionRule[][]): PermissionSet {
    return new PermissionSet(rulesets.flat())
  }
}

/** 基础默认权限：只读操作允许，写操作询问 */
const basePermissionRules: PermissionRule[] = [
  { action: "read_file", resource: "*", effect: "allow" },
  { action: "list_files", resource: "*", effect: "allow" },
  { action: "glob", resource: "*", effect: "allow" },
  { action: "grep", resource: "*", effect: "allow" },
  { action: "web_search", resource: "*", effect: "allow" },
  { action: "write_file", resource: "*", effect: "ask" },
  { action: "edit_file", resource: "*", effect: "ask" },
  { action: "code_exec", resource: "*", effect: "ask" },
  { action: "bash", resource: "*", effect: "ask" },
]

export const defaultPermissions = new PermissionSet(basePermissionRules)

export function permissionsForMode(
  mode: string,
  modeRules: PermissionRule[],
): PermissionSet {
  const allRules = [...modeRules, ...basePermissionRules]
  return new PermissionSet(allRules)
}
