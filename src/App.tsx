import { useState, useEffect, useCallback, useRef } from "react";
import { TitleBar } from "./components/layout/TitleBar";
import { ChatWindow } from "./components/chat/ChatWindow";
import { Sidebar } from "./components/sidebar/Sidebar";
import { ProjectBar } from "./components/sidebar/ProjectBar";
import { NewProjectDialog } from "./components/sidebar/NewProjectDialog";
import { EditProjectDialog } from "./components/sidebar/EditProjectDialog";

interface Project {
  project_id: string;
  name: string;
  workspace_path: string;
  color: string;
}

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarAutoCollapsed, setSidebarAutoCollapsed] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState("");
  const [activeSession, setActiveSession] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const prevWidthRef = useRef(window.innerWidth);

  useEffect(() => {
    const BREAKPOINT = 1024;
    const handleResize = () => {
      const width = window.innerWidth;
      const prevWidth = prevWidthRef.current;
      prevWidthRef.current = width;
      if (width < BREAKPOINT && prevWidth >= BREAKPOINT) {
        setSidebarOpen(false);
        setSidebarAutoCollapsed(true);
      } else if (width >= BREAKPOINT && prevWidth < BREAKPOINT && sidebarAutoCollapsed) {
        setSidebarOpen(true);
        setSidebarAutoCollapsed(false);
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, [sidebarAutoCollapsed]);

  const loadProjects = useCallback(async () => {
    try {
      const tsProjects = await window.electronAPI.ts.listProjects();
      if (tsProjects && tsProjects.length > 0) {
        const mapped: Project[] = tsProjects.map((p: any, i: number) => ({
          project_id: p.project_id,
          name: p.name,
          workspace_path: p.workspace_path,
          color: `from-${['primary','accent','primary','accent','primary','accent'][i % 6]}-500 to-${['accent','primary','accent','primary','accent','primary'][i % 6]}-500`,
        }));
        setProjects(mapped);
        if (!activeProject) setActiveProject(mapped[0].project_id);
        return;
      }
    } catch { /* fallback */ }

    // 没有已保存的项目 → 创建默认
    const defaultProject: Project = {
      project_id: "default",
      name: "默认项目",
      workspace_path: window.electronAPI.platform === "win32" ? "C:\\" : "/",
      color: "from-primary-500 to-accent-500",
    };
    try {
      const created = await window.electronAPI.ts.createProject(defaultProject.name, defaultProject.workspace_path);
      defaultProject.project_id = created.project_id;
    } catch { /* 静默 */ }
    setProjects([defaultProject]);
    if (!activeProject) setActiveProject(defaultProject.project_id);
  }, [activeProject]);

  useEffect(() => {
    loadProjects();
    const timer = setInterval(loadProjects, 15000);
    return () => clearInterval(timer);
  }, [loadProjects]);

  useEffect(() => {
    if (!activeProject && projects.length > 0) {
      setActiveProject(projects[0].project_id);
    }
  }, [projects, activeProject]);

  const handleProjectChange = async (projectId: string) => {
    setActiveProject(projectId);
    setActiveSession(""); // 重置会话，等 Sidebar 加载后自动选择
  };

  const handleNewSession = async () => {
    if (!activeProject) return;
    try {
      const session = await window.electronAPI.ts.createSession(activeProject, "");
      if (session?.session_id) setActiveSession(session.session_id);
    } catch (err) {
      console.error("新建会话失败:", err);
    }
  };

  const handleNewTask = async (title: string) => {
    if (!activeProject) return;
    try {
      const session = await window.electronAPI.ts.createSession(activeProject, title);
      if (session?.session_id) setActiveSession(session.session_id);
    } catch (err) {
      console.error("新建任务失败:", err);
    }
  };

  const handleOpenProject = async (name: string, workspacePath: string) => {
    try {
      await window.electronAPI.ts.createProject(name, workspacePath);
      await loadProjects();
      setNewProjectOpen(false);
    } catch (err) {
      console.error("打开项目失败:", err);
    }
  };

  const handleEditProject = async (_projectId: string, _name: string, _color: string) => {
    // 编辑项目功能待实现
    await loadProjects();
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      await window.electronAPI.ts.deleteProject(projectId);
      await loadProjects();
      if (activeProject === projectId) {
        setActiveProject("");
        setActiveSession("");
      }
    } catch (err) {
      console.error("删除项目失败:", err);
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#0A0F14', color: '#E8F4F0' }}>
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <ProjectBar
          projects={projects}
          activeProject={activeProject}
          onProjectChange={handleProjectChange}
          onOpenProject={() => setNewProjectOpen(true)}
          onEditProject={setEditingProject}
          onDeleteProject={handleDeleteProject}
        />
        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => { setSidebarOpen(!sidebarOpen); setSidebarAutoCollapsed(false); }}
          activeProject={activeProject}
          activeSession={activeSession}
          projects={projects}
          onSessionChange={setActiveSession}
          onNewSession={handleNewSession}
        />
        <main className="flex-1 overflow-hidden">
          <ChatWindow
            sessionId={activeSession}
            onSessionChange={setActiveSession}
          />
        </main>
      </div>
      <NewProjectDialog
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreate={handleOpenProject}
      />
      <EditProjectDialog
        project={editingProject}
        open={!!editingProject}
        onClose={() => setEditingProject(null)}
        onSave={handleEditProject}
      />
    </div>
  );
}
