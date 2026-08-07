/**
 * 语音会话管理器
 * 管理完整的语音交互流程
 */

import { EventEmitter } from 'events'
import { VoiceActivityDetector } from './vad'
import { InterruptionManager } from './interruption'
import type {
  VoiceSessionConfig,
  VoiceSessionState,
  VoiceSessionEvent,
  VoiceSessionEventType,
  STTResult,
  TTSResult,
  STTConfig,
  TTSConfig,
} from './types'

/** 默认会话配置 */
const DEFAULT_SESSION_CONFIG: VoiceSessionConfig = {
  enableInterruption: true,
  enableAutoVAD: true,
  vad: {
    threshold: 0.3,
    debounceMs: 100,
    minSpeechMs: 200,
    minSilenceMs: 500,
  },
  stt: {
    model: 'whisper-base',
    language: 'zh-CN',
    continuous: true,
  },
  tts: {
    voice: 'zh-CN-XiaoxiaoNeural',
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
    streaming: true,
  },
}

/**
 * 语音会话管理器
 */
export class VoiceSessionManager extends EventEmitter {
  private config: VoiceSessionConfig
  private state: VoiceSessionState = 'idle'
  private vad: VoiceActivityDetector
  private interruption: InterruptionManager
  private stream: MediaStream | null = null
  private transcriptBuffer: string = ''
  private lastTranscriptTime = 0

  constructor(config?: Partial<VoiceSessionConfig>) {
    super()
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config }
    this.vad = new VoiceActivityDetector(this.config.vad)
    this.interruption = new InterruptionManager()
    this.setupEventHandlers()
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    // VAD 事件
    this.vad.on('vad', (event) => {
      if (event.type === 'speech_start') {
        this.handleSpeechStart()
      } else if (event.type === 'speech_end') {
        this.handleSpeechEnd()
      }
    })

    // 打断事件
    this.interruption.on('interruption', (event) => {
      if (event.type === 'interrupt_start') {
        this.setState('interrupted')
      } else if (event.type === 'interrupt_end') {
        this.setState('listening')
      }
    })
  }

  /**
   * 开始语音会话
   */
  async start(): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error('语音会话已在运行')
    }

    try {
      // 获取麦克风权限
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      // 启动 VAD
      if (this.config.enableAutoVAD) {
        await this.vad.start(this.stream)
      }

      this.setState('listening')
      this.emitEvent('ready')
    } catch (error) {
      this.emitEvent('error', error)
      throw error
    }
  }

  /**
   * 停止语音会话
   */
  stop(): void {
    this.vad.stop()
    this.interruption.destroy()

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }

    this.transcriptBuffer = ''
    this.setState('idle')
  }

  /**
   * 处理语音开始
   */
  private handleSpeechStart(): void {
    if (this.state === 'speaking') {
      // 打断当前播放
      this.interruption.handleUserSpeaking()
    }
    this.setState('processing')
  }

  /**
   * 处理语音结束
   */
  private handleSpeechEnd(): void {
    if (this.config.enableInterruption) {
      this.interruption.cancelInterrupt()
    }
    this.setState('listening')
  }

  /**
   * 处理 STT 结果
   */
  handleSTTResult(result: STTResult): void {
    if (result.isFinal) {
      this.transcriptBuffer = result.text
      this.lastTranscriptTime = Date.now()
      this.emitEvent('transcript', result)
    } else {
      // 部分结果，更新 UI
      this.emitEvent('transcript', { ...result, isFinal: false })
    }
  }

  /**
   * 处理 TTS 结果
   */
  async handleTTSResult(result: TTSResult): Promise<void> {
    this.setState('speaking')
    
    // 将音频数据转换为 ArrayBuffer 并播放
    const audioData = this.base64ToArrayBuffer(result.audio)
    await this.interruption.playWithInterruption(audioData)
    this.emitEvent('audio', audioData)
  }

  /**
   * 发送文本到 TTS
   */
  async speak(text: string): Promise<void> {
    // 这里应该调用实际的 TTS 服务
    // 暂时使用 Web Speech API 作为示例
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = this.config.tts?.language || 'zh-CN'
    utterance.rate = this.config.tts?.rate || 1.0
    utterance.pitch = this.config.tts?.pitch || 1.0
    
    this.setState('speaking')
    
    return new Promise((resolve) => {
      utterance.onend = () => {
        this.setState('listening')
        resolve()
      }
      utterance.onerror = () => {
        this.setState('listening')
        resolve()
      }
      speechSynthesis.speak(utterance)
    })
  }

  /**
   * 处理用户输入
   */
  async processInput(text: string): Promise<void> {
    this.setState('processing')
    
    // 这里应该调用 Agent 处理
    // 暂时使用简单的回显
    await this.speak(`你说的是：${text}`)
  }

  /**
   * 设置状态
   */
  private setState(state: VoiceSessionState): void {
    if (this.state === state) return
    const previousState = this.state
    this.state = state
    this.emitEvent('state_change', { state, previousState })
  }

  /**
   * 发送事件
   */
  private emitEvent(type: VoiceSessionEventType, data?: unknown): void {
    const event: VoiceSessionEvent = {
      type,
      data,
    }
    this.emit(type, event)
  }

  /**
   * Base64 转 ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
  }

  /**
   * 获取当前状态
   */
  getState(): VoiceSessionState {
    return this.state
  }

  /**
   * 获取配置
   */
  getConfig(): VoiceSessionConfig {
    return { ...this.config }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<VoiceSessionConfig>): void {
    this.config = { ...this.config, ...config }
    this.vad.updateConfig(this.config.vad || {})
  }
}
