import { useState, useRef, useCallback, useEffect } from "react"
import { Mic, MicOff, Loader2 } from "lucide-react"
import { createSTTEngine } from "../services/voice/stt"
import type { STTEngine } from "../services/voice/types"

interface VoiceInputProps {
  onTranscript: (text: string) => void
  disabled?: boolean
  className?: string
}

type VoiceStatus = "idle" | "listening" | "processing" | "error"

export function VoiceInput({ onTranscript, disabled = false, className = "" }: VoiceInputProps) {
  const [status, setStatus] = useState<VoiceStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const engineRef = useRef<STTEngine | null>(null)
  const statusRef = useRef<VoiceStatus>("idle")
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const engine = useCallback((): STTEngine => {
    if (!engineRef.current) {
      // 优先本地（Whisper 离线），不可用时降级 Web Speech
      const local = createSTTEngine("local")
      engineRef.current = local.isAvailable() ? local : createSTTEngine("webspeech")
    }
    return engineRef.current
  }, [])

  const clearErrorTimer = useCallback(() => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current)
      errorTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearErrorTimer()
      engineRef.current?.stop()
      engineRef.current = null
    }
  }, [clearErrorTimer])

  const startListening = useCallback(() => {
    if (disabled) return
    const e = engine()
    if (!e.isAvailable()) { setError("unsupported"); return }

    clearErrorTimer()
    setError(null)
    setStatus("listening")
    statusRef.current = "listening"

    e.start({
      onResult: (text) => {
        setStatus("processing")
        statusRef.current = "processing"
        onTranscript(text)
        setStatus("listening")
        statusRef.current = "listening"
      },
      onError: (err) => {
        console.error("Speech recognition error:", err)
        setError(err)
        setStatus("error")
        statusRef.current = "error"
        clearErrorTimer()
        errorTimerRef.current = setTimeout(() => {
          setStatus("idle")
          statusRef.current = "idle"
        }, 2000)
      },
    })
  }, [engine, disabled, onTranscript, clearErrorTimer])

  const stopListening = useCallback(() => {
    engine().stop()
    setStatus("idle")
    statusRef.current = "idle"
  }, [engine])

  const toggleListening = useCallback(() => {
    if (status === "listening") {
      stopListening()
    } else {
      startListening()
    }
  }, [status, startListening, stopListening])

  const isSupported = typeof window !== "undefined" && (
    "SpeechRecognition" in window || "webkitSpeechRecognition" in window || !!navigator.mediaDevices
  )
  if (!isSupported) return null

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={toggleListening}
        disabled={disabled || status === "processing"}
        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
        style={{
          color: status === "listening" ? "#ef4444" : "var(--text-tertiary)",
          background: status === "listening" ? "rgba(239,68,68,0.1)" : "transparent",
        }}
        title={status === "listening" ? "停止录音" : "语音输入"}
      >
        {status === "listening" ? (
          <MicOff className="w-4 h-4" />
        ) : status === "processing" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </button>

      {status === "listening" && (
        <div
          className="absolute -top-1 -right-1 w-2 h-2 rounded-full animate-pulse"
          style={{ background: "#ef4444" }}
        />
      )}

      {error && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded text-[10px] whitespace-nowrap"
          style={{ background: "var(--surface-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
        >
          {error === "not-allowed" ? "请允许麦克风权限" : error === "no-speech" ? "未检测到语音" : "识别失败"}
        </div>
      )}
    </div>
  )
}
