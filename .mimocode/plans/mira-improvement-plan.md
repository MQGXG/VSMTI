# Mira 项目改进实施方案

> 9 项改进，按实施顺序排列（先易后难，先接入后新建）
> 基于代码审查，所有文件路径相对于 `packages/core/src/`

---

## 实施顺序总览

| 序号 | 改进项 | 类型 | 依赖 | 预估工作量 |
|------|--------|------|------|-----------|
| 1 | 快照持久化 | 新功能（简单） | 无 | 0.5d |
| 2 | FTS5 搜索 | 新功能（简单） | 无 | 1d |
| 3 | ScopedToolRegistry 接入 | 接入已有模块 | 无 | 0.5d |
| 4 | Structured Summary 接入 | 接入已有模块 | 无 | 1d |
| 5 | Dream 知识注入 | 新功能（中等） | 无 | 0.5d |
| 6 | Event Sourcing 接入 | 接入已有模块 | 无 | 2d |
| 7 | RunCoordinator 接入 | 接入已有模块 | #3 | 1.5d |
| 8 | Todo 系统 | 新功能（完整） | #5 | 2d |
| 9 | 集成测试 + 回归 | 验证 | 全部 | 1d |
| **合计** | | | | **10d** |

---

## 改进 1：快照持久化

**当前问题**：`snapshot.ts` 中 `SnapshotManager` 使用内存 `Map` 存储快照，进程重启后丢失。

### 需要修改的文件清单

1. `session/snapshot.ts` — 主要修改

### 核心代码变更

```typescript
// snapshot.ts — 修改 SnapshotManager 类

import { getPlatformPaths } from "../config/paths"

export class SnapshotManager {
  private snapshots: Snapshot[] = []
  private maxSnapshots = 50
  private snapshotDir: string
  private snapshotsFilePath: string  // 新增：JSON 持久化路径

  constructor(workspace: string) {
    this.snapshotDir = path.join(workspace, ".mira", "snapshots")
    this.snapshotsFilePath = path.join(this.snapshotDir, "snapshots.json")
  }

  // 新增：从磁盘加载快照
  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.snapshotsFilePath)) {
        const raw = JSON.parse(fs.readFileSync(this.snapshotsFilePath, "utf-8"))
        // 重建 Map 结构
        this.snapshots = raw.map((s: any) => ({
          ...s,
          files: new Map(Object.entries(s.files || {}))
        }))
      }
    } catch {
      this.snapshots = []
    }
  }

  // 新增：保存到磁盘
  private saveToDisk(): void {
    try {
      fs.mkdirSync(this.snapshotDir, { recursive: true })
      const serializable = this.snapshots.map(s => ({
        ...s,
        files: Object.fromEntries(s.files)
      }))
      fs.writeFileSync(this.snapshotsFilePath, JSON.stringify(serializable, null, 2), "utf-8")
    } catch { /* 静默 */ }
  }

  // 修改 capture()：保存后调用 saveToDisk()
  async capture(files: string[], description?: string): Promise<string> {
    // ... 现有逻辑不变 ...
    this.snapshots.push(snapshot)
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift()
    }
    this.saveToDisk()  // 新增
    return id
  }

  // 修改 restore/delete/clear：操作后调用 saveToDisk()
  async restore(snapshotId: string): Promise<string[]> {
    // ... 现有逻辑不变 ...
    this.saveToDisk()  // 新增
    return restoredFiles
  }

  delete(snapshotId: string): boolean {
    // ... 现有逻辑不变 ...
    if (idx >= 0) {
      this.snapshots.splice(idx, 1)
      this.saveToDisk()  // 新增
      return true
    }
    return false
  }

  clear(): void {
    this.snapshots = []
    this.saveToDisk()  // 新增
  }

  // 新增：自动清理过期快照（超过 7 天）
  cleanup(maxAgeMs = 7 * 24 * 60 * 60 * 1000): number {
    const now = Date.now()
    const before = this.snapshots.length
    this.snapshots = this.snapshots.filter(s => now - s.timestamp < maxAgeMs)
    const removed = before - this.snapshots.length
    if (removed > 0) this.saveToDisk()
    return removed
  }
}

// 修改 getSnapshotManager：首次调用时从磁盘加载
export function getSnapshotManager(workspace: string): SnapshotManager {
  if (!globalSnapshotManager) {
    globalSnapshotManager = new SnapshotManager(workspace)
    globalSnapshotManager.loadFromDisk()
  }
  return globalSnapshotManager
}
```

### 集成点

- 无外部集成变更，`SnapshotManager` 的 API 签名完全不变
- `session/manager.ts:117-121` 的 `restoreSnapshot()` 无需修改

### 向后兼容性保证

- 快照文件存储在 `.mira/snapshots/snapshots.json`，不与现有文件冲突
- 旧版内存快照自然丢弃（进程重启后），无迁移需求
- `loadFromDisk()` 使用 try-catch，旧版无文件时不报错

### 预估工作量：0.5 人天

---

## 改进 2：FTS5 搜索接入 searchMessages

**当前问题**：`manager.ts:142-165` 的 `searchMessages()` 使用 O(S*M) 内存扫描（加载所有会话所有消息做 `toLowerCase().includes()`），无索引，大数据量下极慢。

### 需要修改的文件清单

1. `session/manager.ts` — 修改 `searchMessages()`
2. `system/database.ts` — 添加 FTS5 虚拟表迁移

### 核心代码变更

```typescript
// database.ts — SCHEMA 末尾添加：

  -- 消息全文搜索索引（FTS5）
  CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    content,
    session_id UNINDEXED,
    role UNINDEXED,
    tokenize='unicode61'
  );
  -- 索引触发器：自动同步 messages 表到 FTS
  -- 注意：sql.js 的触发器限制，改用应用层同步
```

