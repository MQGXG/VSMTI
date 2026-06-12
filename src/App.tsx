import { useState, useEffect, useCallback } from "react";
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState("");
  const [activeSession, setActiveSession] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const status = await window.electronAPI.getPythonStatus();
      if (status.status !== "running") return;
      const res = await fetch(`${status.url}/api/projects`);
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err) {
      console.error("加载项目失败:", err);
    }
  }, []);

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
    try {
      const status = await window.electronAPI.getPythonStatus();
      if (status.status !== "running") return;

      await fetch(`${status.url}/api/projects/${encodeURIComponent(projectId)}/switch`, {
        method: "POST",
      });

      const res = await fetch(`${status.url}/api/projects/${encodeURIComponent(projectId)}/sessions`);
      const data = await res.json();
      const list = data.sessions || [];
      if (list.length > 0) {
        setActiveSession(list[0].session_id);
      } else {
        const createRes = await fetch(`${status.url}/api/projects/${encodeURIComponent(projectId)}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "" }),
        });
        const createData = await createRes.json();
        if (createData.session?.session_id) {
          setActiveSession(createData.session.session_id);
        }
      }
    } catch (err) {
      console.error("切换项目失败:", err);
    }
  };

  const handleNewSession = async () => {
    if (!activeProject) return;
    try {
      const status = await window.electronAPI.getPythonStatus();
      if (status.status !== "running") return;
      const res = await fetch(`${status.url}/api/projects/${encodeURIComponent(activeProject)}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "" }),
      });
      const data = await res.json();
      if (data.session?.session_id) {
        setActiveSession(data.session.session_id);
      }
    } catch (err) {
      console.error("新建会话失败:", err);
    }
  };

  const handleNewTask = async (title: string) => {
    if (!activeProject) return;
    try {
      const status = await window.electronAPI.getPythonStatus();
      if (status.status !== "running") return;
      const res = await fetch(`${status.url}/api/projects/${encodeURIComponent(activeProject)}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (data.session?.session_id) {
        setActiveSession(data.session.session_id);
      }
    } catch (err) {
      console.error("新建任务失败:", err);
    }
  };

  const handleOpenProject = async (name: string, workspacePath: string) => {
    try {
      const status = await window.electronAPI.getPythonStatus();
      if (status.status !== "running") return;
      const res = await fetch(`${status.url}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, workspace_path: workspacePath }),
      });
      const data = await res.json();
      if (data.project?.project_id) {
        await loadProjects();
        await handleProjectChange(data.project.project_id);
      }
      setNewProjectOpen(false);
    } catch (err) {
      console.error("打开项目失败:", err);
    }
  };

  const handleEditProject = async (projectId: string, name: string, color: string) => {
    try {
      const status = await window.electronAPI.getPythonStatus();
      if (status.status !== "running") return;
      await fetch(`${status.url}/api/projects/${encodeURIComponent(projectId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
      await loadProjects();
    } catch (err) {
      console.error("更新项目失败:", err);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      const status = await window.electronAPI.getPythonStatus();
      if (status.status !== "running") return;
      await fetch(`${status.url}/api/projects/${encodeURIComponent(projectId)}`, {
        method: "DELETE",
      });
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
    <div className="h-screen flex flex-col bg-white dark:bg-[#0a0a0a] text-gray-900 dark:text-neutral-100 overflow-hidden select-none transition-colors duration-200">
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
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          activeProject={activeProject}
          activeSession={activeSession}
          projects={projects}
          onSessionChange={setActiveSession}
          onNewSession={handleNewSession}
          onNewTask={handleNewTask}
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
