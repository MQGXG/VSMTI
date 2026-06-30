/**
 * 插件钩子系统 — EventEmitter 风格，参考 webpack Tapable
 * 允许外部模块在 Agent 生命周期关键点注入行为
 */

// 返回值 `undefined` 表示"继续"，`非 undefined` 表示"阻断/传递"
type HookHandler = (...args: any[]) => any | Promise<any>

export class PluginHooks {
  private hooks = new Map<string, Set<HookHandler>>()

  /** 注册钩子监听 */
  on(event: string, handler: HookHandler): () => void {
    if (!this.hooks.has(event)) this.hooks.set(event, new Set())
    this.hooks.get(event)!.add(handler)
    return () => this.hooks.get(event)?.delete(handler)
  }

  /** 触发同步钩子 */
  emit(event: string, ...args: any[]): void {
    this.hooks.get(event)?.forEach((handler) => {
      try { handler(...args) } catch { /* 单个钩子失败不影响其他 */ }
    })
  }

  /** 触发异步钩子（并行） */
  async emitAsync(event: string, ...args: any[]): Promise<void> {
    const handlers = this.hooks.get(event)
    if (!handlers) return
    await Promise.all(
      Array.from(handlers).map((h) => {
        try { return Promise.resolve(h(...args)) } catch { return Promise.resolve() }
      })
    )
  }

  /** 触发串行异步钩子（按注册顺序） */
  async emitSerial(event: string, ...args: any[]): Promise<void> {
    const handlers = this.hooks.get(event)
    if (!handlers) return
    for (const handler of handlers) {
      try { await handler(...args) } catch { /* 单个失败不影响后续 */ }
    }
  }

  /** 触发串行钩子直到有一个返回非 null（阻断模式，如 PreToolUse 权限） */
  async triggerUntil(event: string, ...args: any[]): Promise<any> {
    const handlers = this.hooks.get(event)
    if (!handlers) return null
    for (const handler of handlers) {
      try {
        const result = await handler(...args)
        if (result !== null && result !== undefined) return result
      } catch { /* 单个失败不影响后续 */ }
    }
    return null
  }

  /** 触发流水线钩子（waterfall），每个 handler 可以修改并传递值给下一个 */
  async emitWaterfall(event: string, initial: any, ...args: any[]): Promise<any> {
    let result = initial
    const handlers = this.hooks.get(event)
    if (!handlers) return result
    for (const handler of handlers) {
      try {
        const r = await handler(result, ...args)
        if (r !== undefined) result = r
      } catch { /* 单个失败不影响后续 */ }
    }
    return result
  }

  /** 移除所有钩子 */
  clear(): void {
    this.hooks.clear()
  }

  /** 列出所有注册的事件 */
  listEvents(): string[] {
    return Array.from(this.hooks.keys())
  }

  /** 获取某事件的监听器数量 */
  listenerCount(event: string): number {
    return this.hooks.get(event)?.size || 0
  }
}

/** 全局单例 */
export const pluginHooks = new PluginHooks()
