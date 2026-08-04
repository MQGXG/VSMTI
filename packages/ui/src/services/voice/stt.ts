/**
 * STT 引擎 — 语音识别
 *
 * - local：transformers.js 本地 Whisper（离线、跨平台、数据不出本机）
 * - webspeech：浏览器 Web Speech API（云端，降级用）
 *
 * 通过 createSTTEngine(type) 工厂创建。识别采用"按住说话"边界（start 开始录，
 * stop 停止并识别），比 VAD 自动更可靠；实时对话在 realtime-voice.ts 里用 VAD 编排。
 */

import type { STTEngine, STTType } from "./types"
import { recordChunk, mergeChunks } from "./audio-utils"
import { loadASRPipeline } from "./transformers-loader"

export const WHISPER_MODEL = "onnx-community/whisper-base"

// ── 本地（transformers.js Whisper）实现 ─────────────────

function createLocalEngine(): STTEngine {
  let ctx: AudioContext | null = null
  let stream: MediaStream | null = null
  let recorder: { stop: () => void } | null = null
  let chunks: Float32Array[] = []
  let resolving = false
  let onResultCb: ((text: string) => void) | null = null
  let onErrorCb: ((err: string) => void) | null = null

  let transcribeFn: ((audio: Float32Array) => Promise<string>) | null = null

  async function ensureTranscriber(): Promise<void> {
    if (transcribeFn) return
    const p = await loadASRPipeline(WHISPER_MODEL)
    transcribeFn = async (a: Float32Array) => {
      const out = await p(a, { return_timestamps: false })
      const first = Array.isArray(out) ? out[0] : out
      return first?.text ?? ""
    }
  }

  return {
    type: "local",
    isAvailable: () => typeof navigator !== "undefined" && !!navigator.mediaDevices,
    start(options: { onResult: (text: string) => void; onError?: (err: string) => void; onEnd?: () => void }) {
      onResultCb = options.onResult
      onErrorCb = options.onError || null

      // 预加载 Whisper 模型（可选：让首次识别的等待发生在录音期间）
      ensureTranscriber().catch(() => { /* 静默：失败时在识别阶段报错 */ })

      navigator.mediaDevices.getUserMedia({ audio: true }).then((ms) => {
        if (resolving) { ms.getTracks().forEach((t) => t.stop()); return }
        stream = ms
        if (!ctx) ctx = new AudioContext()
        chunks = []
        recorder = recordChunk(ctx, ms, 16000, (c) => { if (!resolving) chunks.push(c) })
      }).catch((err: unknown) => {
        onErrorCb?.(err instanceof Error ? err.message : String(err))
      })
    },
    async stop() {
      if (resolving) return
      resolving = true
      recorder?.stop()
      stream?.getTracks().forEach((t) => t.stop())
      recorder = null
      stream = null

      try {
        const audio = mergeChunks(chunks, 16000)
        if (audio.length < 1600) { resolving = false; return }
        await ensureTranscriber()
        if (transcribeFn) {
          const text = await transcribeFn(audio)
          if (text) onResultCb?.(text)
        }
      } catch (err) {
        onErrorCb?.(err instanceof Error ? err.message : String(err))
      } finally {
        resolving = false
        onResultCb = null
        onErrorCb = null
      }
    },
  }
}

// ── WebSpeech 实现（降级） ─────────────────────────────

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

function createWebSpeechEngine(): STTEngine {
  let recognition: SpeechRecognitionLike | null = null

  const ctor = () =>
    ((window as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ||
      (window as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition)

  return {
    type: "webspeech",
    isAvailable: () => typeof window !== "undefined" && Boolean(ctor()),
    start(options: { onResult: (text: string) => void; onError?: (err: string) => void; onEnd?: () => void }) {
      const Ctor = ctor()
      if (!Ctor) { options.onError?.("unsupported"); return }
      recognition?.abort()
      const rec = new Ctor()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = "zh-CN"
      rec.onresult = (e) => {
        let text = ""
        for (let i = 0; i < e.results.length; i++) {
          if (e.results[i].isFinal) text += e.results[i][0].transcript
        }
        if (text) options.onResult(text)
      }
      rec.onerror = (e) => options.onError?.(e.error)
      rec.onend = () => options.onEnd?.()
      recognition = rec
      rec.start()
    },
    stop() {
      try { recognition?.stop() } catch { /* ignore */ }
      recognition = null
    },
  }
}

// ── 工厂 ───────────────────────────────────────────────

export function createSTTEngine(type: STTType): STTEngine {
  return type === "local" ? createLocalEngine() : createWebSpeechEngine()
}
