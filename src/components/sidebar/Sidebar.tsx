import {
  MessageSquarePlus,
  FolderPlus,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Cpu,
  HardDrive,
  Trash2,
  GitBranch,
  MessageSquare,
  CheckSquare,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { SettingsDialog } from "./SettingsDialog";
import { NewTaskDialog } from "./NewTaskDialog";

interface Project {
  project_id: string;
  name: string;
  workspace_path: string;
  color: string;
}

interface Session {
  session_id: string;
  project_id: string;
  title: string;
  kind: "session" | "task";
  workspace_path: string;
  parent_session_id?: string;
  message_count?: number;
  updated_at: string;
}

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  activeProject: string;
  activeSession: string;
  projects: Project[];
  onSessionChange: (sessionId: string) => void;
  onNewSession: () => void;
  onNewTask: (title: string) => void;
}

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60 * 1000) return "刚刚";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)}天前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function Sidebar({
  isOpen,
  onToggle,
  activeProject,
  activeSession,
  projects,
  onSessionChange,
  onNewSession,
  onNewTask,
}: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [systemInfo, setSystemInfo] = useState<{ status: string; port: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  const project = useMemo(
    () => projects.find((p) => p.project_id === activeProject),
    [projects, activeProject]
  );

  const loadSessions = async () => {
    if (!activeProject) {
      setSessions([]);
      return;
    }
    try {
      const status = await window.electronAPI.getPythonStatus();
      setSystemInfo(status);
      if (status.status !== "running") return;

      const res = await fetch(`${status.url}/api/projects/${encodeURIComponent(activeProject)}/sessions`);
      const data = await res.json();
      const list: Session[] = (data.sessions || []).map((s: any) => ({
        session_id: s.session_id,
        project_id: s.project_id,
        title: s.title || "",
        kind: s.kind || "session",
        workspace_path: s.workspace_path || "",
        parent_session_id: s.parent_session_id,
        message_count: s.message_count,
        updated_at: s.updated_at,
      }));
      setSessions(list);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadSessions();
    const timer = setInterval(loadSessions, 10000);
    return () => clearInterval(timer);
  }, [activeProject]);

  const handleCreateTask = (title: string) => {
    onNewTask(title);
    setNewTaskOpen(false);
  };

  if (!isOpen) {
    return (
      <div className="border-r border-neutral-800 p-2 flex flex-col items-center gap-2">
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-neutral-800 transition-colors"
          title="展开侧边栏"
        >
          <PanelLeft className="w-4 h-4 text-neutral-400" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-gray-200 dark:border-neutral-800 flex flex-col bg-gray-50 dark:bg-neutral-950/50 transition-colors duration-200">
      {/* 项目头部 */}
      <div className="p-4 border-b border-gray-200 dark:border-neutral-800">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 dark:text-neutral-100 truncate">
              {project?.name || "未选择项目"}
            </h2>
            {project?.workspace_path && (
              <p className="text-xs text-gray-500 dark:text-neutral-500 truncate mt-0.5">
                {project.workspace_path}
              </p>
            )}
          </div>
          <button onClick={onToggle} className="p-1.5 rounded hover:bg-neutral-800 transition-colors shrink-0">
            <PanelLeftClose className="w-4 h-4 text-neutral-400" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <button
            onClick={onNewSession}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-gray-900 dark:text-neutral-100 transition-colors"
          >
            <MessageSquarePlus className="w-4 h-4" />
            新建会话
          </button>
          <button
            onClick={() => setNewTaskOpen(true)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            <FolderPlus className="w-4 h-4" />
            新建任务
          </button>
        </div>
      </div>

      {/* 会话/任务列表 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.map((session) => (
          <div
            key={session.session_id}
            className={`group flex items-center rounded-lg text-sm transition-colors ${
              activeSession === session.session_id
                ? "bg-gray-200 dark:bg-neutral-800"
                : "hover:bg-gray-100 dark:hover:bg-neutral-800/50"
            }`}
          >
            <button
              onClick={() => onSessionChange(session.session_id)}
              className={`flex-1 text-left px-3 py-2 min-w-0 ${
                activeSession === session.session_id
                  ? "text-gray-900 dark:text-neutral-100"
                  : "text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-neutral-200"
              }`}
            >
              <div className="flex items-center gap-2.5">
                {session.kind === "task" ? (
                  <CheckSquare className="w-4 h-4 shrink-0 text-emerald-500" />
                ) : (
                  <MessageSquare className="w-4 h-4 shrink-0 text-neutral-400" />
                )}
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {session.title || (session.kind === "task" ? "未命名任务" : "新会话")}
                  </div>
                  <div className="truncate text-xs text-gray-400 dark:text-neutral-500">
                    {session.kind === "task"
                      ? session.workspace_path.split(/[/\\]/).pop() || "任务目录"
                      : `${session.message_count || 0} 条消息 · ${formatTime(session.updated_at)}`}
                  </div>
                </div>
              </div>
            </button>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const status = await window.electronAPI.getPythonStatus();
                  if (status.status === "running") {
                    const res = await fetch(
                      `${status.url}/api/sessions/${encodeURIComponent(session.session_id)}/fork`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ session_id: session.session_id }),
                      }
                    );
                    if (res.ok) {
                      const data = await res.json();
                      if (data.session) onSessionChange(data.session.session_id);
                    }
                  }
                } catch (err) {
                  console.error("分叉失败:", err);
                }
              }}
              className="p-2 opacity-0 group-hover:opacity-100 hover:text-emerald-400 transition-all shrink-0"
              title="分叉"
            >
              <GitBranch className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const status = await window.electronAPI.getPythonStatus();
                  if (status.status === "running") {
                    await fetch(`${status.url}/api/sessions/${encodeURIComponent(session.session_id)}`, {
                      method: "DELETE",
                    });
                  }
                } catch (err) {
                  console.error("删除失败:", err);
                }
                if (activeSession === session.session_id) {
                  onNewSession();
                }
              }}
              className="p-2 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all shrink-0"
              title="删除"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {sessions.length === 0 && project && (
          <div className="text-xs text-neutral-600 text-center py-8">
            该项目下暂无会话或任务
            <br />
            点击上方按钮创建
          </div>
        )}
        {!project && (
          <div className="text-xs text-neutral-600 text-center py-8">
            请从左侧选择一个项目
          </div>
        )}
      </div>

      {/* 底部 */}
      <div className="p-3 border-t border-gray-200 dark:border-neutral-800 space-y-2">
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-neutral-400 hover:bg-neutral-800 transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span>设置</span>
        </button>

        <div className="px-3 py-2 rounded-lg bg-neutral-900/50 space-y-1">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Cpu className="w-3 h-3" />
            <span>后端: {systemInfo?.status || "..."}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <HardDrive className="w-3 h-3" />
            <span>端口: {systemInfo?.port || "..."}</span>
          </div>
        </div>
      </div>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NewTaskDialog
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        onCreate={handleCreateTask}
        projectName={project?.name}
      />
    </div>
  );
}
