import { Minus, Square, X, RotateCcw } from "lucide-react";
import { useState, useEffect } from "react";

export function TitleBar() {
  const [pythonStatus, setPythonStatus] = useState<string>("checking");
  const [pythonError, setPythonError] = useState<string>("");
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
    };
    check();
    const timer = setInterval(check, 5000);
    return () => clearInterval(timer);
  }, []);

  const isError = pythonStatus === "error";

  return (
    <div className="h-10 bg-gray-100 dark:bg-[#0d0d0d] border-b border-gray-200 dark:border-neutral-800 flex items-center drag-region transition-colors duration-200">
      {isMac && <div className="w-20" />}

      <div className="flex items-center gap-3 px-4 flex-1">
        <span
          className="text-sm font-medium text-gray-800 dark:text-neutral-200 tracking-wide"
          style={{ fontFamily: "system-ui, sans-serif" }}
        >
          OmniAgent
        </span>

        <div className="flex items-center gap-1.5 group relative">
          <div
            className={`w-2 h-2 rounded-full ${
              pythonStatus === "running"
                ? "bg-emerald-500"
                : pythonStatus === "starting"
                ? "bg-amber-500 animate-pulse"
                : "bg-red-500"
            }`}
          />
          <span className="text-xs text-gray-500 dark:text-neutral-500">
            {pythonStatus === "running"
              ? "就绪"
              : pythonStatus === "starting"
              ? "启动中..."
              : isError
              ? "后端错误"
              : "离线"}
          </span>

          {/* 错误提示浮层 */}
          {isError && pythonError && (
            <div className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-neutral-900 border border-red-500/30 rounded-xl p-3 shadow-2xl z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="text-xs text-red-500 dark:text-red-400 font-medium mb-1">后端启动失败</div>
              <div className="text-[11px] text-gray-500 dark:text-neutral-400 leading-relaxed break-all">{pythonError}</div>
              <div className="text-[10px] text-gray-400 dark:text-neutral-600 mt-2">按 Ctrl+Shift+I 打开控制台查看详细日志</div>
            </div>
          )}
        </div>

        {isError && (
          <button
            onClick={async () => {
              try {
                await window.electronAPI.restartPython();
              } catch {
                /* ignore */
              }
            }}
            className="no-drag flex items-center gap-1 px-2 py-1 rounded-md text-[10px] bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
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
            className="w-11 h-10 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-neutral-800 transition-colors"
          >
            <Minus className="w-4 h-4 text-gray-500 dark:text-neutral-400" />
          </button>
          <button
            onClick={() => window.electronAPI.maximizeWindow()}
            className="w-11 h-10 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-neutral-800 transition-colors"
          >
            <Square className="w-3.5 h-3.5 text-gray-500 dark:text-neutral-400" />
          </button>
          <button
            onClick={() => window.electronAPI.closeWindow()}
            className="w-11 h-10 flex items-center justify-center hover:bg-red-500 transition-colors group"
          >
            <X className="w-4 h-4 text-gray-500 dark:text-neutral-400 group-hover:text-white" />
          </button>
        </div>
      )}
    </div>
  );
}
