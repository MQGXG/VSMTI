import { useState, useEffect, useRef } from "react";
import { Check, Upload, Trash2, FolderOpen } from "lucide-react";
import { Modal } from "../ui/Modal";

interface Project {
  project_id: string;
  name: string;
  workspace_path: string;
  color: string;
}

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#64748b", "#78716c",
];

interface Props {
  project: Project | null;
  open: boolean;
  onClose: () => void;
  onSave: (projectId: string, name: string, color: string, startupScript: string) => void;
  onDelete: (projectId: string) => void;
}

export function EditProjectDialog({ project, open, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState(project?.name || "");
  const [selectedColor, setSelectedColor] = useState(project?.color || COLORS[0]);
  const [startupScript, setStartupScript] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && project) {
      setName(project.name);
      setSelectedColor(project.color || COLORS[0]);
      // 从 localStorage 读取启动脚本
      const scripts = JSON.parse(localStorage.getItem("project_scripts") || "{}");
      setStartupScript(scripts[project.project_id] || "");
    }
  }, [open, project?.project_id]);

  if (!open || !project) return null;

  const handleSave = () => {
    const n = name.trim();
    if (!n) return;
    // 保存启动脚本到 localStorage
    const scripts = JSON.parse(localStorage.getItem("project_scripts") || "{}");
    scripts[project.project_id] = startupScript;
    localStorage.setItem("project_scripts", JSON.stringify(scripts));
    onSave(project.project_id, n, selectedColor, startupScript);
    onClose();
  };

  const handleDelete = () => {
    if (window.confirm(`确定要删除项目「${project.name}」吗？\n\n注意：这只会删除 Mira 中的记录，不会删除本地文件。`)) {
      onDelete(project.project_id);
      onClose();
    }
  };

  const handleIconClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // 存储为 base64
      const icons = JSON.parse(localStorage.getItem("project_icons") || "{}");
      icons[project.project_id] = reader.result;
      localStorage.setItem("project_icons", JSON.stringify(icons));
    };
    reader.readAsDataURL(file);
  };

  const savedIcons = JSON.parse(localStorage.getItem("project_icons") || "{}");
  const iconData = savedIcons[project.project_id];

  return (
    <Modal open={open} onClose={onClose} title="编辑项目">
      <div className="p-6 space-y-5">
        {/* 名称 */}
        <div>
          <label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>名称</label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-all duration-200"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}
          />
        </div>

        {/* 图标 */}
        <div>
          <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>图标</label>
          <div className="flex items-center gap-3">
            <button
              onClick={handleIconClick}
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold transition-all duration-200 hover:scale-105 relative group"
              style={{ background: selectedColor }}
              title="点击上传图标"
            >
              {iconData ? (
                <img src={iconData} alt="icon" className="w-full h-full object-cover rounded-xl" />
              ) : (
                name?.[0]?.toUpperCase() || "?"
              )}
              <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Upload className="w-4 h-4 text-white" />
              </div>
            </button>
            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              点击或拖拽图片<br />建议：128x128px
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>

        {/* 颜色 */}
        <div>
          <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>颜色</label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setSelectedColor(color)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold transition-all duration-200 hover:scale-105"
                style={{
                  background: color,
                  boxShadow: selectedColor === color ? `0 0 0 2px var(--surface-elevated), 0 0 0 4px ${color}` : undefined,
                }}
              >
                {selectedColor === color && <Check className="w-3 h-3" />}
              </button>
            ))}
          </div>
        </div>

        {/* 工作区启动脚本 */}
        <div>
          <label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>工作区启动脚本</label>
          <input
            type="text"
            value={startupScript}
            onChange={(e) => setStartupScript(e.target.value)}
            placeholder="例如 bun install"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-all duration-200"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}
          />
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
            在创建新的工作区 (worktree) 后运行。
          </p>
        </div>

        {/* 路径 */}
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <FolderOpen className="w-3.5 h-3.5" />
          <span className="truncate">{project.workspace_path}</span>
        </div>

        {/* 按钮组 */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-red-500/10"
            style={{ color: 'var(--error)' }}
          >
            <Trash2 className="w-4 h-4" />
            删除项目
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="px-4 py-2 rounded-lg text-sm btn-primary text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
