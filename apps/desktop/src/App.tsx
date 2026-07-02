import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChatWindow } from "@mira/ui/chat/ChatWindow";
import { Sidebar } from "@mira/ui/sidebar/Sidebar";
import { NewProjectDialog } from "@mira/ui/sidebar/NewProjectDialog";
import { EditProjectDialog } from "@mira/ui/sidebar/EditProjectDialog";
import { SettingsDialog } from "@mira/ui/sidebar/SettingsDialog";
import { Menu, Plus, Settings, Network } from "lucide-react";
import { GraphPanel } from "@mira/ui/memory/GraphPanel";

interface Project {
  project_id: string;
  name: string;
  workspace_path: string;
  color: string;
}

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState("");
  const [activeSession, setActiveSession] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const tsProjects = await window.electronAPI.ts.listProjects();
      if (tsProjects && tsProjects.length > 0) {
        const colorMap = JSON.parse(localStorage.getItem("project_colors") || "{}");
        const hidden = JSON.parse(localStorage.getItem("hidden_projects") || "[]") as string[];
        const mapped: Project[] = tsProjects
          .filter((p: any) => !hidden.includes(p.project_id))
          .map((p: any) => ({
            project_id: p.project_id,
            name: p.name,
            workspace_path: p.workspace_path,
            color: colorMap[p.project_id] || "#3b3b3b",
          }));
        setProjects(mapped);
        if (!activeProject) setActiveProject(mapped[0].project_id);
        return;
      }
    } catch { /* fallback */ }

    const defaultProject: Project = {
      project_id: "default", name: "默认项目",
      workspace_path: window.electronAPI.platform === "win32" ? "C:\\" : "/",
      color: "#3b3b3b",
    };
    try {
      const created = await window.electronAPI.ts.createProject(defaultProject.name, defaultProject.workspace_path);
      defaultProject.project_id = created.project_id;
    } catch { /* 静默 */ }
    setProjects([defaultProject]);
    if (!activeProject) setActiveProject(defaultProject.project_id);
  }, [activeProject]);

  useEffect(() => { loadProjects(); const timer = setInterval(loadProjects, 15000); return () => clearInterval(timer); }, [loadProjects]);
  useEffect(() => { if (!activeProject && projects.length > 0) setActiveProject(projects[0].project_id); }, [projects, activeProject]);

  // 恢复上次活跃会话
  useEffect(() => {
    if (activeProject) {
      const saved = localStorage.getItem("last_session_" + activeProject);
      if (saved) setActiveSession(saved);
    }
  }, [activeProject]);
  useEffect(() => {
    if (activeSession) localStorage.setItem("last_session_" + activeProject, activeSession);
  }, [activeSession, activeProject]);

  const handleProjectChange = useCallback((projectId: string) => {
    setActiveProject(projectId);
    setActiveSession("");
  }, []);

  const handleNewSession = async () => {
    if (!activeProject) return;
    try {
      const session = await window.electronAPI.ts.createSession(activeProject, "");
      if (session?.session_id) setActiveSession(session.session_id);
    } catch { /* ignore */ }
  };

  const handleOpenProject = async (name: string, workspacePath: string) => {
    try {
      await window.electronAPI.ts.createProject(name, workspacePath);
      await loadProjects();
      setNewProjectOpen(false);
    } catch { /* ignore */ }
  };

  const handleEditProject = async (projectId: string, name: string, color: string, _startupScript: string) => {
    try {
      await window.electronAPI.ts.updateProject(projectId, { name });
      const colorMap = JSON.parse(localStorage.getItem("project_colors") || "{}");
      colorMap[projectId] = color;
      localStorage.setItem("project_colors", JSON.stringify(colorMap));
      await loadProjects();
    } catch { /* ignore */ }
  };
  const handleDeleteProject = async (projectId: string) => {
    try {
      await window.electronAPI.ts.deleteProject(projectId);
      await loadProjects();
      if (activeProject === projectId) { setActiveProject(""); setActiveSession(""); }
    } catch { /* ignore */ }
  };

  return (
    <div className="h-screen flex flex-col" style={{ background: "var(--bg)", color: "var(--fg)" }}>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeProject={activeProject}
        activeSession={activeSession}
        projects={projects}
        onProjectChange={handleProjectChange}
        onSessionChange={setActiveSession}
        onNewSession={handleNewSession}
        onOpenProject={() => setNewProjectOpen(true)}
        onEditProject={setEditingProject}
        onDeleteProject={handleDeleteProject}
      />

      <div className="top-bar" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <button onClick={() => setSidebarOpen(true)} className="btn-ghost" style={{ padding: "0 8px" }} title="打开侧边栏">
          <Menu className="w-4 h-4" />
        </button>

        {/* 项目切换 */}
        <div className="flex items-center gap-1 ml-1">
          {projects.slice(0, 4).map((p) => (
            <button key={p.project_id} onClick={() => handleProjectChange(p.project_id)}
              className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: activeProject === p.project_id ? "var(--bg-secondary)" : "transparent",
                color: activeProject === p.project_id ? "var(--fg)" : "var(--fg-tertiary)",
              }}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
              <span className="max-w-[80px] truncate">{p.name}</span>
            </button>
          ))}
          {projects.length > 4 && (
            <button onClick={() => setSidebarOpen(true)} className="btn-ghost" style={{ fontSize: 11, padding: "0 6px", color: "var(--fg-tertiary)" }}>
              +{projects.length - 4}
            </button>
          )}
        </div>

        <div className="flex-1" />

        <button onClick={handleNewSession} className="btn-accent" title="新建会话">
          <Plus className="w-4 h-4" />
          <span>新建会话</span>
        </button>

        <div className="w-px h-5" style={{ background: "var(--border)" }} />

        <button onClick={() => setGraphOpen(true)} className="btn-ghost" title="知识图谱">
          <Network className="w-4 h-4" />
        </button>

        <button onClick={() => setSettingsOpen(true)} className="btn-ghost" title="设置">
          <Settings className="w-4 h-4" />
        </button>

        <div className="flex items-center no-drag">
          <button onClick={() => window.electronAPI.minimizeWindow()} className="btn-ghost" style={{ width: 36, padding: 0 }}>
            <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor" /></svg>
          </button>
          <button onClick={() => window.electronAPI.maximizeWindow()} className="btn-ghost" style={{ width: 36, padding: 0 }}>
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
          </button>
          <button onClick={() => window.electronAPI.closeWindow()} className="btn-ghost" style={{ width: 36, padding: 0, color: "var(--fg-tertiary)" }}>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.2" fill="none" /></svg>
          </button>
        </div>
      </div>

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <ChatWindow sessionId={activeSession} onSessionChange={setActiveSession} />
      </main>

      {settingsOpen && createPortal(<SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />, document.body)}
      {graphOpen && <GraphPanel open={graphOpen} onClose={() => setGraphOpen(false)} projectId={activeProject} projectName={projects.find(p => p.project_id === activeProject)?.name} />}
      <NewProjectDialog open={newProjectOpen} onClose={() => setNewProjectOpen(false)} onCreate={handleOpenProject} />
      <EditProjectDialog project={editingProject} open={!!editingProject} onClose={() => setEditingProject(null)} onSave={handleEditProject} onDelete={handleDeleteProject} />
    </div>
  );
}