```typescript
// manager.ts — 修改 searchMessages()

import { getDbAsync, runWrite } from "../system/database"

// 新增：初始化 FTS 索引（首次调用或迁移时）
export async function ensureFTSIndex(): Promise<void> {
  const db = await getDbAsync()
  // 检查 FTS 表是否存在
  try {
    db.exec("SELECT * FROM messages_fts LIMIT 0")
    // 检查是否需要全量同步
    const msgCount = db.exec("SELECT COUNT(*) FROM messages")
    const ftsCount = db.exec("SELECT COUNT(*) FROM messages_fts")
    if ((msgCount[0]?.values[0]?.[0] || 0) > (ftsCount[0]?.values[0]?.[0] || 0)) {
      // 全量同步
      const rows = db.exec("SELECT content, session_id, role FROM messages")
      if (rows.length > 0) {
        for (const row of rows[0].values) {
          db.run("INSERT INTO messages_fts (content, session_id, role) VALUES (?, ?, ?)", row)
        }
      }
    }
  } catch {
    // FTS 表不存在，创建
    try {
      db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        content, session_id UNINDEXED, role UNINDEXED, tokenize='unicode61'
      )`)
      const rows = db.exec("SELECT content, session_id, role FROM messages")
      if (rows.length > 0) {
        for (const row of rows[0].values) {
          db.run("INSERT INTO messages_fts (content, session_id, role) VALUES (?, ?, ?)", row)
        }
      }
    } catch { /* FTS5 不可用，降级 */ }
  }
}

// 修改 appendMessage 后的同步（store.ts 中添加）
// 或在 store.ts 的 appendMessage 中追加：
//   try {
//     runWrite("INSERT INTO messages_fts (content, session_id, role) VALUES (?, ?, ?)",
//       [message.content, sessionID, message.role])
//   } catch { /* FTS 索引同步失败不阻塞 */ }

