export type InputType = "user" | "steer" | "queue"

export interface QueueItem {
  message: string
  type: InputType
}

export class PendingInputQueue {
  private items: QueueItem[] = []

  push(item: QueueItem): void {
    if (item.type === "steer") {
      const idx = this.items.findIndex(i => i.type === "steer" || i.type === "queue")
      if (idx >= 0) this.items.splice(idx, 0, item)
      else this.items.push(item)
    } else {
      this.items.push(item)
    }
  }

  pushMany(items: QueueItem[]): void {
    for (const item of items) this.push(item)
  }

  hasPending(type?: "steer" | "queue" | "user"): boolean {
    if (type) return this.items.some(i => i.type === type)
    return this.items.length > 0
  }

  next(): QueueItem | null {
    return this.items.shift() || null
  }

  clear(): void {
    this.items.length = 0
  }

  get length(): number {
    return this.items.length
  }
}
