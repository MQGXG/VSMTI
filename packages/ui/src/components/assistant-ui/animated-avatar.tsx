"use client";

/**
 * AnimatedAvatar — 基于原图 + CSS 动画的动态头像
 * 支持状态切换：idle / thinking / speaking / error
 */

import { useMemo, useState, useEffect } from "react"
import { cn } from "../../lib/utils"

export type AvatarState = "idle" | "thinking" | "speaking" | "error"

interface AnimatedAvatarProps {
  src?: string
  state?: AvatarState
  size?: number
  className?: string
}

function getAvatarSrc(): string {
  try {
    const settings = JSON.parse(localStorage.getItem("settings") || "{}")
    return settings.avatarPath || ""
  } catch { return "" }
}

export function AnimatedAvatar({ src, state = "idle", size = 48, className }: AnimatedAvatarProps) {
  const [savedSrc, setSavedSrc] = useState("")

  useEffect(() => {
    setSavedSrc(getAvatarSrc())
  }, [])

  const finalSrc = src || savedSrc

  const stateClass = useMemo(() => ({
    idle: "avatar-idle",
    thinking: "avatar-thinking",
    speaking: "avatar-speaking",
    error: "avatar-error",
  }[state]), [state])

  return (
    <div
      className={cn("animated-avatar relative shrink-0", stateClass, className)}
      style={{ width: size, height: size }}
    >
      {/* 主图像层 */}
      <div className="avatar-image-wrapper">
        {finalSrc ? (
          <img src={finalSrc} alt="avatar" className="avatar-image" draggable={false} />
        ) : (
          <div className="avatar-fallback">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="48" fill="var(--bg-tertiary)" stroke="var(--border)" strokeWidth="2"/>
              <text x="50" y="58" textAnchor="middle" fill="var(--fg-secondary)" fontSize="28" fontWeight="700" fontFamily="system-ui">M</text>
            </svg>
          </div>
        )}
      </div>

      {/* 呼吸光晕 */}
      <div className="avatar-glow" />

      {/* 状态指示器 */}
      {state === "thinking" && (
        <div className="avatar-thinking-dots">
          <span className="dot dot-1" />
          <span className="dot dot-2" />
          <span className="dot dot-3" />
        </div>
      )}

      {state === "speaking" && (
        <div className="avatar-speaking-waves">
          <span className="wave wave-1" />
          <span className="wave wave-2" />
          <span className="wave wave-3" />
        </div>
      )}

      {state === "error" && (
        <div className="avatar-error-indicator">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" fill="#ef4444"/>
            <path d="M6 3.5v3M6 8h.01" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
      )}
    </div>
  )
}
