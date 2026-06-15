/**
 * 声明式权限系统 — 类似 OpenCode 的 permission 模块
 * 通配符匹配 + 作用域 + 审计
 */

export interface PermissionRule {
  action: string    // read / write / bash / web_search / *
  resource: string  // * / ** / src/** / etc
  effect: "allow" | "deny" | "ask"
}

export class PermissionSet {
  constructor(private rules: PermissionRule[] = []) {}

  isAllowed(action: string, permission?: string): boolean {
    const actionName = permission || action

    // 从后往前匹配（最后一条规则优先）
    for (let i = this.rules.length - 1; i >= 0; i--) {
      const rule = this.rules[i]
      if (this.match(rule.action, actionName)) {
        return rule.effect === "allow" || rule.effect === "ask"
      }
    }
    return true // 默认允许
  }

  needsApproval(action: string, permission?: string): boolean {
    const actionName = permission || action
    for (let i = this.rules.length - 1; i >= 0; i--) {
      const rule = this.rules[i]
      if (this.match(rule.action, actionName)) {
        return rule.effect === "ask"
      }
    }
    return false
  }

  evaluate(action: string, permission?: string): "allow" | "deny" | "ask" {
    const actionName = permission || action
    for (let i = this.rules.length - 1; i >= 0; i--) {
      const rule = this.rules[i]
      if (this.match(rule.action, actionName)) {
        return rule.effect
      }
    }
    return "allow" // 默认允许
  }

  private match(pattern: string, value: string): boolean {
    if (pattern === "*") return true
    // 简单通配符匹配
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$")
    return regex.test(value)
  }

  /** 获取所有规则 */
  getAll(): PermissionRule[] {
    return [...this.rules]
  }

  /** 从配置对象创建 */
  static fromConfig(config: Record<string, string>): PermissionSet {
    const rules: PermissionRule[] = []
    for (const [action, effect] of Object.entries(config)) {
      if (effect === "allow" || effect === "deny" || effect === "ask") {
        rules.push({ action, resource: "*", effect })
      }
    }
    return new PermissionSet(rules)
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

/** 默认权限（assistant 模式） */
export const defaultPermissions = new PermissionSet(basePermissionRules)

/** 从基础规则 + 模式派生权限集 */
export function permissionsForMode(
  mode: string,
  modeRules: PermissionRule[],
): PermissionSet {
  const allRules = [...modeRules, ...basePermissionRules]
  return new PermissionSet(allRules)
}
