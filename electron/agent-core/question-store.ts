/**
 * 问答等待 — Agent 在执行过程中可以向用户提问
 * 基于 Promise，agent.run() 的 generator 在 yield question 后暂停等待回答
 */

export interface QuestionRequest {
  id: string
  question: string
  options?: string[]
  answer: string | null
  resolved: boolean
}

let questionIdCounter = 0

export class QuestionStore {
  private pending = new Map<string, { resolve: (answer: string) => void; reject: () => void }>()

  /** 创建一个待回答的问题，返回 Promise 等待回答 */
  ask(question: string, options?: string[]): { request: QuestionRequest; promise: Promise<string> } {
    const id = `q-${++questionIdCounter}-${Date.now().toString(36)}`

    const request: QuestionRequest = {
      id, question, options,
      answer: null, resolved: false,
    }

    const promise = new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })

    return { request, promise }
  }

  /** 回答问题 */
  answer(id: string, answer: string): boolean {
    const pending = this.pending.get(id)
    if (!pending) return false
    this.pending.delete(id)
    pending.resolve(answer)
    return true
  }

  /** 拒绝/跳过问题 */
  reject(id: string): boolean {
    const pending = this.pending.get(id)
    if (!pending) return false
    this.pending.delete(id)
    pending.reject()
    return true
  }

  /** 获取所有待处理问题 */
  getPending(): QuestionRequest[] {
    return Array.from(this.pending.entries()).map(([id, _]) => ({
      id, question: "", answer: null, resolved: false,
    }))
  }

  /** 检查是否有待处理问题 */
  hasPending(): boolean {
    return this.pending.size > 0
  }
}

/** 全局实例 */
export const questionStore = new QuestionStore()
