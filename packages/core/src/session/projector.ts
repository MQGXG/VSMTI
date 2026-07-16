/**
 * Projector — 将事件流投影为消息列表
 *
 * 类似 opencode 的 projector 模式，解耦事件产生和状态投影。
 * 支持从快照 + 增量事件重建消息列表，避免全量回放。
 */

import type { SessionEvent, MessageAppendedPayload, SessionCompactedPayload, EventSnapshot } from "./event-types"
import type { StoredMessage } from "./store"

export class Projector {
  /**
   * 从基础消息 + 增量事件重建消息列表
   * @param baseMessages 基础消息（通常来自快照）
   * @param events 增量事件
   */
  project(baseMessages: StoredMessage[], events: SessionEvent[]): StoredMessage[] {
    const messages = [...baseMessages]

    for (const event of events) {
      switch (event.type) {
        case "message.appended": {
          const p = event.payload as MessageAppendedPayload
          messages.push({
            role: p.role,
            content: p.content,
            timestamp: event.timestamp,
            ...(p.toolCallId ? { toolCallId: p.toolCallId } : {}),
            ...(p.retryCount ? { retryCount: p.retryCount } : {}),
          })
          break
        }

        case "message.edited": {
          const p = event.payload as { messageId: number; newContent: string }
          // 查找并更新消息（通过索引匹配）
          const idx = messages.findIndex((_, i) => i === p.messageId)
          if (idx >= 0 && idx < messages.length) {
            messages[idx] = { ...messages[idx], content: p.newContent }
          }
          break
        }

        case "message.deleted": {
          const p = event.payload as { messageId: number }
          const delIdx = messages.findIndex((_, i) => i === p.messageId)
          if (delIdx >= 0) {
            messages.splice(delIdx, 1)
          }
          break
        }

        case "session.compacted": {
          const p = event.payload as SessionCompactedPayload
          // 用压缩后的消息替换全部
          return p.compactedMessages.map(m => ({
            role: m.role as StoredMessage["role"],
            content: m.content,
            timestamp: event.timestamp,
          }))
        }

        // 其他事件类型不影响消息列表，忽略
        default:
          break
      }
    }

    return messages
  }

  /**
   * 全量回放 — 从事件流重建消息列表（无快照时使用）
   */
  replay(events: SessionEvent[]): StoredMessage[] {
    return this.project([], events)
  }

  /**
   * 从快照 + 增量事件重建
   * 先加载快照中的消息，再应用 seq > up_to_seq 的事件
   */
  projectFromSnapshot(
    snapshot: EventSnapshot,
    events: SessionEvent[],
  ): StoredMessage[] {
    const baseMessages: StoredMessage[] = JSON.parse(snapshot.messages_json)
    // 过滤出快照之后的事件
    const incrementalEvents = events.filter(e => e.seq > snapshot.up_to_seq)
    return this.project(baseMessages, incrementalEvents)
  }

  /**
   * 将消息列表序列化为快照 JSON
   */
  serializeSnapshot(messages: StoredMessage[]): string {
    return JSON.stringify(messages)
  }
}

// ── 全局单例 ────────────────────────────────────────────

let _instance: Projector | null = null

export function getProjector(): Projector {
  if (!_instance) {
    _instance = new Projector()
  }
  return _instance
}
