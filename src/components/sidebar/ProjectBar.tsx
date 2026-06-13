import { Plus, Pencil, Trash2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface Project {
  project_id: string;
  name: string;
  workspace_path: string;
  color: string;
}

interface Props {
  projects: Project[];
  activeProject: string;
  onProjectChange: (id: string) => void;
  onOpenProject: () => void;
  onEditProject: (project: Project) => void;
  onDeleteProject: (projectId: string) => void;
}

function getGradient(index: number): string {
  const gradients = [
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
  ];
  return gradients[Math.abs(index) % gradients.length];
}

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const first = trimmed[0];
  const second = trimmed[1];
  if (second && /[a-zA-Z0-9\u4e00-\u9fff]/.test(second)) {
    return (first + second).toUpperCase();
  }
  return first.toUpperCase();
}

export function ProjectBar({
  projects,
  activeProject,
  onProjectChange,
  onOpenProject,
  onEditProject,
  onDeleteProject,
}: Props) {
  const [contextMenu, setContextMenu] = useState<{
    project: Project;
    x: number;
    y: number;
    index: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, project: Project, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ project, x: e.clientX, y: e.clientY, index });
  };

  return (
    <div className="w-14 border-r border-glass-border flex flex-col items-center py-3 gap-3 bg-surface-950/50 relative">
      {projects.map((project, index) => {
        const isActive = activeProject === project.project_id;
        const gradient = getGradient(index);
        return (
          <button
            key={project.project_id}
            onClick={() => onProjectChange(project.project_id)}
            onContextMenu={(e) => handleContextMenu(e, project, index)}
            title={`${project.name}\n${project.workspace_path}`}
            className={`relative w-10 h-10 rounded-xl flex items-center justify-center text-white font-semibold text-sm shadow-sm transition-all duration-200 bg-gradient-br ${gradient} ${
              isActive
                ? "ring-2 ring-accent-400/50 ring-offset-2 ring-offset-surface-950 scale-105 glow-sm"
                : "hover:scale-105 opacity-80 hover:opacity-100 hover:shadow-lg"
            }`}
          >
            {getInitials(project.name)}
            {isActive && (
              <span className="absolute -right-1 -top-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-surface-950 animate-pulse-glow" />
            )}
          </button>
        );
      })}

      <button
        onClick={onOpenProject}
        title="打开项目"
        className="w-10 h-10 rounded-xl flex items-center justify-center text-neutral-500 hover:text-accent-400 hover:bg-white/5 border border-dashed border-neutral-600/50 transition-colors mt-auto"
      >
        <Plus className="w-5 h-5" />
      </button>

      {contextMenu && (
        <div
          ref={menuRef}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 min-w-[140px] glass-heavy rounded-xl shadow-2xl py-1 animate-scale-in"
        >
          <button
            onClick={() => {
              onEditProject(contextMenu.project);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-200 hover:bg-white/10 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            编辑
          </button>
          <div className="my-1 border-t border-glass-border" />
          <button
            onClick={() => {
              onDeleteProject(contextMenu.project.project_id);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-white/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            删除
          </button>
        </div>
      )}
    </div>
  );
}
