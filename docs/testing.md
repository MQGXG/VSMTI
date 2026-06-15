# 测试指南

## 测试框架

项目使用 **Vitest** 作为测试框架，测试文件位于 `electron/agent-core/__tests__/`。

## 运行测试

```powershell
# 运行所有测试
npm test

# 监视模式（开发时使用）
npm run test:ui

# TypeScript 类型检查
npm run typecheck
```

## 测试文件结构

```
electron/agent-core/__tests__/
├── setup.ts                  # 测试环境配置（Mock）
├── smoke.test.ts             # 冒烟测试
├── agent.test.ts             # Agent ReAct 循环测试
├── tool.test.ts              # 工具系统测试
├── llm-sdk.test.ts           # LLM SDK 测试
├── message-utils.test.ts     # 消息工具测试
├── permission-loop.test.ts   # 权限循环测试
└── benchmark.test.ts         # 性能基准测试
```

## 编写测试

### 单元测试

测试文件放在 `__tests__/` 目录下，文件名以 `.test.ts` 结尾：

```typescript
import { describe, it, expect } from "vitest";
import { myFunction } from "../my-module";

describe("myFunction", () => {
  it("should return expected result", () => {
    expect(myFunction("input")).toBe("output");
  });
});
```

### Mock 策略

- LLM 调用使用 `vi.mock` 模拟 API 响应
- 文件系统操作使用临时目录
- 网络请求使用 `fetch-mock` 或拦截

### 测试覆盖范围

| 模块 | 测试重点 |
|------|----------|
| agent.ts | ReAct 循环、事件发射、工具调用链 |
| tool.ts | 工具定义、参数验证、结果格式化 |
| registry.ts | 注册、查询、权限过滤、物化 |
| llm-sdk.ts | 请求构建、响应解析、错误处理 |
| message-utils.ts | 消息截断、格式修复 |
| permission.ts | 权限检查、自动授权、持久化 |

## CI 集成

计划接入 GitHub Actions，在 PR 时自动运行：

```yaml
# .github/workflows/test.yml
- run: npm ci
- run: npm run typecheck
- run: npm test
- run: npm run build
```
