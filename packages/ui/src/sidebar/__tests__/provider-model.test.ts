import { describe, it, expect } from "vitest"
import {
  isVisionType,
  isVisionModel,
  validateImages,
  MAX_IMAGE_COUNT,
  MAX_IMAGE_BYTES,
  imageDataSize,
} from "../../sidebar/provider-model"

const DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

describe("isVisionType", () => {
  it("返回 true for vision/multimodal", () => {
    expect(isVisionType("vision")).toBe(true)
    expect(isVisionType("multimodal")).toBe(true)
  })

  it("返回 false for text/voice/undefined/自定义类型", () => {
    expect(isVisionType("text")).toBe(false)
    expect(isVisionType("voice")).toBe(false)
    expect(isVisionType(undefined)).toBe(false)
    // 自定义类型不参与直发判定（安全走桥）
    expect(isVisionType("video")).toBe(false)
    expect(isVisionType("agent")).toBe(false)
  })
})

describe("isVisionModel", () => {
  it("内置白名单命中优先（即使 type 被历史数据标记为 text）", () => {
    expect(isVisionModel("openai", "gpt-4o", "text")).toBe(true)
    expect(isVisionModel("openai", "gpt-4o")).toBe(true)
    expect(isVisionModel("anthropic", "claude-sonnet-4-20250514", "text")).toBe(true)
    expect(isVisionModel("gemini", "gemini-2.0-flash")).toBe(true)
  })

  it("内置白名单未命中 → 用户声明的 type 决定", () => {
    expect(isVisionModel("custom", "glm-4.6v", "vision")).toBe(true)
    expect(isVisionModel("custom", "glm-4.6v", "multimodal")).toBe(true)
    expect(isVisionModel("custom", "glm-4.6v", "text")).toBe(false)
    expect(isVisionModel("custom", "glm-4.6v", "voice")).toBe(false)
    expect(isVisionModel("custom", "glm-4.6v", undefined)).toBe(false)
  })

  it("内置白名单外的内置模型按 type 判断", () => {
    expect(isVisionModel("openai", "gpt-4o-mini")).toBe(false)
    expect(isVisionModel("openai", "gpt-4o-mini", "text")).toBe(false)
    expect(isVisionModel("openai", "gpt-4o-mini", "vision")).toBe(true)
  })

  it("自定义类型安全兜底（走视觉桥，不误判直发）", () => {
    expect(isVisionModel("custom", "my-model", "video")).toBe(false)
    expect(isVisionModel("custom", "my-model", "agent")).toBe(false)
    // 空 type：内置走白名单，自定义走桥
    expect(isVisionModel("openai", "gpt-4o", undefined)).toBe(true)
    expect(isVisionModel("custom", "my-model", undefined)).toBe(false)
  })

  it("未知 provider/model 返回 false", () => {
    expect(isVisionModel("unknown", "whatever")).toBe(false)
  })
})

describe("validateImages", () => {
  it("空数组通过", () => {
    expect(validateImages([])).toEqual({ ok: true })
  })

  it("拒绝超过数量上限", () => {
    const many = Array(MAX_IMAGE_COUNT + 1).fill(DATA_URL)
    const result = validateImages(many)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain(String(MAX_IMAGE_COUNT))
  })

  it("拒绝非白名单格式", () => {
    expect(validateImages(["data:image/svg+xml;base64,PHN2Zz4="]).ok).toBe(false)
    expect(validateImages(["https://example.com/a.png"]).ok).toBe(false)
  })

  it("拒绝超过大小上限", () => {
    const big = `data:image/png;base64,${"A".repeat(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 100)}`
    const result = validateImages([big])
    expect(result.ok).toBe(false)
    expect(result.reason).toContain("4MB")
  })

  it("合法图片通过", () => {
    expect(validateImages([DATA_URL]).ok).toBe(true)
  })
})

describe("imageDataSize", () => {
  it("计算 base64 解码后的字节数", () => {
    const b64 = "iVBORw0KGgo="
    const url = `data:image/png;base64,${b64}`
    expect(imageDataSize(url)).toBe(Math.floor((b64.length * 3) / 4))
  })
})
