import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

interface Project {
  project_id: string;
  name: string;
  workspace_path: string;
  color: string;
}

const GRADIENTS = [
  "from-indigo-500 to-cyan-500",
  "from-violet-500 to-fuchsia-500",
  "from-emerald-500 to-teal-500",
  "from-rose-500 to-orange-500",
  "from-sky-500 to-indigo-500",
  "from-amber-500 to-rose-500",
  "from-lime-500 to-emerald-500",
  "from-pink-500 to-violet-500",
  "from-teal-500 to-cyan-500",
  "from-orange-500 to-amber-500",
  "from-blue-500 to-violet-500",
  "from-green-500 to-teal-500",
  "from-red-500 to-rose-500",
  "from-purple-500 to-pink-500",
  "from-cyan-500 to-blue-500",
  "from-gray-500 to-neutral-500",
];

interface Props {
  project: Project | null;
  open: boolean;
  onClose: () => void;
  onSave: (projectId: string, name: string, color: string) => void;
}

export function EditProjectDialog({ project, open, onClose, onSave }: Props) {
  const [name, setName] = useState(project?.name || "");
  const [selectedGradient, setSelectedGradient] = useState(project?.color || GRADIENTS[0]);

  useEffect(() => {
    if (open && project) {
      setName(project.name);
      setSelectedGradient(project.color || GRADIENTS[0]);
    }
  }, [open, project?.project_id]);

  if (!open || !project) return null;

  const handleSave = () => {
    const n = name.trim();
    if (!n) return;
    onSave(project.project_id, n, selectedGradient);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="编辑项目">
      <div className="p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-1.5">名称</label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-glass-border bg-white/5 text-gray-900 dark:text-neutral-100 text-sm focus:outline-none focus:border-accent-500/50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-2">颜色</label>
          <div className="grid grid-cols-8 gap-2">
            {GRADIENTS.map((gradient) => (
              <button
                key={gradient}
                type="button"
                onClick={() => setSelectedGradient(gradient)}
                className={`w-8 h-8 rounded-lg bg-gradient-br ${gradient} flex items-center justify-center transition-all ${
                  selectedGradient === gradient
                    ? "ring-2 ring-accent-400/50 ring-offset-2 ring-offset-surface-950 scale-110"
                    : "hover:scale-105"
                }`}
              >
                {selectedGradient === gradient && <Check className="w-4 h-4 text-white" />}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-neutral-500 truncate">
          路径: {project.workspace_path}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-neutral-400 hover:bg-white/10 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-4 py-2 rounded-lg text-sm btn-gradient text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            保存
          </button>
        </div>
      </div>
    </Modal>
  );
}