// 修改 searchMessages()
export async function searchMessages(query: string): Promise<Array<{
  session_id: string; session_title: string;
  message: { role: string; content: string; timestamp: string };
  context: string
}>> {
  if (!query.trim()) return []
  const db = await getDbAsync()

  // 尝试 FTS5 搜索
  try {
    // 转义 FTS5 特殊字符
    const ftsQuery = query.replace(/['"*()^${}~:+-]/g, " ")
      .match(/[\p{L}\p{N}_]+/gu)
      ?.map(t => t.toLowerCase())
      .filter(Boolean)
      .join(" AND ")
    if (!ftsQuery) return []

    const results: Array<{
      session_id: string; session_title: string;
      message: { role: string; content: string; timestamp: string };
      context: string
    }> = []

    const rows = db.exec(`
      SELECT f.session_id, s.title, f.content, f.role,
             snippet(messages_fts, 0, '>>>', '<<<', '...', 32) as snip,
             rank
      FROM messages_fts f
      JOIN sessions s ON f.session_id = s.session_id
      WHERE messages_fts MATCH ?
      ORDER BY rank
      LIMIT 50
    `, [ftsQuery])

    if (rows.length > 0) {
      for (const row of rows[0].values) {
        results.push({
          session_id: String(row[0]),
          session_title: String(row[1]),
          message: {
            role: String(row[3]),
            content: String(row[2]).slice(0, 300),
            timestamp: "",
          },
          context: String(row[4] || ""),
        })
      }
      return results
    }
  } catch { /* FTS 失败，降级到 LIKE */ }

  // 降级：LIKE 搜索
  const q = query.toLowerCase()
  const rows = db.exec(`
    SELECT m.session_id, s.title, m.content, m.role, m.timestamp
    FROM messages m
    JOIN sessions s ON m.session_id = s.session_id
    WHERE LOWER(m.content) LIKE ?
    ORDER BY m.id DESC
    LIMIT 50
  `, [`%${q}%`])

  if (rows.length === 0) return []
  return rows[0].values.map(row => ({
    session_id: String(row[0]),
    session_title: String(row[1]),
    message: {
      role: String(row[3]),
      content: String(row[2]).slice(0, 300),
      timestamp: String(row[4]),
    },
    context: String(row[2]).slice(0, 100),
  }))
}
```

### 集成点

- `session/store.ts:37-39` 的 `appendMessage()` 追加一行 FTS 索引同步
- `session/manager.ts:142-165` 的 `searchMessages()` 完全替换
- 数据库初始化时调用 `ensureFTSIndex()`

### 向后兼容性保证

- FTS5 表使用 `CREATE VIRTUAL TABLE IF NOT EXISTS`，旧库自动创建
- FTS5 不可用时自动降级到 LIKE 搜索（与现有逻辑一致但优化了查询）
- 不修改 messages 表结构

### 预估工作量：1 人天

---

## 改进 3：ScopedToolRegistry 接入

**当前问题**：`registry.ts:25` 使用简单 `Map<string, ToolDef>` 存储所有工具，不支持按 scope（模式、位置、插件）分层管理。`tool-scope.ts` 已创建但未接入。

### 需要修改的文件清单

1. `system/registry.ts` — 核心修改

### 核心代码变更

```typescript
// registry.ts — 修改 ToolRegistry 类

import { ScopedToolRegistry } from "./tool-scope"

export class ToolRegistry {
  // 保留旧 Map 用于向后兼容
  private tools = new Map<string, ToolDef>()
  private effectDefs = new Map<string, ToolEffect.Def>()
  // 新增：ScopedToolRegistry 实例
  private scoped = new ScopedToolRegistry()
  private mcpManager: MCPManager | null = null
  private pluginManager: PluginManager | null = null

  register(def: ToolDef): void {
    this.tools.set(def.name, def)
    // 同步注册到 ScopedToolRegistry 的 base 层
    this.scoped.registerBase(def)
  }

  registerEffect(def: ToolEffect.Def): void {
    this.effectDefs.set(def.id, def)
    // Effect 工具也注册到 base
    this.scoped.registerBase(ToolEffect.toLegacyToolDef(def) as unknown as ToolDef)
  }

  // 新增：创建 Scope（供 Agent 按模式/位置注册工具）
  createToolScope(scope: Omit<import("./tool-scope").ToolScope, "createdAt">): import("./tool-scope").ToolScope {
    return this.scoped.createScope(scope)
  }

  // 新增：向 Scope 注册工具
  registerInScope(scopeId: string, def: ToolDef): void {
    this.scoped.registerInScope(scopeId, def)
  }

  // 新增：移除 Scope
  removeScope(scopeId: string): void {
    this.scoped.removeScope(scopeId)
  }

  // 新增：获取 ScopedToolRegistry（供 materialize 使用）
  getScoped(): ScopedToolRegistry {
    return this.scoped
  }

  // 修改 materialize：支持 Scope 解析
  materialize(permissions?: PermissionSet): Materialization {
    // 使用 ScopedToolRegistry 的 resolve 获取工具集
    const resolved = this.scoped.resolve(undefined, permissions)
    const allDefs: ToolDef[] = [
      ...resolved.values(),
      ...Array.from(this.effectDefs.values()).map(et => ToolEffect.toLegacyToolDef(et) as unknown as ToolDef)
    ]
    // 如果 Scope 为空（未注册任何 Scope），fallback 到旧逻辑
    const effectiveDefs = resolved.size === 0
      ? [...this.tools.values(), ...Array.from(this.effectDefs.values()).map(et => ToolEffect.toLegacyToolDef(et) as unknown as ToolDef)]
      : allDefs

    const allowed = permissions
      ? effectiveDefs.filter(t => permissions.isAllowed(t.name, t.permission))
      : effectiveDefs

    const toolSet: LLMToolSet = {}
    for (const t of allowed) {
      toolSet[t.name] = this.toAISDKTool(t)
    }

    return {
      definitions: toolSet,
      settle: async (call: ToolCall, ctx: ToolContext) => {
        // ... settle 逻辑不变，使用 this.tools 查找 ...
      },
    }
  }
}
```

### 集成点

- `ToolRegistry.register()` 自动同步到 `ScopedToolRegistry.registerBase()`
- `materialize()` 优先使用 `ScopedToolRegistry.resolve()`，空 Scope 时 fallback
- Agent 循环可通过 `registry.createToolScope()` 为特定模式注册工具

### 向后兼容性保证

- `ScopedToolRegistry` 在无 Scope 时返回空 Map → fallback 到旧 `tools` Map
- 所有现有 `register()` 调用自动同步到 ScopedToolRegistry
- `materialize()` / `materializeWithModel()` 的外部 API 签名不变
- `get()` / `getAll()` / `execute()` 不受影响

### 预估工作量：0.5 人天

---

## 改进 4：Structured Summary 接入

**当前问题**：`context.ts:382-386` 的 `compactHistory()` 使用简单文本摘要（"Summarize this conversation in 2-3 sentences"），丢失结构化信息。`structured-summary.ts` 的 `IncrementalSummarizer` 已创建但未接入。

### 需要修改的文件清单

1. `session/context.ts` — 核心修改
2. `memory/checkpoint-provider.ts` — 可选优化

### 核心代码变更

```typescript
// context.ts — 修改 ContextManager

import { IncrementalSummarizer, type StructuredSummary } from "./structured-summary"

export class ContextManager {
  // 新增
  private summarizer: IncrementalSummarizer

  constructor(
    checkpointProvider: CheckpointProvider,
    memoryManager: MemoryManager,
    config?: Partial<ContextConfig>,
  ) {
    this.checkpointProvider = checkpointProvider
    this.memoryManager = memoryManager
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.summarizer = new IncrementalSummarizer()
  }

  setLLMConfig(config: { apiKey: string; apiUrl: string; model: string; provider: string }): void {
    this.llmConfig = config
    this.checkpointProvider.setLLMConfig(config)
    // 新增：同步到 summarizer
    this.summarizer.setLLMConfig(config)
  }

  // 修改 compactPipeline 中的 L4 摘要部分
  async compactPipeline(
    messages: LLMMessage[],
    sessionID: string,
  ): Promise<{ messages: LLMMessage[]; didRebuild: boolean; reason: string }> {
    const oldTokens = estimateTokens(messages)

    // 第 1 层：最便宜的 0-API 操作（不变）
    messages = this.toolResultBudget(messages)
    messages = this.budgetedCompress(messages)
    messages = this.microCompact(messages)

    const currentTokens = estimateTokens(messages)
    const usage = currentTokens / this.config.maxContextTokens

    if (usage >= this.config.rebuildThreshold) {
      this.writeTranscript(messages)
      const checkpoint = this.checkpointProvider.getCheckpoint()
      if (checkpoint) {
        // ... 保持不变 ...
      }
    }

    // 超限处理
    if (currentTokens <= this.config.maxContextTokens) {
      this.lastRebuildReason = ""
      return { messages, didRebuild: false, reason: "" }
    }

    // 修改：使用 IncrementalSummarizer 替代旧摘要
    if (this.llmConfig && this.turnCount % this.config.llmSummaryInterval === 0) {
      messages = await this.compactHistoryWithSummarizer(messages)
      this.rebuildCount++
      this.lastRebuildReason = "llm_summary"
      this.lastRebuildAt = new Date().toISOString()
      return { messages, didRebuild: true, reason: "llm_summary" }
    }

    // ... 其余逻辑不变 ...
  }

  // 新增：使用 IncrementalSummarizer 的压缩
  private async compactHistoryWithSummarizer(messages: LLMMessage[]): Promise<LLMMessage[]> {
    this.writeTranscript(messages)

    // 增量更新结构化摘要
    const summary = await this.summarizer.update(messages)

    // 使用溢出压缩策略
    const compacted = this.summarizer.overflowCompact(messages, summary, this.config.maxContextTokens)
    return compacted
  }

  // 修改 compactHistory：作为 fallback
  private async compactHistory(messages: LLMMessage[]): Promise<LLMMessage[]> {
    this.writeTranscript(messages)
    // 尝试使用 IncrementalSummarizer
    try {
      const summary = await this.summarizer.update(messages)
      return this.summarizer.overflowCompact(messages, summary, this.config.maxContextTokens)
    } catch {
      // fallback 到旧逻辑
      const summary = await this.summarizeHistory(messages)
      return [{ role: "user" as const, content: `[Compacted]\n\n${summary}` }]
    }
  }

  // 新增：暴露 StructuredSummary 给外部（如 CheckpointProvider）
  getStructuredSummary(): StructuredSummary | null {
    return this.summarizer.getCurrentSummary()
  }
}
```

```typescript
// checkpoint-provider.ts — 可选：接收结构化摘要

// 新增方法
applyStructuredSummary(summary: StructuredSummary): void {
  if (!this.data) return
  this.data.summary = summary.objective
  this.data.intent = summary.objective
  this.data.activeTask = summary.nextMove
  this.data.currentWork = summary.workState
  this.data.recentDecisions = summary.details
  this.data.keyFiles = summary.files
  this.data.userPreferences = summary.constraints
  this.saveCheckpoint()
}
```

### 集成点

- `ContextManager` 构造函数创建 `IncrementalSummarizer` 实例
- `compactPipeline()` 的 L4 阶段委托给 `summarizer.update()`
- `CheckpointProvider` 可选接收 `StructuredSummary` 更新 checkpoint

### 向后兼容性保证

- `IncrementalSummarizer.overflowCompact()` 生成的 LLMMessage 格式与旧 `compactHistory` 兼容
- fallback 到旧摘要逻辑（LLM 不可用时）
- `ContextManager` 的公共 API 签名不变

### 预估工作量：1 人天

---

## 改进 5：Dream 知识注入 Context Sources

**当前问题**：`dream.ts` 生成的知识（`knowledge.json` + `graph.json`）存储在 `.mira/knowledge/` 但未注入 Agent 的系统提示。`prepareSourceManagerContext()` 只设置了 memory/code/goal/mode，没有 knowledge。

### 需要修改的文件清单

1. `session/context-source.ts` — 新增 `KnowledgeSource`
2. `agent/context.ts` — 修改 `createSourceManager()` 和 `prepareSourceManagerContext()`
3. `agent/agent.ts` — 修改 SourceManager 注册

### 核心代码变更

```typescript
// context-source.ts — 新增 KnowledgeSource

export type SourceKey = "base" | "env" | "memory" | "code" | "goal" | "mode" | "knowledge"

export class KnowledgeSource implements ContextSource {
  readonly key: SourceKey = "knowledge"
  readonly priority = 45  // 在 memory(40) 之后，code(50) 之前
  enabled = true

  private knowledgeContent = ""

  setKnowledgeContent(content: string): void {
    this.knowledgeContent = content
  }

  generate(_ctx: SourceContext): string {
    return this.knowledgeContent
  }

  fingerprint(_ctx: SourceContext): SourceFingerprint {
    return {
      hash: `knowledge-${this.knowledgeContent.length}-${this.knowledgeContent.slice(0, 100)}`,
      updatedAt: Date.now()
    }
  }
}
```

```typescript
// context.ts — 修改工厂函数

export function createSourceManager(workspace: string): {
  sourceManager: SourceManager
  sources: {
    base: BaseSource
    env: EnvSource
    mode: ModeSource
    memory: MemorySource
    code: CodeSource
    goal: GoalSource
    knowledge: KnowledgeSource  // 新增
  }
} {
  const sm = new SourceManager(workspace)
  const base = new BaseSource()
  const env = new EnvSource()
  const mode = new ModeSource()
  const memory = new MemorySource()
  const code = new CodeSource()
  const goal = new GoalSource()
  const knowledge = new KnowledgeSource()  // 新增

  sm.registerAll([base, env, mode, memory, knowledge, code, goal])

  return { sourceManager: sm, sources: { base, env, mode, memory, code, goal, knowledge } }
}

export async function prepareSourceManagerContext(
  sourceManager: SourceManager,
  sources: {
    memory: MemorySource
    code: CodeSource
    goal: GoalSource
    mode: ModeSource
    knowledge: KnowledgeSource  // 新增
  },
  config: AgentRunConfig,
  memoryPrompt?: string,
  goalPrompt?: string,
): Promise<void> {
  // ... 现有设置不变 ...

  // 新增：设置 Dream 知识内容
  if (config.workspace) {
    const knowledgeDir = join(config.workspace, ".mira", "knowledge")
    const knowledgePath = join(knowledgeDir, "knowledge.json")
    try {
      if (fs.existsSync(knowledgePath)) {
        const store = JSON.parse(fs.readFileSync(knowledgePath, "utf-8"))
        if (store.entries && store.entries.length > 0) {
          const recent = store.entries.slice(-10)
          const knowledgeText = `[Project Knowledge]\n${recent.map((e: any) => `- ${e.content}`).join("\n")}`
          sources.knowledge.setKnowledgeContent(knowledgeText)
        }
      }
    } catch { /* 静默 */ }
  }
}
```

```typescript
// agent.ts — 修改 prepareSourceManagerContext 调用

// 在 run() 方法中，修改 prepareSourceManagerContext 的 sources 参数
// 现有代码（agent.ts:363-369）中 sources 已包含 knowledge
// 因为 createSourceManager 返回值已更新

// 修改 agent.ts 的 sourceManagerSources 类型声明
private sourceManagerSources: {
  memory: import("../session/context-source").MemorySource
  code: import("../session/context-source").CodeSource
  goal: import("../session/context-source").GoalSource
  mode: import("../session/context-source").ModeSource
  knowledge: import("../session/context-source").KnowledgeSource  // 新增
} | null = null
```

### 集成点

- `createSourceManager()` 新增 `KnowledgeSource` 并注册
- `prepareSourceManagerContext()` 读取 `.mira/knowledge/knowledge.json` 并注入
- `agent.ts` 的 `sourceManagerSources` 类型声明更新

### 向后兼容性保证

- `KnowledgeSource` 的 key 是新增的，不影响现有 Source
- 无 knowledge 文件时 `generate()` 返回空字符串，不影响系统提示
- `SourceManager.build()` 按 priority 排序，新 Source 位置明确

### 预估工作量：0.5 人天

---

## 改进 6：Event Sourcing 接入

**当前问题**：`store.ts` 直接写 SQL 到 `messages` 表，`event-store.ts` 和 `projector.ts` 已创建但未接入。需要实现双写模式，逐步迁移到事件溯源。

### 需要修改的文件清单

1. `session/store.ts` — 核心修改：双写 + Projector 读取
2. `session/event-store.ts` — 无需修改（已完整）
3. `session/projector.ts` — 修复变量名 bug（中文变量名 `增量Events`）
4. `session/event-types.ts` — 无需修改（已完整）

### 核心代码变更

```typescript
// store.ts — 修改 appendMessage 和 loadSession

import { getEventStore } from "./event-store"
import { getProjector } from "./projector"
import { createMessageEvent } from "./event-types"

// 修改 appendMessage：双写模式
export async function appendMessage(sessionID: string, message: StoredMessage): Promise<void> {
  const db = await getDbAsync()

  const existing = db.exec("SELECT title FROM sessions WHERE session_id = ?", [sessionID])
  const isNew = existing.length === 0 || existing[0].values.length === 0

  if (isNew) {
    runWrite(
      "INSERT INTO sessions (session_id, project_id, title, workspace, created_at, updated_at) VALUES (?, '', ?, '', datetime('now'), datetime('now'))",
      [sessionID, `会话 ${new Date().toLocaleDateString("zh-CN")}`],
    )
    // 新增：记录 session.created 事件
    const eventStore = getEventStore()
    await eventStore.append({
      session_id: sessionID,
      type: "session.created",
      payload: { title: `会话 ${new Date().toLocaleDateString("zh-CN")}` },
      timestamp: new Date().toISOString(),
      version: 1,
    })
  }

  const isFirstUserMessage = message.role === "user" && message.content.trim()
    && Number(db.exec("SELECT COUNT(*) FROM messages WHERE session_id = ? AND role = 'user'", [sessionID])[0]?.values[0] || 0) === 0

  // 旧路径：直接写 messages 表（保持兼容）
  runWrite(
    "INSERT INTO messages (session_id, role, content, timestamp, tool_call_id, retry_count) VALUES (?, ?, ?, ?, ?, ?)",
    [sessionID, message.role, message.content, message.timestamp, message.toolCallId || null, message.retryCount || 0],
  )

  // 新增：写事件到 session_events 表（双写）
  try {
    const eventStore = getEventStore()
    await eventStore.append(createMessageEvent(sessionID, {
      role: message.role,
      content: message.content,
      toolCallId: message.toolCallId,
      retryCount: message.retryCount,
    }, message.timestamp))
  } catch { /* 事件写入失败不阻塞主流程 */ }

  runWrite("UPDATE sessions SET updated_at = ? WHERE session_id = ?", [new Date().toISOString(), sessionID])

  if (isFirstUserMessage) {
    const preview = message.content.trim().slice(0, 50)
    runWrite("UPDATE sessions SET title = ? WHERE session_id = ?", [preview, sessionID])
  }
}

// 修改 loadSession：优先通过 Projector 从事件重建
export async function loadSession(sessionID: string): Promise<StoredSession | null> {
  try {
    const db = await getDbAsync()
    const result = db.exec("SELECT session_id, title, created_at, updated_at, workspace FROM sessions WHERE session_id = ?", [sessionID])
    if (result.length === 0 || result[0].values.length === 0) return null

    const row = result[0].values[0]
    const [id, title, created, updated, workspace] = row as string[]

    // 新增：尝试通过 Projector 从事件重建
    try {
      const eventStore = getEventStore()
      const projector = getProjector()

      // 尝试从快照 + 增量事件重建
      const snapshot = await eventStore.getLatestSnapshot(sessionID)
      if (snapshot) {
        const events = await eventStore.getEvents(sessionID, snapshot.up_to_seq)
        const messages = projector.projectFromSnapshot(snapshot, events)
        return { id, title, created, updated, messages, workspace }
      }

      // 无快照：尝试全量回放
      const events = await eventStore.getEvents(sessionID)
      if (events.length > 0) {
        const messages = projector.replay(events)
        // 定期保存快照（每 100 条事件）
        if (events.length > 100) {
          const latestSeq = events[events.length - 1].seq
          await eventStore.saveSnapshot({
            session_id: sessionID,
            up_to_seq: latestSeq,
            messages_json: projector.serializeSnapshot(messages),
            metadata_json: JSON.stringify({ messageCount: messages.length }),
            created_at: new Date().toISOString(),
          })
        }
        return { id, title, created, updated, messages, workspace }
      }
    } catch { /* 事件回放失败，fallback 到旧路径 */ }

    // 旧路径：直接从 messages 表读取
    const msgResult = db.exec(
      "SELECT role, content, timestamp, tool_call_id FROM messages WHERE session_id = ? ORDER BY id ASC",
      [sessionID],
    )
    const messages: StoredMessage[] = msgResult.length > 0
      ? msgResult[0].values.map((r: any) => ({
          role: r[0] as StoredMessage["role"],
          content: r[1] as string,
          timestamp: r[2] as string,
          ...(r[3] ? { toolCallId: r[3] as string } : {}),
        }))
      : []

    return { id, title, created, updated, messages, workspace }
  } catch {
    return null
  }
}
```

```typescript
// projector.ts — 修复变量名 bug（第 89 行）
// 将中文变量名改为英文
projectFromSnapshot(
  snapshot: EventSnapshot,
  events: SessionEvent[],
): StoredMessage[] {
  const baseMessages: StoredMessage[] = JSON.parse(snapshot.messages_json)
  const incrementalEvents = events.filter(e => e.seq > snapshot.up_to_seq)
  return this.project(baseMessages, incrementalEvents)
}
```

### 集成点

- `store.ts:appendMessage()` 双写：旧 SQL + 新 EventStore
- `store.ts:loadSession()` 优先 Projector 回放，fallback 到旧 SQL
- `event-store.ts` 和 `projector.ts` 无需修改（projector 修复 bug）

### 向后兼容性保证

- **双写模式**：旧 `messages` 表写入不变，EventStore 写入是附加的
- EventStore 写入失败不影响主流程（try-catch）
- `loadSession()` 优先使用 Projector，失败时 fallback 到旧路径
- 不需要数据库迁移（`session_events` 和 `event_snapshots` 表已在 SCHEMA 中创建）
- 数据一致性：后续可添加一致性校验工具

### 预估工作量：2 人天

---

## 改进 7：RunCoordinator 接入

**当前问题**：`agent.ts:434-435` 使用简单的 `PendingInputQueue` 管理输入，不支持 Coalesced Wakeup 和 Interrupt+Restart。`run-coordinator.ts` 已创建但未接入。

### 需要修改的文件清单

1. `agent/agent.ts` — 核心修改：替换 PendingInputQueue

### 核心代码变更

```typescript
// agent.ts — 修改 run() 方法

import { RunCoordinator } from "./run-coordinator"
// 保留 PendingInputQueue 的 import（用于向后兼容 fallback）

export class Agent {
  // 新增
  private coordinator: RunCoordinator | null = null

  constructor(private registry: ToolRegistry, apiKey?: string, apiUrl?: string, workspace?: string) {
    // ... 现有初始化不变 ...
  }

  // 修改 run() 方法的外层循环
  async *run(
    userMessage: string,
    history: LLMMessage[],
    config: AgentConfig,
  ): AsyncGenerator<AgentEvent> {
    // ... 初始化部分不变（ctx, permissions, materialized, toolSet 等）...

    // 初始化 RunCoordinator（每个 run 调用创建新实例，避免跨 run 状态污染）
    const coordinator = new RunCoordinator()

    // 使用 Coordinator 管理输入
    // 将现有逻辑包装到 Coordinator 的 execute 回调中
    const executeInner = async function*(
      initialMessage: string,
      initialHistory: LLMMessage[],
      initialConfig: AgentConfig,
    ): AsyncGenerator<AgentEvent> {
      // 移除原有的 PendingInputQueue 外层循环
      // 直接执行单条输入的多轮推理

      const messages = [...initialHistory.map(/* ... 映射逻辑 ... */)]
      messages.push({ role: "user", content: enrichedUser })

      // 内层循环：单条输入的多轮推理-行动周期
      let step = 0
      let hasLastAssistant = false

      while (true) {
        step++

        // 第 1 步：分类上一步结果（不变）
        if (hasLastAssistant) {
          // ... classifyStep 逻辑不变 ...
        }

        // 第 2 步：回合前检查（不变）
        // ... stateMachine.aborted 检查 ...
        // ... contextManager.checkAndRebuild ...
        // ... pluginHooks ...

        // 第 3 步：执行 LLM 回合（不变）
        // ... runTurn / runMaxModeTurn ...

        // 第 4 步：处理 LLM 信号（不变）
        // ... signal 处理 ...

        // ── 持久化 Assistant 消息（不变）──
        // ── 回合后上下文检查（不变）──
        // ── 回合同步（不变）──

        hasLastAssistant = true
      }
    }

    // 通过 Coordinator 提交执行
    const requestId = coordinator.submit({
      userMessage,
      config,
      emit: (event: AgentEvent) => { /* 需要 yield 到外层 */ },
      execute: () => executeInner(userMessage, history, config),
    })

    // ... 其余逻辑 ...
  }

  // 新增：获取 Coordinator 状态（供 UI 使用）
  getCoordinator(): RunCoordinator | null {
    return this.coordinator
  }
}
```

### 关键设计决策

**简化方案**：由于 `Agent.run()` 是 `AsyncGenerator`，而 `RunCoordinator` 设计为 `EventEmitter` 模式，直接替换会导致大量重构。推荐**增量接入**：

1. **Phase 1（本次）**：仅在 `Agent` 构造函数中创建 `RunCoordinator`，暴露 `getCoordinator()` API 供外部使用
2. **Phase 2（后续）**：将 `PendingInputQueue` 替换为 `RunCoordinator` 的 Coalesced Wakeup 逻辑

```typescript
// agent.ts — 简化版接入

export class Agent {
  private coordinator = new RunCoordinator()

  // 保留 PendingInputQueue 用于内部循环
  // RunCoordinator 用于外部并发控制

  async *run(
    userMessage: string,
    history: LLMMessage[],
    config: AgentConfig,
  ): AsyncGenerator<AgentEvent> {
    // 使用 Coordinator 管理请求序列
    const requestId = coordinator.submit({
      userMessage,
      config,
      emit: () => {}, // placeholder
      execute: () => this.runInner(userMessage, history, config),
    })

    // 等待执行完成（简化版：直接执行）
    yield* this.runInner(userMessage, history, config)
  }

  // 将原有 run() 逻辑提取到 runInner()
  private async *runInner(
    userMessage: string,
    history: LLMMessage[],
    config: AgentConfig,
  ): AsyncGenerator<AgentEvent> {
    // ... 现有 run() 的全部逻辑 ...
    // 将 PendingInputQueue 替换为直接循环
  }
}
```

### 集成点

- `Agent` 构造函数创建 `RunCoordinator` 实例
- `run()` 方法内部仍使用 `PendingInputQueue`（保持稳定）
- `getCoordinator()` 暴露给外部（Electron IPC / UI）

### 向后兼容性保证

- `PendingInputQueue` 保留不变，作为内层循环的输入管理
- `RunCoordinator` 是附加层，不改变 `run()` 的外部行为
- `getCoordinator()` 是新增 API，不影响现有调用

### 预估工作量：1.5 人天

---

## 改进 8：Todo 系统

**当前问题**：Mira 无 Todo 功能。需要数据库迁移、工具实现、与 Goal 系统联动。

### 需要修改的文件清单

1. `system/database.ts` — 数据库迁移：`todos` 表
2. `tools/core/todo-tool.ts` — 新建：Todo CRUD 工具
3. `system/registry-init.ts` — 注册 Todo 工具
4. `orchestrate/goal-judge.ts` — 可选联动

### 核心代码变更

```typescript
// database.ts — SCHEMA 末尾添加

  -- Todo 系统
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | done | cancelled
    priority INTEGER DEFAULT 0,  -- 0=low, 1=medium, 2=high
    parent_id INTEGER,  -- 支持子任务
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id),
    FOREIGN KEY (parent_id) REFERENCES todos(id)
  );
  CREATE INDEX IF NOT EXISTS idx_todos_session ON todos(session_id, status);
  CREATE INDEX IF NOT EXISTS idx_todos_parent ON todos(parent_id);
