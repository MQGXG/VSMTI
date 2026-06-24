/**
 * 向量记忆 Provider — 使用 OpenAI Embeddings API 实现语义搜索
 * 替代 ChromaDB（Python 独占）
 */

import { app } from "electron"
import { join } from "path"
import fs from "fs"
import { MemoryProvider } from "./types"
import { createHash } from "crypto"

interface MemoryDocument {
  id: string
  text: string
  embedding: number[]
  timestamp: string
  sessionID: string
}

interface VectorStore {
  documents: MemoryDocument[]
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

function chunkText(text: string, maxLen = 200): string[] {
  const chunks: string[] = []
  const sentences = text.split(/[。！？.!?\n]+/).filter(Boolean)
  let current = ""
  for (const s of sentences) {
    if ((current + s).length > maxLen && current) {
      chunks.push(current.trim())
      current = s
    } else {
      current += s
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

export class VectorMemoryProvider implements MemoryProvider {
  name = "vector"
  private apiKey = ""
  private apiUrl = ""
  private model = "text-embedding-3-small"
  private store: VectorStore = { documents: [] }
  private storePath = ""
  private sessionID = ""

  constructor(config?: { apiKey?: string; apiUrl?: string; model?: string }) {
    if (config?.apiKey) this.apiKey = config.apiKey
    if (config?.apiUrl) this.apiUrl = config.apiUrl
    if (config?.model) this.model = config.model
  }

  async initialize(sessionID: string, _workspace: string): Promise<void> {
    this.sessionID = sessionID
    const dir = join(app.getPath("userData"), "vector-memory")
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    this.storePath = join(dir, `${sessionID}.json`)
    this.loadStore()
  }

  buildSystemPrompt(): string {
    const count = this.store.documents.length
    return count > 0
      ? `[Vector Memory: ${count} semantic memory entries available. I can recall past decisions and context from previous turns.]`
      : ""
  }

  async prefetch(query: string, _sessionID: string): Promise<string> {
    if (this.store.documents.length === 0) return ""
    if (!this.apiKey) return ""

    const queryEmbedding = await this.getEmbedding(query)
    if (queryEmbedding.length === 0) return ""

    const scored = this.store.documents
      .map((doc) => ({ doc, score: cosineSimilarity(queryEmbedding, doc.embedding) }))
      .filter((s) => s.score > 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)

    if (scored.length === 0) return ""

    return (
      `<memory-context>\n` +
      `[System note: The following is semantically recalled memory, ` +
      `NOT new user input. Treat as authoritative reference data.]\n\n` +
      scored.map((s) => `- [${s.score.toFixed(2)}] ${s.doc.text}`).join("\n") +
      `\n</memory-context>`
    )
  }

  async syncTurn(user: string, assistant: string, _sessionID: string): Promise<void> {
    if (!this.apiKey) return
    const combined = `${user}\n${assistant}`
    const chunks = chunkText(combined)

    for (const chunk of chunks) {
      if (chunk.length < 20) continue
      const embedding = await this.getEmbedding(chunk)
      if (embedding.length === 0) continue

      const id = createHash("md5").update(chunk).digest("hex")
      // 去重
      if (this.store.documents.some((d) => d.id === id)) continue

      this.store.documents.push({
        id,
        text: chunk.slice(0, 500),
        embedding,
        timestamp: new Date().toISOString(),
        sessionID: this.sessionID,
      })
    }

    // 限制文档数
    if (this.store.documents.length > 500) {
      this.store.documents = this.store.documents.slice(-500)
    }
    this.saveStore()
  }

  async shutdown(): Promise<void> {
    this.saveStore()
  }

  private async getEmbedding(text: string): Promise<number[]> {
    try {
      const url = (this.apiUrl || "https://api.openai.com/v1").replace(/\/+$/, "")
      const resp = await fetch(`${url}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ input: text, model: this.model }),
        signal: AbortSignal.timeout(10000),
      })
      if (!resp.ok) return []
      const data = await resp.json()
      return data.data?.[0]?.embedding || []
    } catch {
      return []
    }
  }

  private loadStore(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        this.store = JSON.parse(fs.readFileSync(this.storePath, "utf-8"))
      }
    } catch { this.store = { documents: [] } }
  }

  private saveStore(): void {
    try {
      fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2), "utf-8")
    } catch { /* 静默 */ }
  }
}
