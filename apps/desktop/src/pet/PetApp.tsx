import { useEffect, useRef, useState, useCallback } from "react"
import { SpeechBubble } from "./SpeechBubble"
import { ChatInput } from "./ChatInput"

declare global {
  interface Window {
    Live2DCubismCore?: any
    electronAPI: any
  }
}

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
}

let msgCounter = 0

export function PetApp() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasWrapRef = useRef<HTMLDivElement>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)
  const [live2dStatus, setLive2dStatus] = useState<string>("loading")
  const [live2dError, setLive2dError] = useState<string | null>(null)
  const sessionRef = useRef<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const streamCleanupRef = useRef<(() => void) | null>(null)

  const addMsg = useCallback((role: "user" | "assistant", content: string) => {
    const id = ++msgCounter + ""
    setMessages((prev) => [...prev, { id, role, content }])
  }, [])

  const updateLastMsg = useCallback((updater: string | ((prev: string) => string)) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev
      const copy = [...prev]
      const current = copy[copy.length - 1].content
      copy[copy.length - 1] = {
        ...copy[copy.length - 1],
        content: typeof updater === "function" ? updater(current) : updater,
      }
      return copy
    })
  }, [])

  useEffect(() => {
    const wrap = canvasWrapRef.current
    if (!wrap) return

    let destroyed = false

    const initLive2D = async () => {
      try {
        setLive2dStatus("loading Cubism Core...")
        if (!(window as any).Live2DCubismCore) {
          const loaded = await new Promise<boolean>((resolve) => {
            const s = document.createElement("script")
            s.src = "/Core/live2dcubismcore.min.js"
            s.onload = () => resolve(!!(window as any).Live2DCubismCore)
            s.onerror = () => resolve(false)
            document.head.appendChild(s)
          })
          if (!loaded) { setLive2dError("Cubism Core load failed"); setLive2dStatus("error"); return }
        }

        const Core = (window as any).Live2DCubismCore
        if (Core?.Model?.fromMoc) {
          const orig = Core.Model.fromMoc
          Core.Model.fromMoc = function (...args: any[]) {
            const model = orig.apply(this, args)
            if (model?.drawables && !("renderOrders" in model.drawables)) {
              Object.defineProperty(model.drawables, "renderOrders", {
                get: () => model.drawables.drawOrders, configurable: true,
              })
            }
            return model
          }
        }

        setLive2dStatus("importing...")
        const { Application, Ticker } = await import("pixi.js")
        const { Config, Live2DSprite } = await import("easy-live2d")
        Config.MotionGroupIdle = "Idle"

        setLive2dStatus("creating canvas...")
        const canvas = document.createElement("canvas")
        canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%"
        wrap.appendChild(canvas)

        const rect = wrap.getBoundingClientRect()
        const initW = Math.max(Math.round(rect.width), 100)
        const initH = Math.max(Math.round(rect.height), 100)

        const app = new Application()
        await app.init({
          canvas,
          backgroundAlpha: 0,
          autoDensity: true,
          resolution: Math.max(window.devicePixelRatio || 1, 1),
          width: initW,
          height: initH,
          resizeTo: wrap,
          preference: "webgl",
        })
        if (destroyed) { app.destroy(true); return }

        setLive2dStatus("loading model...")
        const sprite = new Live2DSprite({
          modelPath: "/models/hiyori/Hiyori.model3.json",
          ticker: Ticker.shared,
        })
        app.stage.addChild(sprite)

        sprite.anchor.set(0.5)

        const fitSize = () => {
          const cw = canvas.clientWidth
          const ch = canvas.clientHeight
          if (cw <= 0 || ch <= 0) return
          sprite.width = cw * 0.85
          sprite.height = ch * 0.85
          sprite.x = cw / 2
          sprite.y = ch / 2
        }
        fitSize()

        sprite.onLive2D("ready", () => {
          if (destroyed) return
          fitSize()
          setLive2dStatus("ready")
        })

        const ro = new ResizeObserver(() => {
          fitSize()
        })
        ro.observe(wrap)

        cleanupRef.current = () => {
          ro.disconnect()
          sprite.destroy()
          app.destroy(true, { children: true, texture: true })
        }

      } catch (err: any) {
        console.error("[Pet] Live2D init FAILED:", err)
        setLive2dError(err.message || String(err))
        setLive2dStatus("error")
      }
    }

    initLive2D()

    return () => {
      destroyed = true
      streamCleanupRef.current?.()
      cleanupRef.current?.()
    }
  }, [])

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return
      setStreaming(true)
      addMsg("user", text)

      try {
        if (!sessionRef.current) {
          const projects = await window.electronAPI.ts.listProjects()
          let petProject = projects.find((p: any) => p.name === "Live2D Pet")
          if (!petProject) {
            petProject = await window.electronAPI.ts.createProject("Live2D Pet", "")
          }
          const session = await window.electronAPI.ts.createSession(petProject.project_id, "Pet Chat")
          sessionRef.current = session.session_id
        }

        const config = await window.electronAPI.config.get()
        addMsg("assistant", "")

        const channel = await window.electronAPI.agent.startStream(
          sessionRef.current, text, config || {}
        )

        const cleanup = window.electronAPI.agent.onEvent(channel, (data: any) => {
          if (data.type === "delta" && data.content) {
            updateLastMsg((prev: string) => prev + data.content)
          } else if (data.type === "finish") {
            setStreaming(false)
          } else if (data.type === "error") {
            updateLastMsg((prev: string) => prev || `Error: ${data.message}`)
            setStreaming(false)
          }
        })
        streamCleanupRef.current = cleanup
      } catch (err: any) {
        updateLastMsg(`[Error] ${err.message || "Failed to send message"}`)
        setStreaming(false)
      }
    },
    [streaming, addMsg, updateLastMsg]
  )

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        WebkitAppRegion: "drag" as any, userSelect: "none",
      }}
    >
      <div
        ref={canvasWrapRef}
        style={{
          flex: 1, position: "relative", minHeight: 100,
          WebkitAppRegion: "no-drag" as any,
        }}
      >
        {live2dStatus !== "ready" && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.6)", color: live2dError ? "#ff6b6b" : "#aaa",
            fontSize: 11, textAlign: "center", padding: 12, zIndex: 10, pointerEvents: "none",
          }}>
            {live2dError
              ? <><div style={{ fontSize: 18, marginBottom: 6 }}>&#9888;</div><div>{live2dError}</div></>
              : <div>{live2dStatus}</div>
            }
          </div>
        )}
      </div>

      <div style={{
        WebkitAppRegion: "no-drag" as any, background: "rgba(20,20,30,0.85)",
        backdropFilter: "blur(12px)", borderTop: "1px solid rgba(255,255,255,0.08)",
        padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6, maxHeight: "45%",
      }}>
        <div style={{
          display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", flex: 1, minHeight: 0,
        }}>
          {messages.map((msg) => (
            <SpeechBubble key={msg.id} role={msg.role} content={msg.content} />
          ))}
        </div>
        <ChatInput onSend={handleSend} disabled={streaming} />
      </div>
    </div>
  )
}
