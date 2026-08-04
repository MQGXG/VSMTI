/**
 * 语音模块共享类型 — TTS / STT / VAD 引擎接口与统一类型
 *
 * 分层：UI 只依赖这里的接口（依赖反转），不感知具体引擎实现。
 */

/** TTS 引擎接口 */
export interface TTSEngine {
  readonly type: TTSType
  /** 是否可用（如本地模型未加载/浏览器不支持 Web Speech） */
  isAvailable(): boolean
  /** 朗读文本；返回 Promise 在朗读完成/停止时 resolve */
  speak(text: string, options?: { onStart?: () => void; onEnd?: () => void }): Promise<void>
  /** 停止朗读 */
  stop(): void
}

export type TTSType = "webspeech" | "local"

/** STT 引擎接口 */
export interface STTEngine {
  readonly type: STTType
  isAvailable(): boolean
  /** 开始监听；onResult 在识别出结果时回调（可多次） */
  start(options: { onResult: (text: string) => void; onError?: (err: string) => void; onEnd?: () => void }): void
  stop(): void
}

export type STTType = "local" | "webspeech"

/** VAD 检测结果 */
export interface VADResult {
  /** 当前是否有语音 */
  speaking: boolean
  /** 语音活动开始时间（ms） */
  speechStart?: number
  /** 语音活动结束时间（ms） */
  speechEnd?: number
}

/** 实时语音对话编排的回调上下文 */
export interface RealtimeVoiceHooks {
  /** 用户说话识别完成后回调（转 Agent） */
  onUserSpeech: (text: string) => void
  /** Agent 回复文本回调（用于 TTS + 口型） */
  onAssistantSpeech: (text: string) => void
  /** 对话状态变化 */
  onStatusChange: (status: "idle" | "listening" | "processing" | "speaking") => void
}
