import { Minus, Square, X, Sparkles, Moon, Sun } from "lucide-react";
import { useState, useEffect } from "react";
import { useTheme } from "@/contexts/ThemeContext";

export function TitleBar() {
  const [tsCoreAvailable, setTsCoreAvailable] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const isMac = window.electronAPI?.platform === "darwin";

  useEffect(() => {
    window.electronAPI.agent.listTools().then((tools) => setTsCoreAvailable(tools.length > 0)).catch(() => {});
  }, []);

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <div className="h-10 flex items-center drag-region shrink-0" style={{ background: 'var(--titlebar-bg)', borderBottom: '1px solid var(--titlebar-border)' }}>
      {isMac && <div className="w-20" />}

      <div className="flex items-center gap-3 px-4 flex-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/20">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-bold brand-glow tracking-wide">Mira</span>
        </div>

        {tsCoreAvailable && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/10 border border-success/20">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] font-medium text-success">Core</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 px-2 no-drag">
        <button
          onClick={toggleTheme}
          className="w-8 h-8 flex items-center justify-center rounded-lg btn-ghost transition-all duration-200 hover:bg-primary-500/10"
          title={isDark ? "切换亮色模式" : "切换暗色模式"}
        >
          {isDark ? <Sun className="w-4 h-4 text-primary-400" /> : <Moon className="w-4 h-4 text-neutral-500" />}
        </button>
      </div>

      {!isMac && (
        <div className="flex items-center no-drag">
          <button onClick={() => window.electronAPI.minimizeWindow()} className="w-11 h-10 flex items-center justify-center btn-ghost rounded-none transition-colors hover:bg-neutral-700/50">
            <Minus className="w-4 h-4 text-neutral-400" />
          </button>
          <button onClick={() => window.electronAPI.maximizeWindow()} className="w-11 h-10 flex items-center justify-center btn-ghost rounded-none transition-colors hover:bg-neutral-700/50">
            <Square className="w-3.5 h-3.5 text-neutral-400" />
          </button>
          <button onClick={() => window.electronAPI.closeWindow()} className="w-11 h-10 flex items-center justify-center btn-ghost rounded-none transition-colors hover:!bg-error/20 hover:!text-error group">
            <X className="w-4 h-4 text-neutral-400 group-hover:text-error" />
          </button>
        </div>
      )}
    </div>
  );
}
