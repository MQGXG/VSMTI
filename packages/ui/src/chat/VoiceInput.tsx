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
  const statusRef = useRef<VoiceStatus>("idle")
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isSupported = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)

  const clearErrorTimer = useCallback(() => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current)
      errorTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearErrorTimer()
      if (recognitionRef.current) {
        recognitionRef.current.abort()
        recognitionRef.current = null
      }
    }
  }, [clearErrorTimer])

  const startListening = useCallback(() => {
    if (!isSupported || disabled) return

    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch {}
      recognitionRef.current = null
    }

    clearErrorTimer()
    setError(null)
    setStatus("listening")
    statusRef.current = "listening"

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SpeechRecognition()

    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = "zh-CN"
    recognition.maxAlternatives = 1

    let finalTranscript = ""

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript
        }
      }
      if (finalTranscript) {
        setStatus("processing")
        statusRef.current = "processing"
        onTranscript(finalTranscript)
        finalTranscript = ""
        if (statusRef.current === "processing") {
          setStatus("listening")
          statusRef.current = "listening"
        }
      }
    }

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error)
      setError(event.error)
      setStatus("error")
      statusRef.current = "error"
      clearErrorTimer()
      errorTimerRef.current = setTimeout(() => {
        setStatus("idle")
        statusRef.current = "idle"
      }, 2000)
    }

    recognition.onend = () => {
      if (statusRef.current === "listening") {
        setStatus("idle")
        statusRef.current = "idle"
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [isSupported, disabled, onTranscript, clearErrorTimer])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch {}
      recognitionRef.current = null
    }
    setStatus("idle")
    statusRef.current = "idle"
  }, [])

  const toggleListening = useCallback(() => {
    if (status === "listening") {
      stopListening()
    } else {
      startListening()
    }
  }, [status, startListening, stopListening])

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
