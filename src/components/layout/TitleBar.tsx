import { Minus, Square, X, Sparkles, Moon, Sun } from "lucide-react";
import { useState, useEffect } from "react";

export function TitleBar() {
  const [tsCoreAvailable, setTsCoreAvailable] = useState(false);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  const isMac = window.electronAPI?.platform === "darwin";

  useEffect(() => {
    window.electronAPI.agent.listTools().then((tools) => setTsCoreAvailable(tools.length > 0)).catch(() => {});
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  return (
    <div className="h-10 flex items-center drag-region shrink-0" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border-light)' }}>
      {isMac && <div className="w-20" />}

      <div className="flex items-center gap-3 px-4 flex-1">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-white" />
          </div>
          <span className="text-sm font-semibold gradient-text tracking-wide">Mira</span>
        </div>

        {tsCoreAvailable && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-tertiary)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Core</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 px-2 no-drag">
        <button
          onClick={toggleTheme}
          className="w-7 h-7 flex items-center justify-center rounded-md btn-ghost"
          title={isDark ? "切换亮色模式" : "切换暗色模式"}
        >
          {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>
      </div>

      {!isMac && (
        <div className="flex items-center no-drag">
          <button onClick={() => window.electronAPI.minimizeWindow()} className="w-11 h-10 flex items-center justify-center btn-ghost rounded-none">
            <Minus className="w-4 h-4" />
          </button>
          <button onClick={() => window.electronAPI.maximizeWindow()} className="w-11 h-10 flex items-center justify-center btn-ghost rounded-none">
            <Square className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => window.electronAPI.closeWindow()} className="w-11 h-10 flex items-center justify-center btn-ghost rounded-none hover:!bg-red-500 hover:!text-white group">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
