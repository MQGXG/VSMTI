import { Minus, Square, X, RotateCcw, Sparkles, Wrench } from "lucide-react";
import { useState, useEffect } from "react";

export function TitleBar() {
  const [pythonStatus, setPythonStatus] = useState<string>("checking");
  const [pythonError, setPythonError] = useState<string>("");
  const [tsCoreAvailable, setTsCoreAvailable] = useState(false);
  const isMac = window.electronAPI?.platform === "darwin";

  useEffect(() => {
    const check = async () => {
      try {
        const status = await window.electronAPI.getPythonStatus();
        setPythonStatus(status.status);
        setPythonError(status.error || "");
      } catch {
        setPythonStatus("error");
      }
      try {
        const tools = await window.electronAPI.agent.listTools();
        setTsCoreAvailable(tools.length > 0);
      } catch {
        setTsCoreAvailable(false);
      }
    };
    check();
    const timer = setInterval(check, 5000);
    return () => clearInterval(timer);
  }, []);

  const isError = pythonStatus === "error";
  const isPythonOnline = pythonStatus === "running";
  const modeLabel = isPythonOnline ? "AI" : tsCoreAvailable ? "Core" : "离线";

  return (
    <div className="h-10 glass border-b border-glass-border flex items-center drag-region transition-colors duration-200 shrink-0">
      {isMac && <div className="w-20" />}

      <div className="flex items-center gap-3 px-4 flex-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent-400" />
          <span className="text-sm font-semibold gradient-text tracking-wide">
            OmniAgent
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 运行模式状态 */}
          <div className="flex items-center gap-1 group relative">
            <div
              className={`w-2 h-2 rounded-full ${
                isPythonOnline
                  ? "bg-emerald-500 animate-pulse-glow shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                  : pythonStatus === "starting"
                  ? "bg-amber-500 animate-pulse"
                  : tsCoreAvailable
                  ? "bg-accent-400"
                  : "bg-red-500"
              }`}
            />
            <span className="text-[10px] text-neutral-500">
              {modeLabel}
            </span>

            {!isPythonOnline && tsCoreAvailable && (
              <div className="absolute top-full left-0 mt-2 w-72 glass-heavy rounded-xl p-3 shadow-2xl z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <div className="text-xs text-accent-400 font-medium mb-1">Core 模式</div>
                <div className="text-[11px] text-neutral-400 leading-relaxed">
                  TypeScript Agent Core 驱动，所有功能可用。启动 Python 后端可解锁数据栈能力。
                </div>
              </div>
            )}

            {isError && pythonError && (
              <div className="absolute top-full left-0 mt-2 w-80 glass-heavy rounded-xl p-3 shadow-2xl z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <div className="text-xs text-red-400 font-medium mb-1">后端错误</div>
                <div className="text-[11px] text-neutral-400 leading-relaxed break-all">{pythonError}</div>
                <div className="text-[10px] text-neutral-600 mt-2">Core 模式仍可用</div>
              </div>
            )}
          </div>

          {/* TypeScript Core 状态（仅 Python 模式下显示） */}
          {isPythonOnline && (
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-400" />
              <span className="text-[10px] text-neutral-600">Core</span>
            </div>
          )}
        </div>

        {isError && (
          <button
            onClick={async () => {
              try {
                await window.electronAPI.restartPython();
              } catch { /* ignore */ }
            }}
            className="no-drag flex items-center gap-1 px-2 py-1 rounded-md text-[10px] bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
            title="重启后端"
          >
            <RotateCcw className="w-3 h-3" /> 重试
          </button>
        )}
      </div>

      {!isMac && (
        <div className="flex items-center no-drag">
          <button
            onClick={() => window.electronAPI.minimizeWindow()}
            className="w-11 h-10 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <Minus className="w-4 h-4 text-neutral-400" />
          </button>
          <button
            onClick={() => window.electronAPI.maximizeWindow()}
            className="w-11 h-10 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <Square className="w-3.5 h-3.5 text-neutral-400" />
          </button>
          <button
            onClick={() => window.electronAPI.closeWindow()}
            className="w-11 h-10 flex items-center justify-center hover:bg-red-500 transition-colors group"
          >
            <X className="w-4 h-4 text-neutral-400 group-hover:text-white" />
          </button>
        </div>
      )}
    </div>
  );
}
