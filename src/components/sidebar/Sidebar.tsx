import {
  MessageSquarePlus,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Trash2,
  MessageSquare,
  Search,
  X,
  Plus,
  Hash,
  FileText,
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

  if (!isOpen) {
    return (
      <div className="flex flex-col items-center gap-2 p-2" style={{ borderRight: '1px solid var(--border-light)', background: 'var(--surface-secondary)' }}>
        <button onClick={onToggle} className="w-8 h-8 flex items-center justify-center rounded-lg btn-ghost" title="展开侧边栏">
          <PanelLeft className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 flex flex-col relative" style={{ borderRight: '1px solid var(--border-light)', background: 'var(--surface-secondary)' }}>
      {/* 头部 */}
      <div className="p-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
              {project ? project.name[0].toUpperCase() : '?'}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {project?.name || "未选择项目"}
              </div>
              {project?.workspace_path && (
                <div className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                  {project.workspace_path}
                </div>
              )}
            </div>
          </div>
          <button onClick={onToggle} className="w-6 h-6 flex items-center justify-center rounded btn-ghost shrink-0">
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 搜索 */}
        <div className="relative">
          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
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
            className="w-full pl-7 pr-6 py-1.5 rounded-lg text-xs outline-none transition-colors"
            style={{ background: 'var(--surface-tertiary)', color: 'var(--text-primary)', border: '1px solid transparent' }}
            onFocus={(e) => e.target.style.borderColor = 'var(--accent-start)'}
            onBlur={(e) => e.target.style.borderColor = 'transparent'}
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(""); setSearchResults(null); }} className="absolute right-1.5 top-1/2 -translate-y-1/2 btn-ghost p-0.5 rounded">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <button onClick={onNewSession} className="w-full flex items-center justify-center gap-1.5 mt-2 px-3 py-2 rounded-lg text-xs font-medium btn-primary">
          <MessageSquarePlus className="w-3.5 h-3.5" />
          新建会话
        </button>
      </div>

      {/* 搜索结果 */}
      {searchResults !== null && (
        <div className="absolute left-2 right-2 z-50 rounded-xl shadow-2xl max-h-64 overflow-y-auto"
          style={{ top: '140px', background: 'var(--surface-secondary)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
          <div className="px-3 py-1.5 text-[10px]" style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-light)' }}>
            找到 {searchResults.length} 条结果
          </div>
          {searchResults.length === 0 ? (
            <p className="text-xs py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>未找到匹配内容</p>
          ) : (
            searchResults.map((r, i) => (
              <button key={i} onClick={() => { onSessionChange(r.session_id); setSearchResults(null); setSearchQuery(""); }}
                className="w-full text-left p-2.5 transition-colors"
                style={{ borderBottom: i < searchResults.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-3 h-3 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                  <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{r.session_title}</span>
                  <span className="text-[10px] ml-auto shrink-0" style={{ color: 'var(--text-tertiary)' }}>{r.message.role === "user" ? "用户" : "AI"}</span>
                </div>
                <p className="text-[10px] line-clamp-2 mt-0.5 ml-5" style={{ color: 'var(--text-tertiary)' }}>{r.message.content}</p>
              </button>
            ))
          )}
        </div>
      )}

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {[...sessions]
          .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())
          .map((session) => {
            const isActive = activeSession === session.session_id;
            return (
              <div key={session.session_id} className="group flex items-center rounded-lg text-sm transition-all"
                style={{ background: isActive ? 'var(--surface-tertiary)' : 'transparent' }}>
                <button onClick={() => onSessionChange(session.session_id)}
                  className="flex-1 text-left px-2.5 py-2 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                      style={{ background: isActive ? 'var(--surface)' : 'var(--surface-tertiary)' }}>
                      {session.kind === "task" ? <FileText className="w-3 h-3" style={{ color: 'var(--accent-start)' }} />
                        : <MessageSquare className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate" style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        {session.title || "新会话"}
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
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
                  className="p-1.5 mr-1 rounded-md opacity-0 group-hover:opacity-100 transition-all btn-ghost shrink-0">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}

        {sessions.length === 0 && project && (
          <div className="text-xs py-8 text-center space-y-2" style={{ color: 'var(--text-tertiary)' }}>
            <MessageSquare className="w-8 h-8 mx-auto opacity-40" />
            <p>暂无会话</p>
          </div>
        )}
        {!project && (
          <div className="text-xs py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>
            请先选择一个项目
          </div>
        )}
      </div>

      {/* 底部 */}
      <div className="p-2" style={{ borderTop: '1px solid var(--border-light)' }}>
        <button onClick={() => setSettingsOpen(true)}
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs btn-ghost">
          <Settings className="w-3.5 h-3.5" />
          <span>设置</span>
        </button>
      </div>

      {createPortal(<SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />, document.body)}
    </div>
  );
}