```

```typescript
// tools/core/todo-tool.ts — 新建

import { ToolDef, ToolContext, ToolResult } from "../../shared/tool"
import { getDbAsync, runWrite } from "../../system/database"
import { z } from "zod"

export const todoTool: ToolDef = {
  name: "todo",
  description: "Manage task todos. Use to create, update, list, or complete tasks within the current session.",
  permission: "write",
  inputSchema: z.object({
    action: z.enum(["create", "update", "list", "complete", "delete"]).describe("Action to perform"),
    id: z.number().optional().describe("Todo ID (for update/complete/delete)"),
    title: z.string().optional().describe("Todo title (for create)"),
    description: z.string().optional().describe("Todo description (for create/update)"),
    status: z.enum(["pending", "in_progress", "done", "cancelled"]).optional().describe("New status (for update)"),
    priority: z.number().min(0).max(2).optional().describe("Priority: 0=low, 1=medium, 2=high"),
    parent_id: z.number().optional().describe("Parent todo ID for subtasks (for create)"),
  }),
  async execute(args: any, ctx: ToolContext): Promise<ToolResult> {
    const db = await getDbAsync()
    const { action, id, title, description, status, priority, parent_id } = args

    switch (action) {
      case "create": {
        if (!title) return { success: false, error: "title is required" }
        runWrite(
          "INSERT INTO todos (session_id, title, description, priority, parent_id) VALUES (?, ?, ?, ?, ?)",
          [ctx.sessionID, title, description || "", priority ?? 0, parent_id || null],
        )
        const result = db.exec("SELECT last_insert_rowid()")
        const newId = result[0]?.values[0]?.[0]
        return { success: true, output: `Created todo #${newId}: ${title}` }
      }

      case "update": {
        if (!id) return { success: false, error: "id is required" }
        const updates: string[] = []
        const params: any[] = []
        if (title !== undefined) { updates.push("title = ?"); params.push(title) }
        if (description !== undefined) { updates.push("description = ?"); params.push(description) }
        if (status !== undefined) {
          updates.push("status = ?"); params.push(status)
          if (status === "done") updates.push("completed_at = datetime('now')")
        }
        if (priority !== undefined) { updates.push("priority = ?"); params.push(priority) }
        updates.push("updated_at = datetime('now')")
        params.push(id, ctx.sessionID)
        runWrite(`UPDATE todos SET ${updates.join(", ")} WHERE id = ? AND session_id = ?`, params)
        return { success: true, output: `Updated todo #${id}` }
      }

      case "list": {
        const rows = db.exec(
          "SELECT id, title, description, status, priority, parent_id, created_at, completed_at FROM todos WHERE session_id = ? ORDER BY priority DESC, id ASC",
          [ctx.sessionID],
        )
        if (rows.length === 0) return { success: true, output: "No todos" }
        const lines = rows[0].values.map(r => {
          const statusIcon = r[3] === "done" ? "[x]" : r[3] === "in_progress" ? "[>]" : "[ ]"
          const priorityIcon = r[4] === 2 ? " (!)" : r[4] === 1 ? " (*)" : ""
          const parent = r[5] ? ` (sub of #${r[5]})` : ""
          return `${statusIcon} #${r[0]}${priorityIcon}${parent}: ${r[1]}${r[2] ? ` - ${r[2]}` : ""}`
        })
        return { success: true, output: lines.join("\n") }
      }

      case "complete": {
        if (!id) return { success: false, error: "id is required" }
        runWrite(
          "UPDATE todos SET status = 'done', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND session_id = ?",
          [id, ctx.sessionID],
        )
        // 自动完成子任务
        runWrite(
          "UPDATE todos SET status = 'done', completed_at = datetime('now'), updated_at = datetime('now') WHERE parent_id = ? AND session_id = ? AND status != 'done'",
          [id, ctx.sessionID],
        )
        return { success: true, output: `Completed todo #${id} (and subtasks)` }
      }

      case "delete": {
        if (!id) return { success: false, error: "id is required" }
        // 删除子任务
        runWrite("DELETE FROM todos WHERE parent_id = ? AND session_id = ?", [id, ctx.sessionID])
        runWrite("DELETE FROM todos WHERE id = ? AND session_id = ?", [id, ctx.sessionID])
        return { success: true, output: `Deleted todo #${id} (and subtasks)` }
      }

      default:
        return { success: false, error: `Unknown action: ${action}` }
    }
  },
}
```

```typescript
// registry-init.ts — 注册 Todo 工具

