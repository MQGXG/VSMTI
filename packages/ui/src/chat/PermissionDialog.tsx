import { Shield, AlertTriangle } from "lucide-react";
import { Modal } from "../components/ui/Modal";

interface Props {
  toolName: string;
  args: Record<string, unknown>;
  reason: string;
  onAllow: () => void;
  onDeny: () => void;
  onAlways?: () => void;
}

export function PermissionDialog({ toolName, args, reason, onAllow, onDeny, onAlways }: Props) {
  return (
    <Modal open={true} onClose={onDeny} maxWidth="max-w-md">
      <div className="px-6 pt-5 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255, 184, 0, 0.1)" }}>
            <Shield className="w-5 h-5" style={{ color: "#FFB800" }} />
          </div>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>权限请求</h2>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Agent 需要你的批准</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-3">
        <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: "rgba(255, 184, 0, 0.05)", border: "1px solid rgba(255, 184, 0, 0.1)" }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#FFB800" }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "#FFB800" }}>{reason}</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>工具</label>
          <div className="px-3 py-2 rounded-lg text-sm font-mono" style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text-primary)" }}>
            {toolName}
          </div>
        </div>

        {Object.keys(args).length > 0 && (
          <div className="space-y-2">
            <label className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>参数</label>
            <pre className="px-3 py-2 rounded-lg text-xs font-mono max-h-32 overflow-y-auto whitespace-pre-wrap custom-scrollbar" style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text-secondary)" }}>
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <div className="flex gap-2 px-6 pb-5 pt-2">
        <button
          onClick={onDeny}
          className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 hover:bg-black/5 dark:hover:bg-white/5"
          style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        >
          拒绝
        </button>
        {onAlways && (
          <button
            onClick={onAlways}
            className="px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
            style={{ border: "1px solid rgba(0, 217, 192, 0.3)", color: "#00D9C0", background: "rgba(0, 217, 192, 0.05)" }}
          >
            始终允许
          </button>
        )}
        <button
          onClick={onAllow}
          className="flex-1 px-4 py-2.5 rounded-lg btn-primary text-sm font-medium"
        >
          允许
        </button>
      </div>
    </Modal>
  );
}
