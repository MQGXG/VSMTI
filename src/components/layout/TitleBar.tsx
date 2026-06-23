import { Minus, Square, X, Moon, Sun } from "lucide-react";
import { useState, useEffect } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { MiraLogoSmall } from "@/components/chat/MiraLogo";

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
    <div className="h-10 flex items-center drag-region shrink-0" style={{ background: "var(--titlebar-bg)", borderBottom: "1px solid var(--titlebar-border)" }}>
      {isMac && <div className="w-20" />}

      <div className="flex items-center gap-2 px-4 flex-1">
        <MiraLogoSmall size={20} />
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Mira</span>

        {tsCoreAvailable && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.15)" }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--success)" }} />
            <span className="text-[10px] font-medium" style={{ color: "var(--success)" }}>Core</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 px-2 no-drag">
        <button
          onClick={toggleTheme}
          className="w-8 h-8 flex items-center justify-center rounded-md btn-ghost transition-all duration-200"
          title={isDark ? "切换亮色模式" : "切换暗色模式"}
        >
          {isDark ? <Sun className="w-4 h-4" style={{ color: "var(--text-secondary)" }} /> : <Moon className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />}
        </button>
      </div>

      {!isMac && (
        <div className="flex items-center no-drag">
          <button onClick={() => window.electronAPI.minimizeWindow()} className="w-11 h-10 flex items-center justify-center btn-ghost rounded-none transition-colors hover:bg-black/5 dark:hover:bg-white/5">
            <Minus className="w-4 h-4" style={{ color: "var(--text-tertiary)" }} />
          </button>
          <button onClick={() => window.electronAPI.maximizeWindow()} className="w-11 h-10 flex items-center justify-center btn-ghost rounded-none transition-colors hover:bg-black/5 dark:hover:bg-white/5">
            <Square className="w-3.5 h-3.5" style={{ color: "var(--text-tertiary)" }} />
          </button>
          <button onClick={() => window.electronAPI.closeWindow()} className="w-11 h-10 flex items-center justify-center btn-ghost rounded-none transition-colors hover:bg-red-500/10 hover:text-red-500 group">
            <X className="w-4 h-4" style={{ color: "var(--text-tertiary)" }} />
          </button>
        </div>
      )}
    </div>
  );
}
