import { Shield, AlertTriangle } from "lucide-react";

interface Props {
  toolName: string;
  args: Record<string, unknown>;
  reason: string;
  onAllow: () => void;
  onDeny: () => void;
}

export function PermissionDialog({ toolName, args, reason, onAllow, onDeny }: Props) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-neutral-700 w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* 头部 */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-3 border-b border-gray-100 dark:border-neutral-800">
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-neutral-100">权限请求</h2>
            <p className="text-xs text-gray-500 dark:text-neutral-400">Agent 需要你的批准</p>
          </div>
        </div>

        {/* 内容 */}
        <div className="px-6 py-4 space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{reason}</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500 dark:text-neutral-400 uppercase tracking-wide">工具</label>
            <div className="px-3 py-2 bg-gray-50 dark:bg-neutral-800 rounded-lg text-sm font-mono text-gray-900 dark:text-neutral-200">
              {toolName}
            </div>
          </div>

          {Object.keys(args).length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500 dark:text-neutral-400 uppercase tracking-wide">参数</label>
              <pre className="px-3 py-2 bg-gray-50 dark:bg-neutral-800 rounded-lg text-xs font-mono text-gray-700 dark:text-neutral-300 max-h-32 overflow-y-auto whitespace-pre-wrap">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* 按钮 */}
        <div className="flex gap-2 px-6 pb-5 pt-2">
          <button
            onClick={onDeny}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-neutral-600 text-sm font-medium text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
          >
            拒绝
          </button>
          <button
            onClick={onAllow}
            className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-sm font-medium text-white transition-colors"
          >
            允许
          </button>
        </div>
      </div>
    </div>
  );
}
