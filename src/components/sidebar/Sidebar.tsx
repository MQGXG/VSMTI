import {
  MessageSquarePlus,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Cpu,
  HardDrive,
  Trash2,
  MessageSquare,
  Search,
  X,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { SettingsDialog } from "./SettingsDialog";

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
}: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [systemInfo, setSystemInfo] = useState<{ status: string; port: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);

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
      if (status.status === "running") {
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
        return;
      }
    } catch { /* fallback */ }

    // TS Core 模式：从本地加载会话
    try {
      const tsSessions = await window.electronAPI.ts.listSessions(activeProject);
      if (tsSessions) {
        const list: Session[] = tsSessions.map((s: any) => ({
          session_id: s.session_id,
          project_id: s.project_id || activeProject,
          title: s.title || "",
          kind: s.kind || "session",
          workspace_path: s.workspace_path || "",
          parent_session_id: undefined,
          message_count: s.message_count || 0,
          updated_at: s.updated_at,
        }));
        setSessions(list);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadSessions();
    const timer = setInterval(loadSessions, 10000);
    return () => clearInterval(timer);
  }, [activeProject]);

  if (!isOpen) {
    return (
      <div className="border-r border-glass-border p-2 flex flex-col items-center gap-2 bg-surface-950/30">
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          title="展开侧边栏"
        >
          <PanelLeft className="w-4 h-4 text-neutral-400" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-glass-border flex flex-col glass relative transition-all duration-250">
      <div className="p-4 border-b border-glass-border">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 dark:text-neutral-100 truncate">
              {project?.name || "未选择项目"}
            </h2>
            {project?.workspace_path && (
              <p className="text-xs text-neutral-500 truncate mt-0.5">
                {project.workspace_path}
              </p>
            )}
          </div>
          <button onClick={onToggle} className="p-1.5 rounded hover:bg-white/10 transition-colors shrink-0">
            <PanelLeftClose className="w-4 h-4 text-neutral-400" />
          </button>
        </div>

        {/* 工作区搜索 */}
        <div className="relative mt-3">
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={searchQuery}
            onChange={async (e) => {
              const v = e.target.value;
              setSearchQuery(v);
              if (!v.trim()) { setSearchResults(null); return; }
              try {
                const results = await window.electronAPI.ts.searchMessages(v);
                setSearchResults(results);
              } catch { setSearchResults([]); }
            }}
            placeholder="搜索当前项目对话..."
            className="w-full pl-8 pr-7 py-1.5 rounded-lg text-xs bg-white/5 border border-glass-border text-neutral-200 placeholder-neutral-600 outline-none focus:border-accent-500/30 transition-colors"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(""); setSearchResults(null); }} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="w-3 h-3 text-neutral-500 hover:text-neutral-300" />
            </button>
          )}
        </div>

        <button
          onClick={onNewSession}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm btn-gradient text-white mt-3"
        >
          <MessageSquarePlus className="w-4 h-4" />
          新建会话
        </button>
      </div>

      {/* 搜索结果下拉 */}
      {searchResults !== null && (
        <div className="absolute left-4 right-4 top-[200px] z-50 glass-heavy rounded-xl border border-glass-border shadow-2xl max-h-64 overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] text-neutral-500 border-b border-glass-border">
            找到 {searchResults.length} 条结果
          </div>
          {searchResults.length === 0 ? (
            <p className="text-xs text-neutral-600 text-center py-4">未找到匹配内容</p>
          ) : (
            searchResults.map((r, i) => (
              <button
                key={i}
                onClick={() => { onSessionChange(r.session_id); setSearchResults(null); setSearchQuery(""); }}
                className="w-full text-left p-2.5 hover:bg-white/5 transition-colors border-b border-glass-border last:border-0"
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-3 h-3 text-neutral-500 shrink-0" />
                  <span className="text-xs font-medium text-neutral-300 truncate">{r.session_title}</span>
                  <span className="text-[10px] text-neutral-600 ml-auto">{r.message.role === "user" ? "用户" : "AI"}</span>
                </div>
                <p className="text-[10px] text-neutral-500 line-clamp-2 mt-0.5 ml-5">{r.message.content}</p>
              </button>
            ))
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {[...sessions].sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()).map((session) => (
          <div
            key={session.session_id}
            className={`group flex items-center rounded-lg text-sm transition-all duration-200 ${
              activeSession === session.session_id
                ? "bg-white/10 shadow-[inset_3px_0_0_-0px_rgba(99,102,241,0.6)]"
                : "hover:bg-white/5"
            }`}
          >
            <button
              onClick={() => onSessionChange(session.session_id)}
              className={`flex-1 text-left px-3 py-2 min-w-0 ${
                activeSession === session.session_id
                  ? "text-gray-900 dark:text-neutral-100"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <MessageSquare className="w-4 h-4 shrink-0 text-neutral-500" />
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {session.title || "新会话"}
                  </div>
                  <div className="truncate text-xs text-neutral-600">
                    {session.message_count || 0} 条消息 · {formatTime(session.updated_at)}
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
                    await fetch(`${status.url}/api/sessions/${encodeURIComponent(session.session_id)}`, {
                      method: "DELETE",
                    });
                  } else {
                    await window.electronAPI.ts.deleteSession(session.session_id);
                  }
                  loadSessions();
                } catch (err) {
                  console.error("删除失败:", err);
                }
                if (activeSession === session.session_id) {
                  onNewSession();
                }
              }}
              className="p-2 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all duration-200 shrink-0"
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

      <div className="p-3 border-t border-glass-border space-y-2">
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-neutral-400 hover:bg-white/10 hover:text-neutral-200 transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span>设置</span>
        </button>

        <div className="px-3 py-2 rounded-lg bg-white/5 space-y-1">
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
      {createPortal(
        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />,
        document.body
      )}

    </div>
  );
}
