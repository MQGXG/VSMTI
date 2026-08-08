import { describe, it, expect, vi, beforeEach } from "vitest"

// ── 全局 stub 必须在模块加载前建立 ───────────────────────
const loadTTSPipelineMock = vi.hoisted(() => vi.fn())

vi.stubGlobal("AudioContext", class {
  destination: unknown = {}
  createBuffer() { return { copyToChannel: () => {} } }
  createBufferSource() { return { connect: () => {}, start: () => {}, end: null } }
})

const utteranceEndHandlers: Array<() => void> = []
vi.stubGlobal("SpeechSynthesisUtterance", class {
  lang = ""; rate = 1; pitch = 1; onend: (() => void) | null = null
  constructor() { onEndHandlers.push(this) }
})
const onEndHandlers: Array<{ onend: (() => void) | null }> = []

vi.stubGlobal("speechSynthesis", {
  speak(u: { onend?: () => void }) { u.onend?.() },
  cancel: vi.fn(),
})
;(globalThis as any).window = {
  speechSynthesis: (globalThis as any).speechSynthesis,
  AudioContext: (globalThis as any).AudioContext,
}

vi.mock("../transformers-loader", () => ({
  loadTTSPipeline: (...a: unknown[]) => loadTTSPipelineMock(...a),
}))

// ⚠ playFloat32 依赖真实 AudioBufferSourceNode 事件；此处 mock 成"立即结束"
vi.mock("../audio-utils", () => ({
  playFloat32: () => ({
    node: { stop: () => {}, connect: () => {}, start: () => {} },
    promise: Promise.resolve(),
  }),
  float32ToAudioBuffer: () => ({}),
}))

import { createTTSEngine, createLocalEngine, createWebSpeechEngine, createDefaultTTSEngine } from "../tts"

beforeEach(() => {
  loadTTSPipelineMock.mockReset()
})

describe("TTS 引擎门面", () => {
  it("createTTSEngine('webspeech') 返回 webspeech 引擎", () => {
    expect(createTTSEngine("webspeech").type).toBe("webspeech")
  })

  it("createTTSEngine('local') 返回 local 引擎", () => {
    expect(createTTSEngine("local").type).toBe("local")
  })

  it("createLocalEngine 类型为 local", () => {
    expect(createLocalEngine().type).toBe("local")
  })

  it("createWebSpeechEngine 类型为 webspeech", () => {
    expect(createWebSpeechEngine().type).toBe("webspeech")
  })

  it("createDefaultTTSEngine 在 window.AudioContext 存在时优先 local", () => {
    expect(createDefaultTTSEngine().type).toBe("local")
  })

  it("本地 TTS 合成成功时走 playFloat32 并触发 onStart/onEnd 一次", async () => {
    loadTTSPipelineMock.mockResolvedValue(
      vi.fn(async () => ({ audio: new Float32Array(8), sampling_rate: 24000 })),
    )
    const engine = createLocalEngine()
    const onStart = vi.fn()
    const onEnd = vi.fn()
    await engine.speak("你好", { onStart, onEnd })
    expect(loadTTSPipelineMock).toHaveBeenCalled()
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it("本地合成失败（加载前）→ 整段回退 WebSpeech，onStart/onEnd 各一次", async () => {
    loadTTSPipelineMock.mockRejectedValue(new Error("模型加载失败"))
    const engine = createLocalEngine()
    const onStart = vi.fn()
    const onEnd = vi.fn()
    await engine.speak("测试", { onStart, onEnd })
    expect(onStart).toHaveBeenCalledTimes(1) // 由 WebSpeech 触发
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it("stop() 不抛异常", () => {
    const engine = createLocalEngine()
    expect(() => engine.stop()).not.toThrow()
  })
})