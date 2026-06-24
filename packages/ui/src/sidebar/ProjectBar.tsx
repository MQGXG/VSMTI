import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, FolderOpen, Upload } from "lucide-react";

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

const SOLID_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#64748b", "#78716c",
];

function getInitial(name: string): string {
  return name?.[0]?.toUpperCase() || "?";
}

export function ProjectBar({ projects, activeProject, onProjectChange, onOpenProject, onEditProject, onDeleteProject }: Props) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; project: Project } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, project });
  }, []);

  return (
    <div className="w-12 flex flex-col items-center py-3 gap-2" style={{ background: 'var(--surface)', borderRight: '1px solid var(--sidebar-border)' }}>
      {projects.map((project) => {
        const isActive = activeProject === project.project_id;
        const bgColor = project.color || SOLID_COLORS[0];
        const icons = JSON.parse(localStorage.getItem("project_icons") || "{}");
        const iconData = icons[project.project_id];
        return (
          <div key={project.project_id} className="relative group">
            <button
              onClick={() => onProjectChange(project.project_id)}
              onContextMenu={(e) => handleContextMenu(e, project)}
              className={`w-8 h-8 rounded-xl flex items-center justify-center text-white text-[11px] font-bold transition-all duration-200 overflow-hidden ${
                isActive ? 'ring-2 ring-primary-500/50 scale-110 shadow-lg' : 'opacity-70 hover:opacity-100 hover:scale-105'
              }`}
              style={{ background: iconData ? undefined : bgColor }}
              title={project.name}
            >
              {iconData ? (
                <img src={iconData} alt="" className="w-full h-full object-cover" />
              ) : (
                getInitial(project.name)
              )}
            </button>
            {/* Tooltip */}
            <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap">
              <div className="px-3 py-2 rounded-xl text-xs shadow-glass-lg" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <div className="font-medium">{project.name}</div>
                <div className="text-[10px] flex items-center gap-1.5 mt-1" style={{ color: 'var(--text-secondary)' }}>
                  <FolderOpen className="w-2.5 h-2.5" />
                  {project.workspace_path}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <button onClick={onOpenProject} title="添加项目"
        className="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 mt-1 hover:bg-primary-500/10 hover:border-primary-500/30"
        style={{ color: 'var(--text-secondary)', border: '1px dashed var(--border)' }}>
        <Plus className="w-4 h-4" />
      </button>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-[100] rounded-xl overflow-hidden shadow-glass-lg animate-scale-in"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border)',
            minWidth: '140px',
          }}
        >
          <button
            onClick={() => { onEditProject(contextMenu.project); setContextMenu(null); }}
            className="w-full text-left px-4 py-2.5 text-sm transition-colors"
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--btn-ghost-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            编辑
          </button>
          <button
            onClick={() => setContextMenu(null)}
            className="w-full text-left px-4 py-2.5 text-sm transition-colors"
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--btn-ghost-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            启用工作区
          </button>
          <button
            onClick={() => setContextMenu(null)}
            className="w-full text-left px-4 py-2.5 text-sm transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--btn-ghost-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            清除通知
          </button>
          <div style={{ borderTop: '1px solid var(--border)' }} />
          <button
            onClick={() => {
              const hidden = JSON.parse(localStorage.getItem("hidden_projects") || "[]");
              hidden.push(contextMenu.project.project_id);
              localStorage.setItem("hidden_projects", JSON.stringify(hidden));
              setContextMenu(null);
              window.location.reload();
            }}
            className="w-full text-left px-4 py-2.5 text-sm transition-colors"
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--btn-ghost-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            关闭
          </button>
        </div>
      )}
    </div>
  );
}
