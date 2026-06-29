# 测试指南

## 测试框架

项目使用 **Vitest** 作为测试框架，测试文件位于各包的 `__tests__/` 目录。

## 运行测试

```powershell
# 运行所有测试
pnpm test

# 监视模式（开发时使用）
pnpm test:ui

# TypeScript 类型检查
pnpm typecheck
```

## 测试文件结构

```
packages/
├── core/src/__tests__/           # 核心逻辑测试
│   ├── agent.test.ts             # Agent 循环测试
│   ├── tool.test.ts              # 工具系统测试
│   ├── llm-sdk.test.ts           # LLM SDK 测试
│   ├── permission.test.ts        # 权限系统测试
│   ├── memory.test.ts            # 记忆系统测试
│   └── ...
├── ui/src/chat/__tests__/        # UI 组件测试
│   └── tool-router.test.ts       # 工具路由测试
└── electron/src/__tests__/       # Electron 测试
```

## 编写测试

### 单元测试

测试文件放在 `__tests__/` 目录下，文件名以 `.test.ts` 结尾：

```typescript
import { describe, it, expect } from 'vitest'
import { myFunction } from '../my-module'

describe('myFunction', () => {
  it('should do something', () => {
    const result = myFunction('input')
    expect(result).toBe('expected')
  })

  it('should handle edge cases', () => {
    expect(() => myFunction('')).toThrow()
  })
})
```

### Mock

```typescript
import { vi, describe, it, expect } from 'vitest'

// Mock 模块
vi.mock('../external-module', () => ({
  externalFunction: vi.fn().mockResolvedValue('mocked')
}))

// Mock 函数
const mockCallback = vi.fn()

// Spy
const spy = vi.spyOn(object, 'method')
```

### 集成测试

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { Agent } from '../agent'
import { ToolRegistry } from '../registry'

describe('Agent Integration', () => {
  let agent: Agent
  let registry: ToolRegistry

  beforeEach(() => {
    registry = new ToolRegistry()
    // 注册测试工具
    agent = new Agent({ registry, ... })
  })

  it('should execute tool calls', async () => {
    // 测试 Agent 执行流程
  })
})
```

## 测试类型

### 冒烟测试

验证基本功能可用：

```typescript
describe('Smoke Tests', () => {
  it('should initialize agent', () => {
    expect(agent).toBeDefined()
  })

  it('should have all tools registered', () => {
    expect(registry.getAll().length).toBeGreaterThan(0)
  })
})
```

### 单元测试

测试单个函数/类的行为：

```typescript
describe('PermissionSet', () => {
  it('should match wildcard patterns', () => {
    const permissions = new PermissionSet([
      { action: 'bash', resource: 'ls *', effect: 'allow' }
    ])
    expect(permissions.evaluate('bash', 'ls -la')).toBe('allow')
  })
})
```

### 集成测试

测试模块间交互：

```typescript
describe('Agent + LLM', () => {
  it('should stream responses', async () => {
    const events = []
    for await (const event of agent.run({ messages: [...] })) {
      events.push(event)
    }
    expect(events.some(e => e.type === 'content')).toBe(true)
  })
})
```

## 覆盖率

```bash
# 生成覆盖率报告
pnpm test -- --coverage

# 查看 HTML 报告
open coverage/index.html
```

## 性能测试

```typescript
describe('Performance', () => {
  it('should process messages within budget', async () => {
    const start = Date.now()
    await agent.run({ messages: [...] })
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(5000) // 5 秒内完成
  })
})
```

## CI/CD

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: pnpm install
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```
