import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string) => void;
  projectName?: string;
}

export function NewTaskDialog({ open, onClose, onCreate, projectName }: Props) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setTitle("");
      setError("");
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) {
      setError("请输入任务名称");
      return;
    }
    onCreate(t);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-neutral-100">新建任务</h2>
          {projectName && (
            <p className="text-xs text-neutral-500">项目: {projectName}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5">任务名称</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：编写登录接口"
              className="w-full px-3 py-2 rounded-lg border border-glass-border bg-white/5 text-gray-900 dark:text-neutral-100 text-sm focus:outline-none focus:border-accent-500/50 placeholder-neutral-500"
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
              创建任务
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
