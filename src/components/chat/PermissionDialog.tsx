import { Shield, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

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
      <div className="px-6 pt-5 pb-3 border-b border-glass-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">权限请求</h2>
            <p className="text-xs text-neutral-500">Agent 需要你的批准</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-3">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-300">{reason}</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide">工具</label>
          <div className="px-3 py-2 bg-white/5 rounded-lg text-sm font-mono text-neutral-200">
            {toolName}
          </div>
        </div>

        {Object.keys(args).length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide">参数</label>
            <pre className="px-3 py-2 bg-white/5 rounded-lg text-xs font-mono text-neutral-300 max-h-32 overflow-y-auto whitespace-pre-wrap">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <div className="flex gap-2 px-6 pb-5 pt-2">
        <button
          onClick={onDeny}
          className="flex-1 px-4 py-2.5 rounded-xl border border-glass-border text-sm font-medium text-neutral-300 hover:bg-white/10 transition-colors"
        >
          拒绝
        </button>
        {onAlways && (
          <button
            onClick={onAlways}
            className="px-4 py-2.5 rounded-xl border border-emerald-500/30 text-sm font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors"
          >
            始终允许
          </button>
        )}
        <button
          onClick={onAllow}
          className="flex-1 px-4 py-2.5 rounded-xl btn-gradient text-sm font-medium text-white"
        >
          允许
        </button>
      </div>
    </Modal>
  );
}
