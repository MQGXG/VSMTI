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

function getModels(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem("pet_models") || '{"hiyori":"/models/hiyori/Hiyori.model3.json"}')
  } catch { return { hiyori: "/models/hiyori/Hiyori.model3.json" } }
}

export function PetApp() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasWrapRef = useRef<HTMLDivElement>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)
  const [live2dStatus, setLive2dStatus] = useState<string>("loading")
  const [live2dError, setLive2dError] = useState<string | null>(null)
  const [currentModel, setCurrentModel] = useState(0)
  const sessionRef = useRef<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const streamCleanupRef = useRef<(() => void) | null>(null)
  const modelRef = useRef<any>(null)
  const appRef = useRef<any>(null)
  const loadModelRef = useRef<any>(null)

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

        setLive2dStatus("importing...")
        const { Application, extensions } = await import("pixi.js")
        const { Live2DModel, Live2DPlugin } = await import("untitled-pixi-live2d-engine/cubism")
        extensions.add(Live2DPlugin)

        setLive2dStatus("creating canvas...")
        const app = new Application()
        await app.init({
          backgroundAlpha: 0,
          autoDensity: true,
          resolution: Math.max(window.devicePixelRatio || 1, 1),
          resizeTo: wrap,
          preference: "webgl",
        })
        app.canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%"
        wrap.appendChild(app.canvas)
        if (destroyed) { app.destroy(true); return }

        setLive2dStatus("loading model...")
        appRef.current = app

        let ro: ResizeObserver | null = null
        let onWheel: ((e: WheelEvent) => void) | null = null

        const loadLive2DModel = async (modelKey?: string) => {
          const models = getModels()
          const key = modelKey ?? localStorage.getItem("pet_model") ?? "hiyori"
          const path = models[key] ?? Object.values(models)[0]!
          setLive2dStatus(`loading ${key}...`)
          const m = await Live2DModel.from(path)
          modelRef.current?.destroy()
          modelRef.current = m
          app.stage.addChild(m)
          m.anchor.set(0.5)

          const fit = () => {
            const cw = app.canvas.clientWidth
            const ch = app.canvas.clientHeight
            if (cw <= 0 || ch <= 0) return
            const bounds = m.getLocalBounds()
            const modelSize = Math.max(bounds.width, bounds.height)
            if (modelSize > 0) m.scale.set(Math.min(cw, ch) * 1.2 / modelSize)
            m.position.set(cw / 2, ch / 2)
          }
          fit()

          ro?.disconnect()
          if (onWheel) app.canvas.removeEventListener("wheel", onWheel)
          app.stage.off("pointermove")
          app.stage.off("pointerup")
          app.stage.off("pointerupoutside")

          ro = new ResizeObserver(() => {
            const cw = app.canvas.clientWidth
            const ch = app.canvas.clientHeight
            if (cw <= 0 || ch <= 0) return
            const bounds = m.getLocalBounds()
            const modelSize = Math.max(bounds.width, bounds.height)
            if (modelSize > 0) m.scale.set(Math.min(cw, ch) * 1.2 / modelSize)
            m.position.set(cw / 2, ch / 2)
          })
          ro.observe(wrap)

          onWheel = (e: WheelEvent) => {
            e.preventDefault()
            const zoom = e.deltaY > 0 ? 0.9 : 1.1
            m.scale.set(m.scale.x * zoom)
          }
          app.canvas.addEventListener("wheel", onWheel, { passive: false })

          app.stage.eventMode = "static"
          let dragging = false
          let dragOffset = { x: 0, y: 0 }

          app.stage.on("pointermove", (e: any) => {
            const pos = e.global
            if (dragging) m.position.set(pos.x - dragOffset.x, pos.y - dragOffset.y)
            m.focus?.(m.toLocal(pos).x, m.toLocal(pos).y)
          })

          m.eventMode = "static"
          m.cursor = "pointer"
          m.on("pointerdown", (e: any) => {
            dragging = true
            const pos = e.global
            dragOffset = { x: pos.x - m.position.x, y: pos.y - m.position.y }
          })

          app.stage.on("pointerup", () => { dragging = false })
          app.stage.on("pointerupoutside", () => { dragging = false })

          loadModelRef.current = loadLive2DModel
          setLive2dStatus("ready")
        }
        loadModelRef.current = loadLive2DModel
        await loadLive2DModel()
        const onStorage = (e: StorageEvent) => {
          if (e.key === "pet_model") loadLive2DModel(e.newValue ?? undefined)
        }
        window.addEventListener("storage", onStorage)
        const origCleanup = cleanupRef.current
        cleanupRef.current = () => {
          window.removeEventListener("storage", onStorage)
          if (onWheel) app.canvas.removeEventListener("wheel", onWheel)
          app.stage.off("pointermove")
          app.stage.off("pointerup")
          app.stage.off("pointerupoutside")
          ro?.disconnect()
          modelRef.current?.destroy()
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
      }}
    >
      <div style={{
        height: 32, WebkitAppRegion: "drag" as any, cursor: "grab", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(20,20,30,0.5)",
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
      </div>
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
