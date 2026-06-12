import { Plus, Pencil, Trash2, X } from "lucide-react";
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

function stringToColor(str: string): string {
  const colors = [
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
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const first = trimmed[0];
  const second = trimmed[1];
  if (second && /[a-zA-Z]/.test(second)) {
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

  const handleContextMenu = (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ project, x: e.clientX, y: e.clientY });
  };

  return (
    <div className="w-14 border-r border-gray-200 dark:border-neutral-800 flex flex-col items-center py-3 gap-3 bg-gray-50 dark:bg-neutral-950/50 relative">
      {projects.map((project) => {
        const isActive = activeProject === project.project_id;
        const colorClass = project.color || stringToColor(project.project_id);
        return (
          <button
            key={project.project_id}
            onClick={() => onProjectChange(project.project_id)}
            onContextMenu={(e) => handleContextMenu(e, project)}
            title={`${project.name}\n${project.workspace_path}`}
            className={`relative w-10 h-10 rounded-xl flex items-center justify-center text-white font-semibold text-sm shadow-sm transition-all ${
              isActive
                ? `ring-2 ring-offset-2 ring-offset-gray-50 dark:ring-offset-neutral-950 ring-white dark:ring-neutral-600 scale-105 ${colorClass}`
                : `hover:scale-105 opacity-80 hover:opacity-100 ${colorClass}`
            }`}
          >
            {getInitials(project.name)}
            {isActive && (
              <span className="absolute -right-1 -top-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-gray-50 dark:border-neutral-950" />
            )}
          </button>
        );
      })}

      <button
        onClick={onOpenProject}
        title="打开项目"
        className="w-10 h-10 rounded-xl flex items-center justify-center text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 border border-dashed border-neutral-600 transition-colors mt-auto"
      >
        <Plus className="w-5 h-5" />
      </button>

      {contextMenu && (
        <div
          ref={menuRef}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 min-w-[140px] rounded-lg bg-neutral-900 border border-neutral-700 shadow-xl py-1 animate-in fade-in zoom-in-95 duration-100"
        >
          <button
            onClick={() => {
              onEditProject(contextMenu.project);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            编辑
          </button>
          <button
            onClick={() => {
              onProjectChange(contextMenu.project.project_id);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            <span className="w-3.5 h-3.5 flex items-center justify-center text-xs">●</span>
            启用工作区
          </button>
          <div className="my-1 border-t border-neutral-700" />
          <button
            onClick={() => {
              onDeleteProject(contextMenu.project.project_id);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-neutral-800 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            删除
          </button>
        </div>
      )}
    </div>
  );
}
