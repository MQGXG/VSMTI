import { useState, useEffect, useRef, useMemo } from "react"
import { Search, FileText, FileEdit, Globe, Code, FolderOpen, Wrench, X, Terminal, Sparkles } from "lucide-react"
import type { ToolInfo, ToolResult } from "@/types/electron"

interface Props {
  onResult: (toolName: string, result: ToolResult) => void
  disabled?: boolean
  inputHint?: string
}

const toolIcons: Record<string, typeof Search> = {
  read_file: FileText,
  write_file: FileEdit,
  list_files: FolderOpen,
  web_search: Globe,
  grep: Search,
  glob: Search,
  run_code: Code,
  bash: Terminal,
}

const toolKeywords: Record<string, string[]> = {
  read_file: ["read", "open", "查看", "读取", "打开", "show", "cat", "content"],
  write_file: ["write", "create", "save", "写入", "创建", "保存"],
  list_files: ["list", "ls", "dir", "directory", "文件夹", "目录", "列出"],
  web_search: ["search", "google", "find", "搜索", "查找", "互联网", "网络"],
  grep: ["grep", "search in", "find text", "查找内容", "搜索内容"],
  glob: ["find file", "glob", "查找文件", "匹配"],
  run_code: ["run", "execute", "python", "code", "运行", "执行", "代码"],
  edit_file: ["edit", "replace", "modify", "修改", "替换", "编辑"],
  bash: ["bash", "shell", "terminal", "command", "终端", "命令"],
}

export function ToolPalette({ onResult, disabled, inputHint }: Props) {
  const [open, setOpen] = useState(false)
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [selectedTool, setSelectedTool] = useState<ToolInfo | null>(null)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [resultMsg, setResultMsg] = useState<string | null>(null)
  const paletteRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      window.electronAPI.agent.listTools().then(setTools)
    }
  }, [open])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSelectedTool(null)
        setResultMsg(null)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const suggestedTool = useMemo(() => {
    if (!inputHint || open) return null
    const lower = inputHint.toLowerCase()
    for (const [toolName, keywords] of Object.entries(toolKeywords)) {
      if (keywords.some((kw) => lower.includes(kw))) {
        return tools.find((t) => t.name === toolName) || null
      }
    }
    return null
  }, [inputHint, tools, open])

  const handleSelectTool = (tool: ToolInfo) => {
    setSelectedTool(tool)
    setResultMsg(null)
    setInputs({})
  }

  const handleExecute = async () => {
    if (!selectedTool) return
    setLoading(true)
    setResultMsg(null)
    try {
      const args: Record<string, unknown> = {}
      const props = selectedTool.parameters?.properties as Record<string, { type: string }> | undefined
      if (props) {
        for (const [key] of Object.entries(props)) {
          if (inputs[key] !== undefined && inputs[key] !== "") {
            const prop = props[key]
            args[key] = prop.type === "number" ? Number(inputs[key]) : inputs[key]
          }
        }
      }
      const result = await window.electronAPI.agent.executeTool(selectedTool.name, args)
      onResult(selectedTool.name, result)
      if (result.success) {
        setResultMsg("✅ 执行成功，结果已添加到对话")
        setTimeout(() => { setOpen(false); setSelectedTool(null); setResultMsg(null) }, 1000)
      } else {
        setResultMsg(`❌ ${result.error || "执行失败"}`)
      }
    } catch (e) {
      onResult(selectedTool.name, { success: false, output: "", error: String(e) })
      setResultMsg(`❌ ${String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div ref={paletteRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-30 ${
          suggestedTool && !open
            ? "text-accent-400 bg-accent-500/10 border border-accent-500/30 animate-pulse-glow"
            : "text-neutral-400 hover:text-neutral-200 hover:bg-white/10"
        }`}
        title="工具面板 (可直接执行，不经过 LLM)"
      >
        <Wrench className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{suggestedTool ? suggestedTool.name : "工具"}</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-80 glass-heavy rounded-xl shadow-2xl overflow-hidden z-50 animate-scale-in">
          {resultMsg ? (
            <div className="p-4 text-sm text-center text-neutral-300">{resultMsg}</div>
          ) : !selectedTool ? (
            <div>
              <div className="px-3 py-2 border-b border-glass-border">
                <div className="text-xs text-neutral-500 font-medium">工具面板</div>
                <div className="text-[10px] text-neutral-600">直接执行，不需要 AI 参与</div>
              </div>
              <div className="max-h-72 overflow-y-auto p-1 space-y-0.5">
                {tools.map((tool) => {
                  const Icon = toolIcons[tool.name] || Wrench
                  const isSuggested = tool.name === suggestedTool?.name
                  return (
                    <button
                      key={tool.name}
                      onClick={() => handleSelectTool(tool)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                        isSuggested
                          ? "bg-accent-500/15 text-accent-300 border border-accent-500/30"
                          : "text-neutral-200 hover:bg-white/10"
                      }`}
                    >
                      <Icon className="w-4 h-4 text-accent-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{tool.name}</div>
                        <div className="text-[11px] text-neutral-500 truncate">{tool.description}</div>
                      </div>
                      {isSuggested && <Sparkles className="w-3 h-3 text-accent-400 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(() => { const Icon = toolIcons[selectedTool.name] || Wrench; return <Icon className="w-4 h-4 text-accent-400" /> })()}
                  <span className="text-sm font-medium text-neutral-200">{selectedTool.name}</span>
                </div>
                <button onClick={() => setSelectedTool(null)} className="p-1 rounded hover:bg-white/10">
                  <X className="w-3.5 h-3.5 text-neutral-500" />
                </button>
              </div>

              <p className="text-xs text-neutral-500">{selectedTool.description}</p>

              {!!selectedTool.parameters?.properties && (
                <div className="space-y-2">
                  {Object.entries(selectedTool.parameters.properties as Record<string, { type: string; description?: string }>).map(([key, prop]) => {
                    const required = (selectedTool.parameters?.required || []) as string[]
                    return (
                      <div key={key}>
                        <label className="text-xs text-neutral-500 block mb-1">
                          {key}
                          {required.includes(key) && <span className="text-red-400 ml-1">*</span>}
                        </label>
                        {prop.type === "string" && (
                          <input
                            value={inputs[key] || ""}
                            onChange={(e) => setInputs((p) => ({ ...p, [key]: e.target.value }))}
                            placeholder={prop.description || key}
                            className="w-full bg-white/5 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-accent-500/40 placeholder-neutral-600"
                          />
                        )}
                        {prop.type === "number" && (
                          <input
                            type="number"
                            value={inputs[key] || ""}
                            onChange={(e) => setInputs((p) => ({ ...p, [key]: e.target.value }))}
                            placeholder={prop.description || key}
                            className="w-full bg-white/5 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-accent-500/40 placeholder-neutral-600"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={handleExecute} disabled={loading}
                  className="flex-1 py-2 rounded-lg text-sm btn-gradient text-white disabled:opacity-40">
                  {loading ? "执行中..." : "执行"}
                </button>
                <button onClick={() => setSelectedTool(null)}
                  className="px-3 py-2 rounded-lg text-sm text-neutral-400 hover:bg-white/10 transition-colors">
                  返回
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
