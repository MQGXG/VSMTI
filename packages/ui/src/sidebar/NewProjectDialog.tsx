import { useState, useEffect } from "react";
import { Folder, Plus } from "lucide-react";
import { Modal } from "../ui/Modal";

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
    <Modal open={open} onClose={onClose} title="打开项目">
      <div className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5">
              项目文件夹
            </label>
            <button
              type="button"
              onClick={handleChooseDir}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-glass-border bg-white/5 text-sm text-left text-neutral-300 hover:border-accent-500/50 transition-colors"
            >
              <Folder className="w-4 h-4 text-accent-400 shrink-0" />
              <span className="truncate">{workspacePath || "选择项目文件夹"}</span>
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5">
              项目名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="项目名称"
              className="w-full px-3 py-2 rounded-lg border border-glass-border bg-white/5 text-neutral-900 dark:text-neutral-100 text-sm focus:outline-none focus:border-accent-500/50 placeholder-neutral-500"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-neutral-400 hover:bg-white/10 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm btn-gradient text-white"
            >
              <Plus className="w-4 h-4" />
              打开项目
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
