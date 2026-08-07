/**
 * 语音交互模块
 * 参考 Qwen Audio Agent 的全双工语音交互设计
 */

// 导出类型
export type {
  // VAD
  VADConfig,
  VADEvent,
  VADEventType,
  VADState,

  // STT
  STTConfig,
  STTResult,
  STTEvent,
  STTEventType,

  // TTS
  TTSConfig,
  TTSResult,
  TTSEvent,
  TTSEventType,

  // 语音会话
  VoiceSessionConfig,
  VoiceSessionState,
  VoiceSessionEvent,
  VoiceSessionEventType,

  // 打断
  InterruptionConfig,
  InterruptionEvent,

  // 语音管理器
  VoiceManagerConfig,
  VoiceManagerEvent,
  VoiceManagerEventType,
} from './types'

// 导出类
export { VoiceActivityDetector } from './vad'
export { InterruptionManager } from './interruption'
export { VoiceSessionManager } from './voice-session'
