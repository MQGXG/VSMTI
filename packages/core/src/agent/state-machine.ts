export type PermissionReply = "allow" | "deny" | "always"

export type AgentState = "idle" | "running" | "waiting_permission" | "stopped" | "done"

export class AgentStateMachine {
  private _state: AgentState = "idle"
  private _aborted = false

  get state(): AgentState { return this._state }
  get aborted(): boolean { return this._aborted }

  start(): void { this._state = "running" }
  waitPermission(): void { this._state = "waiting_permission" }
  stop(): void { this._state = "stopped"; this._aborted = true }
  finish(): void { this._state = "done" }

  private pendingPermissions = new Map<string, {
    resolve: (allow: boolean) => void
    onAlways?: () => void
  }>()

  replyPermission(id: string, reply: PermissionReply): boolean {
    const pending = this.pendingPermissions.get(id)
    if (!pending) return false
    this.pendingPermissions.delete(id)
    if (reply === "deny") {
      pending.resolve(false)
    } else {
      pending.resolve(true)
      if (reply === "always") pending.onAlways?.()
    }
    return true
  }

  createPermissionRequest(onAlways?: () => void): { id: string; waitForReply(): Promise<boolean> } {
    const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`
    let resolve!: (allow: boolean) => void
    const promise = new Promise<boolean>((r) => { resolve = r })
    this.pendingPermissions.set(id, { resolve, onAlways })
    return {
      id,
      waitForReply: () => promise,
    }
  }
}
