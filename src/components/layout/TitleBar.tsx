import { Minus, Square, X, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";

export function TitleBar() {
  const [tsCoreAvailable, setTsCoreAvailable] = useState(false);
  const isMac = window.electronAPI?.platform === "darwin";

  useEffect(() => {
    try {
      window.electronAPI.agent.listTools().then((tools) => setTsCoreAvailable(tools.length > 0));
    } catch {
      setTsCoreAvailable(false);
    }
  }, []);

  return (
    <div className="h-10 glass border-b border-glass-border flex items-center drag-region transition-colors duration-200 shrink-0">
      {isMac && <div className="w-20" />}

      <div className="flex items-center gap-3 px-4 flex-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent-400" />
          <span className="text-sm font-semibold gradient-text tracking-wide">
            Mira
          </span>
        </div>

        {tsCoreAvailable && (
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-400" />
            <span className="text-[10px] text-neutral-500">Core</span>
          </div>
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
