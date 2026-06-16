# learn-claude-code 课程与 Mira 实现对照

## 对照表

| 课程 | 机制 | Mira 实现 | 状态 |
|------|------|---------------|------|
| **s01** | Agent Loop | `app/core/agent.py` — `Agent.run()` 循环 | ✅ 已增强 |
| **s02** | Tool Use | `app/tools/registry.py` — `TOOL_HANDLERS` 分发 | ✅ 已完成 |
| **s03** | Permission | `app/core/permission.py` — 三道闸门 + `app/core/permission_store.py` 交互审批 | ✅ 已完成 |
| **s04** | Hooks | `app/core/hooks.py` — 4 事件点 + `app/core/hooks_setup.py` | ✅ 已完成 |
| **s05** | TodoWrite | `app/tools/todo_write.py` — todo_write 工具 + 3 轮提醒 | ✅ 已完成 |
| **s06** | Subagent | `app/tools/task_tool.py` — TaskTool + fresh messages[] | ✅ 已完成 |
| **s07** | Skill Loading | `app/core/skill_manager.py` + `app/tools/skill_tool.py` — 两级注入 | ✅ 已完成 |
| **s08** | Context Compact | `app/core/compaction.py` — budget→snip→micro→auto 4 层 | ✅ 已完成 |
| **s09** | Memory | `app/core/memory_manager.py` — .memory/ + 提取 + 整理 | ✅ 已完成 |
| **s10** | System Prompt | `app/core/prompt_builder.py` — 分节拼接 + 缓存 | ✅ 已完成 |
| **s11** | Error Recovery | `app/core/agent.py` — 重试 2 次 + max_tokens 支持 | ⚠️ 基础版 |
| **s12** | Task System | `app/core/task_system.py` + 5 个工具 — DAG + 文件持久化 | ✅ 已完成 |
| **s13** | Background Tasks | `app/core/background.py` — daemon 线程 + 结果收集 | ✅ 已完成 |
| **s14** | Cron Scheduler | `app/core/cron_scheduler.py` + 3 个工具 — 独立线程 + 持久化 | ✅ 已完成 |
| **s15** | Agent Teams | `app/core/team_bus.py` — MessageBus 文件收件箱 | ✅ 已完成 |
| **s16** | Team Protocols | `app/core/team_bus.py` — ProtocolState + 关机/计划审批 | ✅ 已完成 |
| **s17** | Autonomous Agents | 框架搭建完成，队友线程需要实际 spawn 逻辑 | ⚠️ 基础版 |
| **s18** | Worktree Isolation | ❌ 未实现 | ❌ |
| **s19** | MCP Plugin | ❌ 未实现 | ❌ (你要求跳过) |
| **s20** | Comprehensive | 全部机制已集成到 Agent.run() 循环 | ✅ 已完成 |

## 实现深度评估

### 完整实现 (✅) — 13 项
s01·s02·s03·s04·s05·s06·s07·s08·s09·s10·s12·s13·s14

### 基础实现 (⚠️) — 2 项
- **s11 Error Recovery**: 仅有 2 次重试 + 简单错误捕获，缺少 529 fallback 模型切换、max_tokens 自动升级、reactive compact
- **s17 Autonomous Agents**: MessageBus 和协议框架已搭建，缺少实际的队友 daemon 线程（`spawn_teammate` 工具已注册，但队友循环未实现）

### 未实现 (❌) — 2 项
- **s18 Worktree Isolation**: git worktree 隔离
- **s19 MCP Plugin**: 外部工具协议（你要求跳过）

## 建议下一步

| 优先级 | 改进项 | 工作量 |
|--------|--------|--------|
| 高 | s17 队友实际线程循环 | 1 天 |
| 中 | s11 完整错误恢复 (529/fallback/reactive) | 0.5 天 |
| 低 | s18 Worktree 隔离 | 2 天 |