import { todoTool } from "../tools/core/todo-tool"

export function initTools(registry: ToolRegistry): void {
  // ... 现有注册逻辑 ...
  registry.register(todoTool)
}
```

```typescript
// goal-judge.ts — 可选联动

// 在 GoalJudge.evaluate() 中，检查所有 todo 是否完成
// 如果所有 todo 都 done，提示 goal 可能已满足
async evaluate(goal: Goal, messages: LLMMessage[]): Promise<{ satisfied: boolean; reasoning: string }> {
  // ... 现有逻辑 ...

  // 新增：检查 todo 完成度
  try {
    const db = await getDbAsync()
    const result = db.exec(
      "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done FROM todos WHERE session_id = ?",
      [goal.sessionId],
    )
    if (result.length > 0) {
      const [total, done] = result[0].values[0] as [number, number]
      if (total > 0 && done === total) {
        return { satisfied: true, reasoning: `All ${total} todos completed` }
      }
    }
  } catch { /* todo 查询失败不影响 goal 判断 */ }

  // ... 现有逻辑 ...
}
```

### 集成点

- `database.ts` SCHEMA 添加 `todos` 表
- `registry-init.ts` 注册 `todoTool`
- `goal-judge.ts` 可选读取 todos 辅助判断

### 向后兼容性保证

- `todos` 表是新增的，不影响现有表
- Todo 工具是新增的，不影响现有工具
- Goal Judge 联动是可选的，todo 查询失败不影响 goal 判断
- 数据库迁移使用 `CREATE TABLE IF NOT EXISTS`，自动兼容旧库

### 预估工作量：2 人天

---

## 改进 9：集成测试 + 回归验证

**验证范围**：所有 8 项改进的集成正确性

### 测试清单

| 测试项 | 对应改进 | 测试方法 |
|--------|---------|---------|
| 快照持久化 | #1 | 创建快照 → 重启 → 验证快照存在 |
| FTS 搜索 | #2 | 写入消息 → 搜索 → 验证结果 |
| Scoped Registry | #3 | 创建 Scope → 注册工具 → 验证 resolve |
| Structured Summary | #4 | 多轮对话 → 触发压缩 → 验证结构化 |
| Dream 知识注入 | #5 | 执行 Dream → 检查系统提示包含知识 |
| Event Sourcing | #6 | 追加消息 → 读取 → 验证 Projector 重建 |
| RunCoordinator | #7 | 并发提交 → 验证 Coalescing |
| Todo 系统 | #8 | CRUD → 验证数据库 + Goal 联动 |

### 向后兼容性验证

1. 空数据库启动 → 所有表自动创建
2. 旧版数据库升级 → FTS 表自动创建
3. 无 `.mira/knowledge/` 目录 → Dream Source 返回空字符串
4. 无 `session_events` 数据 → `loadSession()` fallback 到 messages 表
5. 无 Scope 注册 → `ScopedToolRegistry.resolve()` 返回空 → fallback

### 预估工作量：1 人天

---

## 实施顺序图

```
Phase 1: 简单新功能（无依赖）
  ├── 改进 1: 快照持久化 (0.5d)
  ├── 改进 2: FTS5 搜索 (1d)
  └── 改进 5: Dream 知识注入 (0.5d)

Phase 2: 接入已有模块（无依赖）
  ├── 改进 3: ScopedToolRegistry 接入 (0.5d)
  └── 改进 4: Structured Summary 接入 (1d)

Phase 3: 复杂接入 + 新建
  ├── 改进 6: Event Sourcing 接入 (2d)
  ├── 改进 7: RunCoordinator 接入 (1.5d)
  └── 改进 8: Todo 系统 (2d)

Phase 4: 验证
  └── 改进 9: 集成测试 (1d)
```

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Event Sourcing 双写数据不一致 | 中 | 定期一致性校验工具 + fallback 到 messages 表 |
| FTS5 在 sql.js WASM 中不可用 | 低 | 已有 LIKE 回退机制 |
| RunCoordinator 重构影响 Agent 循环 | 高 | Phase 1 仅暴露 API，不替换 PendingInputQueue |
| Todo 表迁移影响旧数据库 | 低 | `CREATE TABLE IF NOT EXISTS` 自动兼容 |
| Structured Summary LLM 摘要质量差 | 低 | fallback 到旧摘要逻辑 |
