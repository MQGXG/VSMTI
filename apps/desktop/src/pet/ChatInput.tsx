import { useState, useRef, useEffect } from "react"

interface ChatInputProps {
  onSend: (text: string) => void
  disabled: boolean
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [disabled])

  const handleSend = () => {
    if (!text.trim() || disabled) return
    onSend(text.trim())
    setText("")
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSend()
          }
        }}
        placeholder={disabled ? "等待回复..." : "输入消息..."}
        disabled={disabled}
        style={{
          flex: 1,
          padding: "7px 10px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.06)",
          color: "#fff",
          fontSize: 13,
          outline: "none",
          fontFamily: "'Hiragino Sans', 'Noto Sans SC', sans-serif",
        }}
      />
      <button
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        style={{
          padding: "7px 14px",
          borderRadius: 8,
          border: "none",
          background: disabled ? "rgba(108,92,231,0.4)" : "linear-gradient(135deg, #6c5ce7, #a29bfe)",
          color: "#fff",
          fontSize: 13,
          cursor: disabled ? "default" : "pointer",
          fontWeight: 600,
          transition: "background 0.2s",
        }}
      >
        发送
      </button>
    </div>
  )
}
