import { describe, expect, test } from 'vitest'
import { calculateCost, getModelPricing, formatCost, formatTokens } from '../shared/cost'

describe('calculateCost', () => {
  test('无缓存时按全量 input 计价', () => {
    const usage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 }
    const pricing = { inputPer1K: 0.001, outputPer1K: 0.002 }
    const r = calculateCost(usage, pricing)
    // input 1000*0.001/1000 + output 500*0.002/1000
    expect(r.cost).toBeCloseTo(0.001 + 0.001, 6)
  })

  test('缓存命中时 input 扣除缓存部分计价', () => {
    const usage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500, cacheReadTokens: 900 }
    const pricing = { inputPer1K: 0.001, outputPer1K: 0.002, cacheReadPer1K: 0.0001 }
    const r = calculateCost(usage, pricing)
    // freshInput 100 (1000-900) * 0.001/1000 + cache 900*0.0001/1000 + output
    expect(r.cost).toBeCloseTo(0.0001 + 0.00009 + 0.001, 6)
  })

  test('负数 token 安全处理为 0', () => {
    const r = calculateCost({ promptTokens: -5, completionTokens: 0, totalTokens: 0 }, { inputPer1K: 0.001, outputPer1K: 0.002 })
    expect(r.inputTokens).toBe(0)
    expect(r.cost).toBeGreaterThanOrEqual(0)
  })
})

describe('getModelPricing', () => {
  test('已知模型返回精确定价', () => {
    expect(getModelPricing('deepseek-chat').inputPer1K).toBe(0.00027)
    expect(getModelPricing('gpt-4o').outputPer1K).toBe(0.01)
  })

  test('未知模型用保守估算兜底', () => {
    const p = getModelPricing('unknown-model-xyz')
    expect(p.inputPer1K).toBe(0.001)
    expect(p.outputPer1K).toBe(0.004)
  })
})

describe('formatCost', () => {
  test('小额成本保留 4 位小数', () => {
    expect(formatCost(0.0006)).toContain('0.0006')
  })

  test('正常成本保留 2 位小数', () => {
    expect(formatCost(1.2345)).toContain('1.23')
  })
})

describe('formatTokens', () => {
  test('千分位格式化', () => {
    expect(formatTokens(1486)).toBe('1,486')
    expect(formatTokens(1200000)).toBe('1,200,000')
  })
})
