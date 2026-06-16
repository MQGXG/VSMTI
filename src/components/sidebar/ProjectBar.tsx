import { Plus, FolderOpen } from "lucide-react";

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

const gradients = [
  "from-indigo-500 to-cyan-500", "from-violet-500 to-fuchsia-500",
  "from-emerald-500 to-teal-500", "from-rose-500 to-orange-500",
  "from-sky-500 to-indigo-500", "from-amber-500 to-rose-500",
  "from-lime-500 to-emerald-500", "from-pink-500 to-violet-500",
  "from-teal-500 to-cyan-500", "from-orange-500 to-amber-500",
  "from-blue-500 to-violet-500", "from-green-500 to-teal-500",
  "from-red-500 to-rose-500", "from-purple-500 to-pink-500",
  "from-cyan-500 to-blue-500",
];

export function ProjectBar({ projects, activeProject, onProjectChange, onOpenProject }: Props) {
  return (
    <div className="w-12 flex flex-col items-center py-2 gap-1" style={{ background: 'var(--surface)', borderRight: '1px solid var(--border-light)' }}>
      {projects.map((project, index) => {
        const isActive = activeProject === project.project_id;
        return (
          <div key={project.project_id} className="relative group">
            <button onClick={() => onProjectChange(project.project_id)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-[11px] font-bold transition-all bg-gradient-br ${gradients[index % gradients.length]} ${
                isActive ? 'ring-2 ring-offset-1 scale-105 ring-accent-500/50 ring-offset-surface-950' : 'opacity-70 hover:opacity-100 hover:scale-105'
              }`}
              title={project.name}>
              {project.name[0].toUpperCase()}
            </button>
            {/* Tooltip */}
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap">
              <div className="px-2.5 py-1.5 rounded-lg text-xs shadow-lg" style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <div className="font-medium">{project.name}</div>
                <div className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                  <FolderOpen className="w-2.5 h-2.5" />
                  {project.workspace_path}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <button onClick={onOpenProject} title="添加项目"
        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors mt-1"
        style={{ color: 'var(--text-tertiary)', border: '1px dashed var(--border)' }}>
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
