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
  "from-primary-500 to-accent-500",
  "from-primary-600 to-accent-400",
  "from-primary-400 to-accent-600",
  "from-primary-500 to-primary-700",
  "from-accent-500 to-primary-500",
  "from-primary-300 to-accent-500",
];

export function ProjectBar({ projects, activeProject, onProjectChange, onOpenProject }: Props) {
  return (
    <div className="w-12 flex flex-col items-center py-3 gap-2" style={{ background: '#0A0F14', borderRight: '1px solid #15252A' }}>
      {projects.map((project, index) => {
        const isActive = activeProject === project.project_id;
        return (
          <div key={project.project_id} className="relative group">
            <button onClick={() => onProjectChange(project.project_id)}
              className={`w-8 h-8 rounded-xl flex items-center justify-center text-white text-[11px] font-bold transition-all duration-200 bg-gradient-to-br ${gradients[index % gradients.length]} ${
                isActive ? 'ring-2 ring-primary-500/50 scale-110 shadow-lg shadow-primary-500/20' : 'opacity-60 hover:opacity-100 hover:scale-105'
              }`}
              title={project.name}>
              {project.name[0].toUpperCase()}
            </button>
            {/* Tooltip */}
            <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap">
              <div className="px-3 py-2 rounded-xl text-xs shadow-glass-lg" style={{ background: '#0F1A20', border: '1px solid #1A2E35', color: '#E8F4F0' }}>
                <div className="font-medium">{project.name}</div>
                <div className="text-[10px] flex items-center gap-1.5 mt-1" style={{ color: '#5C8D8A' }}>
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
        style={{ color: '#5C8D8A', border: '1px dashed #1A2E35' }}>
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
