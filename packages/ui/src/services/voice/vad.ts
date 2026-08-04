/**
 * VAD — 语音活动检测（Web Audio 能量检测，无模型依赖）
 *
 * 用于实时对话：检测说话开始/结束，触发录音边界。
 * 纯音频层，无 UI / 引擎耦合，可单测。
 */

import { getCurrentVolume } from "./audio-utils"
import type { VADResult } from "./types"

export interface VADOptions {
  /** 说话判定音量阈值（0-1） */
  speechThreshold?: number
  /** 静音判定音量阈值（低于此判定为静音） */
  silenceThreshold?: number
  /** 触发"说话结束"所需的连续静音时长（ms） */
  silenceDurationMs?: number
  /** 触发"说话开始"所需的连续有声时长（ms） */
  speechDurationMs?: number
  /** 检测回调 */
  onStateChange: (result: VADResult) => void
}

export interface VADController {
  /** 处理一帧音量（每帧调用，通常在 rAF 循环里） */
  process(volume: number): void
  reset(): void
}

/**
 * 基于能量的 VAD。通过连续帧判定进入/退出说话状态：
 * - 音量连续超过 speechThreshold 达 speechDurationMs → speaking
 * - 音量连续低于 silenceThreshold 达 silenceDurationMs → 结束
 */
export function createVAD(options: VADOptions): VADController {
  const speechThreshold = options.speechThreshold ?? 0.02
  const silenceThreshold = options.silenceThreshold ?? 0.008
  const silenceDurationMs = options.silenceDurationMs ?? 900
  const speechDurationMs = options.speechDurationMs ?? 200

  let speaking = false
  let voicedMs = 0
  let silentMs = 0
  let lastTime = 0
  let speechStart: number | undefined
  let speechEnd: number | undefined

  function process(volume: number): void {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now()
    const dt = lastTime === 0 ? 16 : now - lastTime
    lastTime = now

    if (!speaking) {
      if (volume >= speechThreshold) {
        voicedMs += dt
        silentMs = 0
        if (voicedMs >= speechDurationMs) {
          speaking = true
          voicedMs = 0
          speechStart = now
          speechEnd = undefined
          options.onStateChange({ speaking: true, speechStart })
        }
      } else {
        voicedMs = 0
      }
    } else {
      if (volume < silenceThreshold) {
        silentMs += dt
        if (silentMs >= silenceDurationMs) {
          speaking = false
          silentMs = 0
          speechEnd = now
          options.onStateChange({ speaking: false, speechStart, speechEnd })
        }
      } else {
        silentMs = 0
      }
    }
  }

  function reset(): void {
    speaking = false
    voicedMs = 0
    silentMs = 0
    lastTime = 0
    speechStart = undefined
    speechEnd = undefined
  }

  return { process, reset }
}

/** 便捷：直接从 Analyser 读取音量并喂给 VAD */
export function runVADLoop(
  analyser: AnalyserNode,
  vad: VADController,
  onStop?: () => void,
): () => void {
  let raf = 0
  const loop = () => {
    const volume = getCurrentVolume(analyser)
    vad.process(volume)
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)
  return () => cancelAnimationFrame(raf)
}
