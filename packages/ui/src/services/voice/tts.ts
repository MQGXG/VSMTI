/**
 * TTS 引擎 — 多提供商语音合成
 *
 * - WebSpeech：浏览器系统语音（现有 WebSpeechSynthesisAdapter 的简化封装）
 * - Local：transformers.js 本地推理（Kokoro/VITS），离线、数据不出本机
 *
 * 通过 createTTSEngine(type) 工厂创建，UI 不感知具体实现。
 */

import type { TTSEngine, TTSType } from "./types"
import { playFloat32 } from "./audio-utils"
import { loadTTSPipeline } from "./transformers-loader"

// ── WebSpeech 实现 ─────────────────────────────────────

function createWebSpeechEngine(): TTSEngine {
  let current: SpeechSynthesisUtterance | null = null

  return {
    type: "webspeech",
    isAvailable: () => typeof window !== "undefined" && "speechSynthesis" in window,
    speak(text, options) {
      return new Promise<void>((resolve) => {
        if (!text.trim()) { resolve(); return }
        const synth = window.speechSynthesis
        synth.cancel()
        const utter = new SpeechSynthesisUtterance(text)
        utter.lang = "zh-CN"
        current = utter
        options?.onStart?.()
        utter.onend = () => { current = null; options?.onEnd?.(); resolve() }
        utter.onerror = () => { current = null; options?.onEnd?.(); resolve() }
        synth.speak(utter)
      })
    },
    stop() {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel()
      }
      current = null
    },
  }
}

// ── 本地（transformers.js）实现 ────────────────────────

/** transformers.js 的 pipeline 动态导入类型（避免顶层 import 拖慢启动） */
type LocalTTS = {
  textToSpeech: (text: string, options?: { speaker_id?: number }) => Promise<{ audio: Float32Array; sampling_rate: number }>
}

const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX"

function createLocalEngine(): TTSEngine {
  let ctx: AudioContext | null = null
  let pipelinePromise: Promise<LocalTTS> | null = null
  let activeSource: AudioBufferSourceNode | null = null

  function ensureAudioContext(): AudioContext {
    if (!ctx) ctx = new AudioContext()
    return ctx
  }

  async function loadPipeline(): Promise<LocalTTS> {
    if (!pipelinePromise) {
      pipelinePromise = loadTTSPipeline(KOKORO_MODEL).then((p) => ({
        textToSpeech: async (t: string, o?: { speaker_id?: number }) => {
          const out = await p(t, o)
          if (!out) throw new Error("TTS 返回空")
          return { audio: out.audio, sampling_rate: out.sampling_rate }
        },
      }))
    }
    return pipelinePromise
  }

  return {
    type: "local",
    isAvailable: () => typeof window !== "undefined" && "AudioContext" in window,
    async speak(text, options) {
      if (!text.trim()) return
      try {
        const tts = await loadPipeline()
        const out = await tts.textToSpeech(text)
        const ac = ensureAudioContext()
        const { node, promise } = playFloat32(ac, out.audio, out.sampling_rate)
        activeSource = node
        options?.onStart?.()
        await promise
        options?.onEnd?.()
      } catch (err) {
        console.error("[voice] 本地 TTS 失败，回退 WebSpeech:", err)
        options?.onEnd?.()
        const fallback = createWebSpeechEngine()
        await fallback.speak(text, options)
      }
    },
    stop() {
      activeSource?.stop()
      activeSource = null
    },
  }
}

// ── 工厂 ───────────────────────────────────────────────

export function createTTSEngine(type: TTSType): TTSEngine {
  return type === "local" ? createLocalEngine() : createWebSpeechEngine()
}

/** 默认 TTS 引擎：优先本地，回退 WebSpeech */
export function createDefaultTTSEngine(): TTSEngine {
  return createTTSEngine("webspeech")
}
