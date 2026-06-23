import {
  MessageSquarePlus,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Trash2,
  MessageSquare,
  Search,
  X,
  FileText,
  ChevronDown,
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

function getTimeGroup(iso: string): string {
  if (!iso) return "其他";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "其他";
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (diff < dayMs) return "今天";
  if (diff < 2 * dayMs) return "昨天";
  if (diff < 7 * dayMs) return "7天内";
  return "30天内";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    "今天": true,
    "昨天": true,
    "7天内": true,
    "30天内": true,
  });

  const project = useMemo(
    () => projects.find((p) => p.project_id === activeProject),
    [projects, activeProject]
  );

  const loadSessions = async () => {
    if (!activeProject) { setSessions([]); return; }
    try {
      const tsSessions = await window.electronAPI.ts.listSessions(activeProject);
      if (tsSessions) {
        setSessions(tsSessions.map((s: any) => ({
          session_id: s.session_id,
          project_id: s.project_id || activeProject,
          title: s.title || "",
          kind: s.kind || "session",
          workspace_path: s.workspace_path || "",
          message_count: s.message_count || 0,
          updated_at: s.updated_at,
        })));
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadSessions();
    const timer = setInterval(loadSessions, 10000);
    return () => clearInterval(timer);
  }, [activeProject]);

  const groupedSessions = useMemo(() => {
    const groups: Record<string, Session[]> = {
      "今天": [],
      "昨天": [],
      "7天内": [],
      "30天内": [],
      "其他": [],
    };
    sessions.forEach((session) => {
      const group = getTimeGroup(session.updated_at);
      groups[group]?.push(session);
    });
    return groups;
  }, [sessions]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  if (!isOpen) {
    return (
      <div className="w-full h-full flex flex-col items-center gap-2 p-2" style={{ borderRight: "1px solid var(--sidebar-border)", background: "var(--sidebar-bg)" }}>
        <button onClick={onToggle} className="w-9 h-9 flex items-center justify-center rounded-lg btn-ghost transition-all duration-200" title="展开侧边栏">
          <PanelLeft className="w-4 h-4" style={{ color: "var(--text-tertiary)" }} />
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col relative" style={{ borderRight: "1px solid var(--sidebar-border)", background: "var(--sidebar-bg)" }}>
      {/* Header */}
      <div className="p-4" style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
              style={{ background: "linear-gradient(135deg, var(--accent-start), var(--accent-end))" }}>
              {project ? project.name[0].toUpperCase() : "?"}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                {project?.name || "未选择项目"}
              </div>
              {project?.workspace_path && (
                <div className="text-[10px] truncate" style={{ color: "var(--text-tertiary)" }}>
                  {project.workspace_path}
                </div>
              )}
            </div>
          </div>
          <button onClick={onToggle} className="w-7 h-7 flex items-center justify-center rounded-md btn-ghost shrink-0 transition-all duration-200">
            <PanelLeftClose className="w-3.5 h-3.5" style={{ color: "var(--text-tertiary)" }} />
          </button>
        </div>

        {/* Search */}
        <div className="relative group">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 transition-colors" style={{ color: "var(--text-tertiary)" }} />
          <input
            value={searchQuery}
            onChange={async (e) => {
              const v = e.target.value;
              setSearchQuery(v);
              if (!v.trim()) { setSearchResults(null); return; }
              try { setSearchResults(await window.electronAPI.ts.searchMessages(v)); }
              catch { setSearchResults([]); }
            }}
            placeholder="搜索消息..."
            className="w-full pl-9 pr-8 py-2 rounded-lg text-xs outline-none transition-all duration-200"
            style={{
              background: "var(--input-bg)",
              border: "1px solid var(--input-border)",
              color: "var(--text-primary)",
            }}
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(""); setSearchResults(null); }} className="absolute right-2 top-1/2 -translate-y-1/2 btn-ghost p-1 rounded-md">
              <X className="w-3 h-3" style={{ color: "var(--text-tertiary)" }} />
            </button>
          )}
        </div>

        {/* New session */}
        <button onClick={onNewSession} className="w-full flex items-center justify-center gap-2 mt-3 px-4 py-2.5 rounded-lg text-xs font-semibold btn-primary transition-all duration-200">
          <MessageSquarePlus className="w-4 h-4" />
          新建会话
        </button>
      </div>

      {/* Search results */}
      {searchResults !== null && (
        <div className="absolute left-3 right-3 z-50 rounded-xl overflow-hidden shadow-lg"
          style={{ top: "160px", background: "var(--surface-elevated)", border: "1px solid var(--border)" }}>
          <div className="px-3 py-2 text-[10px] font-medium" style={{ color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-light)" }}>
            找到 {searchResults.length} 条结果
          </div>
          {searchResults.length === 0 ? (
            <p className="text-xs py-6 text-center" style={{ color: "var(--text-tertiary)" }}>未找到匹配内容</p>
          ) : (
            <div className="max-h-64 overflow-y-auto custom-scrollbar">
              {searchResults.map((r, i) => (
                <button key={i} onClick={() => { onSessionChange(r.session_id); setSearchResults(null); setSearchQuery(""); }}
                  className="w-full text-left px-3 py-3 transition-all duration-200 hover:bg-black/3 dark:hover:bg-white/3"
                  style={{ borderBottom: i < searchResults.length - 1 ? "1px solid var(--border-light)" : "none" }}>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-3 h-3 shrink-0" style={{ color: "var(--text-tertiary)" }} />
                    <span className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{r.session_title}</span>
                    <span className="text-[10px] ml-auto shrink-0" style={{ color: "var(--text-tertiary)" }}>{r.message.role === "user" ? "用户" : "AI"}</span>
                  </div>
                  <p className="text-[10px] line-clamp-2 mt-1 ml-5" style={{ color: "var(--text-tertiary)" }}>{r.message.content}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        {sessions.length === 0 && project && (
          <div className="text-xs py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto" style={{ background: "var(--surface-secondary)" }}>
              <MessageSquare className="w-6 h-6" style={{ color: "var(--text-muted)" }} />
            </div>
            <p style={{ color: "var(--text-tertiary)" }}>暂无会话</p>
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>点击上方按钮创建新会话</p>
          </div>
        )}

        {!project && (
          <div className="text-xs py-12 text-center">
            <p style={{ color: "var(--text-tertiary)" }}>请先选择一个项目</p>
          </div>
        )}

        {Object.entries(groupedSessions).map(([group, groupSessions]) => {
          if (groupSessions.length === 0) return null;
          const isExpanded = expandedGroups[group] !== false;
          return (
            <div key={group} className="mb-2">
              <button
                onClick={() => toggleGroup(group)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors"
                style={{ color: "var(--text-tertiary)" }}
              >
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"}`} />
                {group}
                <span className="ml-auto text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>{groupSessions.length}</span>
              </button>
              {isExpanded && (
                <div className="space-y-0.5">
                  {groupSessions
                    .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())
                    .map((session) => {
                      const isActive = activeSession === session.session_id;
                      return (
                        <div key={session.session_id} className={`group flex items-center rounded-lg text-sm transition-all duration-200 sidebar-item ${isActive ? "active" : ""}`}>
                          <button onClick={() => onSessionChange(session.session_id)}
                            className="flex-1 text-left px-3 py-2 min-w-0">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors"
                                style={{ background: isActive ? "var(--accent-light)" : "var(--surface-secondary)" }}>
                                {session.kind === "task" ? (
                                  <FileText className="w-3.5 h-3.5" style={{ color: isActive ? "var(--accent)" : "var(--text-tertiary)" }} />
                                ) : (
                                  <MessageSquare className="w-3.5 h-3.5" style={{ color: isActive ? "var(--accent)" : "var(--text-tertiary)" }} />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium truncate" style={{ color: isActive ? "var(--text-primary)" : "var(--text-secondary)" }}>
                                  {session.title || "新会话"}
                                </div>
                                <div className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                                  {session.message_count || 0} 条 · {formatTime(session.updated_at)}
                                </div>
                              </div>
                            </div>
                          </button>
                          <button onClick={async (e) => {
                            e.stopPropagation();
                            try { await window.electronAPI.ts.deleteSession(session.session_id); loadSessions(); }
                            catch { /* ignore */ }
                            if (activeSession === session.session_id) onNewSession();
                          }}
                            className="p-1.5 mr-1 rounded-md opacity-0 group-hover:opacity-100 transition-all duration-200 btn-ghost shrink-0"
                            style={{ color: "var(--text-tertiary)" }}>
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Settings */}
      <div className="p-3" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
        <button onClick={() => setSettingsOpen(true)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs btn-ghost transition-all duration-200">
          <Settings className="w-4 h-4" style={{ color: "var(--text-tertiary)" }} />
          <span style={{ color: "var(--text-secondary)" }}>设置</span>
        </button>
      </div>

      {createPortal(<SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />, document.body)}
    </div>
  );
}
