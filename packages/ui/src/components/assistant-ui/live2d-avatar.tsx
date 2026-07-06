"use client";

/**
 * Live2DAvatar — 基于 easy-live2d 的动态头像
 * 支持状态切换：idle / thinking / speaking / error
 *
 * 依赖：
 *   - easy-live2d（npm 包）
 *   - pixi.js（npm 包）
 *   - live2dcubismcore.js（public/Core/）
 *   - 模型文件（public/models/）
 */

import { useEffect, useRef, useState } from "react"
import { cn } from "../../lib/utils"

export type AvatarState = "idle" | "thinking" | "speaking" | "error"

interface Live2DAvatarProps {
  modelPath?: string
  state?: AvatarState
  size?: number
  className?: string
  onReady?: () => void
  onError?: (error: string) => void
}

// 状态 → 动作组映射（Hiyori 模型只有 Idle 和 TapBody）
const STATE_MOTION_MAP: Record<AvatarState, { group: string; no: number }> = {
  idle: { group: "Idle", no: 0 },
  thinking: { group: "Idle", no: 1 },
  speaking: { group: "Idle", no: 2 },
  error: { group: "TapBody", no: 0 },
}

export function Live2DAvatar({
  modelPath = "/models/hiyori/Hiyori.model3.json",
  state = "idle",
  size = 200,
  className,
  onReady,
  onError,
}: Live2DAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const spriteRef = useRef<any>(null)
  const appRef = useRef<any>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 动态加载 Cubism Core
  const loadCubismCore = async (): Promise<boolean> => {
    if ((window as any).Live2DCubismCore) return true
    return new Promise((resolve) => {
      const script = document.createElement("script")
      script.src = "/Core/live2dcubismcore.min.js"
      script.onload = () => resolve(!!(window as any).Live2DCubismCore)
      script.onerror = () => resolve(false)
      document.head.appendChild(script)
    })
  }

  // 初始化 Live2D 模型
  useEffect(() => {
    if (!containerRef.current) return

    let destroyed = false

    const initLive2D = async () => {
      try {
        // 动态加载 Cubism Core
        const coreLoaded = await loadCubismCore()
        if (!coreLoaded) {
          setError("Cubism Core load failed")
          return
        }

        // Cubism Core 5 兼容补丁：drawables.renderOrders → drawables.drawOrders
        const Core = (window as any).Live2DCubismCore
        if (Core?.Model?.fromMoc) {
          const originalFromMoc = Core.Model.fromMoc
          Core.Model.fromMoc = function (...args: any[]) {
            const model = originalFromMoc.apply(this, args)
            if (model?.drawables && !('renderOrders' in model.drawables)) {
              Object.defineProperty(model.drawables, 'renderOrders', {
                get: () => model.drawables.drawOrders,
                configurable: true,
              })
            }
            return model
          }
        }

        const { Application, Ticker } = await import("pixi.js")
        const { Config, Live2DSprite } = await import("easy-live2d")

        Config.MotionGroupIdle = "Idle"
        Config.MouseFollow = true
        Config.CubismLoggingLevel = 3

        const app = new Application()
        await app.init({
          width: size,
          height: size,
          backgroundAlpha: 0,
          antialias: true,
          resolution: Math.max(window.devicePixelRatio || 1, 1),
        })

        if (destroyed) { app.destroy(true); return }

        containerRef.current!.appendChild(app.canvas as HTMLCanvasElement)
        appRef.current = app

        const sprite = new Live2DSprite({ modelPath, ticker: Ticker.shared })
        sprite.width = size
        app.stage.addChild(sprite as any)
        spriteRef.current = sprite

        await sprite.ready
        if (destroyed) return

        setLoaded(true)
        onReady?.()
      } catch (err) {
        if (destroyed) return
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[Live2D] Failed to initialize:", err)
        setError(msg)
        onError?.(msg)
      }
    }

    initLive2D()

    return () => {
      destroyed = true
      if (appRef.current) {
        appRef.current.destroy(true, { children: true })
        appRef.current = null
      }
      spriteRef.current = null
    }
  }, [modelPath, size, onReady, onError])

  // 状态切换 → 播放对应动作
  useEffect(() => {
    if (!spriteRef.current || !loaded) return

    const sprite = spriteRef.current
    const motion = STATE_MOTION_MAP[state]

    try {
      // 通过参数模拟不同状态（Hiyori 模型只有 Idle 和 TapBody）
      // idle: 正常待机
      // thinking: 微微晃动（用 Idle 的不同编号）
      // speaking: 嘴巴参数模拟说话
      // error: 触发 TapBody 动作

      if (state === "speaking") {
        // 模拟说话：嘴巴参数
        sprite.setParameterValueById("ParamMouthOpenY", 0.8)
        setTimeout(() => sprite.setParameterValueById("ParamMouthOpenY", 0), 200)
      } else if (state === "thinking") {
        // 思考：头部微倾
        sprite.setParameterValueById("ParamAngleX", 10)
        setTimeout(() => sprite.setParameterValueById("ParamAngleX", 0), 1000)
      } else if (state === "error") {
        // 错误：触发 TapBody
        sprite.startMotion({
          group: "TapBody",
          no: 0,
          priority: 3 as any, // Priority.Force
        })
      }
    } catch (err) {
      console.warn("[Live2D] Motion failed:", err)
    }
  }, [state, loaded])

  if (error) {
    return (
      <div className={cn("flex flex-col items-center justify-center rounded-full bg-elevated", className)}
        style={{ width: size, height: size }}>
        <span className="text-tertiary text-xs">⚠️</span>
        <span className="text-tertiary text-[9px] mt-1 break-all px-2 text-center">{error}</span>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn("live2d-avatar relative shrink-0 overflow-hidden rounded-full", className)}
      style={{ width: size, height: size }}
    >
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-elevated rounded-full">
          <div className="animate-spin w-5 h-5 border-2 rounded-full" style={{ borderColor: "var(--border)", borderTopColor: "var(--fg-tertiary)" }} />
        </div>
      )}
    </div>
  )
}
