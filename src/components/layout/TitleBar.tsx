import { Minus, Square, X } from "lucide-react";
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

  return (
    <div className="h-10 bg-[#0d0d0d] border-b border-neutral-800 flex items-center drag-region">
      {isMac && <div className="w-20" />}

      <div className="flex items-center gap-3 px-4 flex-1">
        <span
          className="text-sm font-medium text-neutral-200 tracking-wide"
          style={{ fontFamily: "system-ui, sans-serif" }}
        >
          OmniAgent
        </span>
        <div className="flex items-center gap-1.5" title={pythonError}>
          <div
            className={`w-2 h-2 rounded-full ${
              pythonStatus === "running"
                ? "bg-emerald-500"
                : pythonStatus === "starting"
                ? "bg-amber-500 animate-pulse"
                : "bg-red-500"
            }`}
          />
          <span className="text-xs text-neutral-500">
            {pythonStatus === "running"
              ? "就绪"
              : pythonStatus === "starting"
              ? "启动中..."
              : pythonError
              ? "错误"
              : "离线"}
          </span>
        </div>
      </div>

      {!isMac && (
        <div className="flex items-center no-drag">
          <button
            onClick={() => window.electronAPI.minimizeWindow()}
            className="w-11 h-10 flex items-center justify-center hover:bg-neutral-800 transition-colors"
          >
            <Minus className="w-4 h-4 text-neutral-400" />
          </button>
          <button
            onClick={() => window.electronAPI.maximizeWindow()}
            className="w-11 h-10 flex items-center justify-center hover:bg-neutral-800 transition-colors"
          >
            <Square className="w-3.5 h-3.5 text-neutral-400" />
          </button>
          <button
            onClick={() => window.electronAPI.closeWindow()}
            className="w-11 h-10 flex items-center justify-center hover:bg-red-600 transition-colors group"
          >
            <X className="w-4 h-4 text-neutral-400 group-hover:text-white" />
          </button>
        </div>
      )}
    </div>
  );
}
