import { useState, useEffect } from "react";
import { FileText, Terminal } from "lucide-react";
import { ConfigService } from "../services/config.service";

export function ConfigSourceIndicator() {
  const [info, setInfo] = useState<{ apiKeyFrom: string; show: boolean }>({ apiKeyFrom: "none", show: false });

  useEffect(() => {
    (async () => {
      try {
        const cfg = await ConfigService.get();
        if (cfg.apiKeyFrom !== "none") setInfo({ apiKeyFrom: cfg.apiKeyFrom, show: true });
      } catch { /* ignore */ }
    })();
  }, []);

  if (!info.show) return null;

  return (
    <div className="p-3 rounded-xl flex items-center gap-2" style={{ background: 'rgba(0, 217, 192, 0.05)', border: '1px solid rgba(0, 217, 192, 0.1)' }}>
      {info.apiKeyFrom === "env" ? <Terminal className="w-4 h-4" style={{ color: '#00D9C0' }} /> : <FileText className="w-4 h-4" style={{ color: '#00D9C0' }} />}
      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        API Key 来自 <span className="font-medium" style={{ color: 'var(--accent-start)' }}>{info.apiKeyFrom === "env" ? "环境变量" : "配置文件"}</span>
        ，无需在界面中填写
      </div>
    </div>
  );
}
