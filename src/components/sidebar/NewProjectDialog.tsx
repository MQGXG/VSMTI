import { useState, useEffect } from "react";
import { Folder, X, Plus } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, workspacePath: string) => void;
}

export function NewProjectDialog({ open, onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setWorkspacePath("");
      setError("");
    }
  }, [open]);

  if (!open) return null;

  const handleChooseDir = async () => {
    const dirs = await window.electronAPI.openDirectory?.();
    if (dirs && dirs.length > 0) {
      setWorkspacePath(dirs[0]);
      if (!name) {
        const parts = dirs[0].split(/[/\\]/);
        setName(parts[parts.length - 1] || "");
      }
      setError("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const ws = workspacePath.trim();
    if (!ws) {
      setError("请选择项目文件夹");
      return;
    }
    onCreate(n, ws);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-neutral-100">打开项目</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-500 dark:text-neutral-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1.5">
              项目文件夹
            </label>
            <button
              type="button"
              onClick={handleChooseDir}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm text-left text-gray-700 dark:text-neutral-300 hover:border-emerald-500/50 transition-colors"
            >
              <Folder className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="truncate">{workspacePath || "选择项目文件夹"}</span>
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1.5">
              项目名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="项目名称"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-gray-900 dark:text-neutral-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              <Plus className="w-4 h-4" />
              打开项目
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
