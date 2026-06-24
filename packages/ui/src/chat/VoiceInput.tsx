/**
 * 语音输入组件 — 使用 Web Speech API 实现语音识别
 */

import { useState, useRef, useCallback, useEffect } from "react"
import { Mic, MicOff, Loader2 } from "lucide-react"

interface VoiceInputProps {
  onTranscript: (text: string) => void
  disabled?: boolean
  className?: string
}

type VoiceStatus = "idle" | "listening" | "processing" | "error"

export function VoiceInput({ onTranscript, disabled = false, className = "" }: VoiceInputProps) {
  const [status, setStatus] = useState<VoiceStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<any>(null)

  const isSupported = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
        recognitionRef.current = null
      }
    }
  }, [])

  const startListening = useCallback(() => {
    if (!isSupported || disabled) return

    setError(null)
    setStatus("listening")

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SpeechRecognition()

    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = "zh-CN"
    recognition.maxAlternatives = 1

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setStatus("processing")
      onTranscript(transcript)
      setStatus("idle")
    }

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error)
      setError(event.error)
      setStatus("error")
      setTimeout(() => setStatus("idle"), 2000)
    }

    recognition.onend = () => {
      if (status === "listening") {
        setStatus("idle")
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [isSupported, disabled, onTranscript, status])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setStatus("idle")
  }, [])

  const toggleListening = useCallback(() => {
    if (status === "listening") {
      stopListening()
    } else {
      startListening()
    }
  }, [status, startListening, stopListening])

  if (!isSupported) {
    return null
  }

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
