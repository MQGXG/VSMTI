/**
 * 实时语音对话编排 — VAD + 录音 + Whisper STT + Agent 回调 + TTS
 *
 * 组合 voice 模块各引擎实现连续对话：说话 → 识别 → 回调 Agent → TTS 播放回复。
 * 零 React 依赖，可复用于主聊天窗口与桌宠。
 *
 * 参考 webai-realtime-voice-chat 的 VAD→ASR→Chat→TTS 链路。
 */

import { startMicRecording, recordChunk, mergeChunks } from "./audio-utils"
import { createVAD, runVADLoop } from "./vad"
import type { TTSEngine } from "./types"

export type RealtimeStatus = "idle" | "listening" | "processing" | "speaking"

export interface RealtimeVoiceOptions {
  /** TTS 引擎（播放 Agent 回复） */
  tts: TTSEngine
  /** 语音识别（本地 Whisper 封装） */
  transcribe: (audio: Float32Array) => Promise<string>
  /** 用户一段语音识别完成后回调（转发给 Agent） */
  onUserSpeech: (text: string) => void
  /** 对话状态变化（UI 展示） */
  onStatusChange?: (status: RealtimeStatus) => void
}

export class RealtimeVoice {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private recorder: { stop: () => void } | null = null
  private vadStop: (() => void) | null = null
  private vad: ReturnType<typeof createVAD> | null = null
  private currentChunk: Float32Array[] = []
  private collecting = false
  private busy = false
  private speaking = false

  constructor(private options: RealtimeVoiceOptions) {}

  /** 启动：开启麦克风 + VAD 循环，进入连续监听 */
  async start(): Promise<void> {
    if (this.stream) return
    this.options.onStatusChange?.("idle")

    const mic = await startMicRecording()
    this.ctx = mic.ctx
    this.stream = mic.stream

    // 持续采集 16k 音频；仅在 collecting（说话中）且未在播放时写入当前段
    this.recorder = recordChunk(mic.ctx, mic.stream, 16000, (c) => {
      if (this.collecting && !this.speaking) this.currentChunk.push(c)
    })

    this.vad = createVAD({
      onStateChange: (r) => {
        if (r.speaking) {
          if (!this.busy && !this.speaking) {
            this.collecting = true
            this.currentChunk = []
            this.options.onStatusChange?.("listening")
          }
        } else if (this.collecting) {
          this.collecting = false
          this.flush()
        }
      },
    })

    this.vadStop = runVADLoop(mic.analyser, this.vad)
  }

  /** 一段语音结束：拼接音频 → 识别 → 回调 Agent */
  private flush(): void {
    if (this.currentChunk.length === 0) return
    const audio = mergeChunks(this.currentChunk, 16000)
    this.currentChunk = []
    if (audio.length < 1600) return // <0.1s 视为无效

    this.busy = true
    this.options.onStatusChange?.("processing")
    this.options
      .transcribe(audio)
      .then((text) => {
        this.busy = false
        if (text.trim()) this.options.onUserSpeech(text.trim())
        this.options.onStatusChange?.("idle")
      })
      .catch(() => {
        this.busy = false
        this.options.onStatusChange?.("idle")
      })
  }

  /** 播放 Agent 回复（TTS），播放期间暂停 VAD 采集避免回声误判 */
  async speak(text: string): Promise<void> {
    if (!text.trim()) return
    this.speaking = true
    this.options.onStatusChange?.("speaking")
    try {
      await this.options.tts.speak(text)
    } finally {
      this.speaking = false
      this.options.onStatusChange?.("idle")
    }
  }

  stop(): void {
    this.vadStop?.()
    this.recorder?.stop()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.vad?.reset()
    this.options.tts.stop()
    this.stream = null
    this.recorder = null
    this.vadStop = null
    this.currentChunk = []
    this.collecting = false
    this.busy = false
    this.speaking = false
    this.options.onStatusChange?.("idle")
  }
}
