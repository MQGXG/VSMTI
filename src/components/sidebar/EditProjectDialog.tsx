import { useState, useEffect } from "react";
import { X, Check } from "lucide-react";

interface Project {
  project_id: string;
  name: string;
  workspace_path: string;
  color: string;
}

const COLORS = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-sky-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-fuchsia-500",
  "bg-pink-500",
  "bg-red-500",
  "bg-lime-500",
  "bg-neutral-700",
];

interface Props {
  project: Project | null;
  open: boolean;
  onClose: () => void;
  onSave: (projectId: string, name: string, color: string) => void;
}

export function EditProjectDialog({ project, open, onClose, onSave }: Props) {
  const [name, setName] = useState(project?.name || "");
  const [selectedColor, setSelectedColor] = useState(project?.color || COLORS[7]);

  useEffect(() => {
    if (open && project) {
      setName(project.name);
      setSelectedColor(project.color || COLORS[7]);
    }
  }, [open, project?.project_id]);

  if (!open || !project) return null;

  const handleSave = () => {
    const n = name.trim();
    if (!n) return;
    onSave(project.project_id, n, selectedColor);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 shadow-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-neutral-100">编辑项目</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-500 dark:text-neutral-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1.5">
              名称
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-gray-900 dark:text-neutral-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-2">
              颜色
            </label>
            <div className="grid grid-cols-8 gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center transition-all ${
                    selectedColor === color
                      ? "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-neutral-900 ring-gray-400 dark:ring-neutral-400 scale-110"
                      : "hover:scale-105"
                  }`}
                >
                  {selectedColor === color && <Check className="w-4 h-4 text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-gray-500 dark:text-neutral-500 truncate">
            路径: {project.workspace_path}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-4 py-2 rounded-lg text-sm bg-neutral-200 dark:bg-neutral-100 hover:bg-white text-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
