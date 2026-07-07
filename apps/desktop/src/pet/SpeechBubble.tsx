import { useEffect, useState } from "react"

interface SpeechBubbleProps {
  role: "user" | "assistant"
  content: string
}

export function SpeechBubble({ role, content }: SpeechBubbleProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  const isUser = role === "user"

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        transition: "opacity 0.25s ease, transform 0.25s ease",
      }}
    >
      <div
        style={{
          position: "relative",
          maxWidth: "85%",
          padding: "6px 11px",
          borderRadius: isUser ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
          background: isUser
            ? "linear-gradient(135deg, #6c5ce7, #a29bfe)"
            : "rgba(255,255,255,0.12)",
          border: isUser ? "none" : "1px solid rgba(255,255,255,0.15)",
          fontSize: 13,
          lineHeight: 1.5,
          color: isUser ? "#fff" : "rgba(255,255,255,0.9)",
          fontFamily: "'Hiragino Sans', 'Noto Sans SC', sans-serif",
          wordBreak: "break-word",
          boxShadow: isUser
            ? "0 2px 8px rgba(108,92,231,0.3)"
            : "0 1px 4px rgba(0,0,0,0.2)",
        }}
      >
        {content || (isUser ? "" : <span style={{ opacity: 0.5 }}>...</span>)}
      </div>
    </div>
  )
}
