import { useState, useEffect, useMemo } from "react";
import { MessageSquarePlus, Settings, Trash2, MessageSquare, Search, X, FileText, Plus } from "lucide-react";
import { SettingsDialog } from "./SettingsDialog";
import { SessionService, type SessionInfo } from "../services/session.service";
import { ProjectService, type ProjectInfo } from "../services/project.service";
import { Input } from "../components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuPortal,
} from "../components/ui/dropdown-menu";

interface Props {
  open: boolean;
  onClose: () => void;
  activeProject: string;
  activeSession: string;
  projects: ProjectInfo[];
  onProjectChange: (projectId: string) => void;
  onSessionChange: (sessionId: string) => void;
  onNewSession: () => void;
  onOpenProject: () => void;
  onEditProject: (project: ProjectInfo) => void;
  onDeleteProject: (projectId: string) => void;
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

function SidebarContent({ activeProject, activeSession, projects, onProjectChange, onSessionChange, onNewSession, onOpenProject, onEditProject, onDeleteProject }: Props) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; project: ProjectInfo } | null>(null);

  const project = useMemo(() => projects.find((p) => p.project_id === activeProject), [projects, activeProject]);

  const loadSessions = async () => {
    if (!activeProject) { setSessions([]); return; }
    try {
      const list = await SessionService.list(activeProject);
      setSessions(list);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadSessions(); const timer = setInterval(loadSessions, 10000); return () => clearInterval(timer); }, [activeProject]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        onNewSession();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onNewSession]);

  const groupedSessions = useMemo(() => {
    const groups: Record<string, SessionInfo[]> = { "今天": [], "昨天": [], "7天内": [], "30天内": [], "其他": [] };
    sessions.forEach((s) => { const g = getTimeGroup(s.updated_at); if (groups[g]) groups[g].push(s); });
    return groups;
  }, [sessions]);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ "今天": true, "昨天": true, "7天内": true, "30天内": true });

  return (
    <div className="flex flex-col h-full">
      {/* Project header */}
      <div className="p-4 pb-3 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0" style={{ background: project?.color || "var(--bg-tertiary)", color: project ? "#fff" : "var(--fg-secondary)" }}>
          {project ? project.name[0].toUpperCase() : "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate" style={{ color: "var(--fg)" }}>{project?.name || "未选择项目"}</span>
            {project && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: project.color }} />}
          </div>
          {project?.workspace_path && <div className="text-[11px] truncate mt-0.5" style={{ color: "var(--fg-tertiary)" }}>{project.workspace_path}</div>}
        </div>
      </div>

      {/* Project bar */}
      <div className="px-3 py-3 flex gap-2 overflow-x-auto scrollbar-custom" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        {projects.map((p) => {
          const isActive = activeProject === p.project_id;
          return (
            <button key={p.project_id} onClick={() => { onProjectChange(p.project_id); }}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, project: p }); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0"
              style={{
                background: isActive ? "var(--bg)" : "transparent",
                color: isActive ? "var(--fg)" : "var(--fg-tertiary)",
                border: "1px solid", borderColor: isActive ? "var(--border)" : "transparent",
              }}>
              <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </button>
          );
        })}
        <button onClick={onOpenProject} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-all shrink-0" style={{ color: "var(--fg-tertiary)", border: "1px dashed var(--border)" }}>
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <DropdownMenu open={true} onOpenChange={(open) => { if (!open) setContextMenu(null); }}>
          <DropdownMenuTrigger asChild>
            <div style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, width: 0, height: 0 }} />
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent side="bottom" align="start" className="min-w-[140px] p-1"
              onCloseAutoFocus={(e) => e.preventDefault()}>
              <DropdownMenuItem onSelect={() => { onEditProject(contextMenu.project); setContextMenu(null); }}>
                编辑
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setContextMenu(null)}>
                启用工作区
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setContextMenu(null)}>
                清除通知
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => {
                ProjectService.hide(contextMenu.project.project_id);
                setContextMenu(null);
                window.location.reload();
              }}>
                关闭
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenu>
      )}

      {/* Search */}
      <div className="px-3 pb-2 pt-3 relative">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} />
          <Input value={searchQuery} onChange={async (e) => {
            const v = e.target.value; setSearchQuery(v);
            if (!v.trim()) { setSearchResults(null); return; }
            try { setSearchResults(await SessionService.search(v)); } catch { setSearchResults([]); }
          }} placeholder="搜索会话..." className="pl-9 pr-3 py-2 text-xs" />
          {searchQuery && <button onClick={() => { setSearchQuery(""); setSearchResults(null); }} className="absolute right-2 top-1/2 -translate-y-1/2 btn-ghost p-0.5"><X className="w-3 h-3" /></button>}
        </div>
      </div>

      {/* Search results */}
      {searchResults !== null && (
        <div className="mx-3 rounded-lg overflow-hidden" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-floating)", zIndex: 10 }}>
          <div className="px-3 py-2 text-xs font-medium" style={{ color: "var(--fg-tertiary)", borderBottom: "1px solid var(--border-subtle)" }}>找到 {searchResults.length} 条结果</div>
          {searchResults.length === 0 ? <p className="text-xs py-6 text-center" style={{ color: "var(--fg-tertiary)" }}>未找到匹配内容</p> : (
            <div className="max-h-48 overflow-y-auto scrollbar-custom">
              {searchResults.map((r, i) => (
                <button key={i} onClick={() => { onSessionChange(r.session_id); setSearchResults(null); setSearchQuery(""); }}
                  className="w-full text-left px-3 py-2.5 transition-colors hover:bg-black/3 dark:hover:bg-white/3" style={{ borderBottom: i < searchResults.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                  <div className="flex items-center gap-2 text-xs"><MessageSquare className="w-3 h-3 shrink-0" style={{ color: "var(--fg-tertiary)" }} /><span className="font-medium truncate" style={{ color: "var(--fg)" }}>{r.session_title}</span></div>
                  <p className="text-[11px] line-clamp-2 mt-1 ml-5" style={{ color: "var(--fg-tertiary)" }}>{r.message.content}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 py-1 scrollbar-custom">
        {!project && <div className="text-xs py-12 text-center" style={{ color: "var(--fg-tertiary)" }}>请先选择一个项目</div>}
        {project && sessions.length === 0 && (
          <div className="text-xs py-12 text-center" style={{ color: "var(--fg-tertiary)" }}>
            <MessageSquare className="w-6 h-6 mx-auto mb-3" style={{ color: "var(--fg-quaternary)" }} />
            暂无会话
          </div>
        )}
        {Object.entries(groupedSessions).map(([group, groupSessions]) => {
          if (groupSessions.length === 0) return null;
          const isExpanded = expandedGroups[group] !== false;
          return (
            <div key={group} className="mb-1">
              <button onClick={() => setExpandedGroups(p => ({ ...p, [group]: !p[group] }))}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>
                <svg className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"}`} viewBox="0 0 12 12" fill="none"><path d="M4 3l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                {group}
                <span className="ml-auto font-normal" style={{ color: "var(--fg-quaternary)" }}>{groupSessions.length}</span>
              </button>
              {isExpanded && groupSessions.sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()).map((session) => {
                const isActive = activeSession === session.session_id;
                return (
                  <div key={session.session_id} className={`group flex items-center rounded-lg text-sm ${isActive ? "active sidebar-item" : "sidebar-item"}`}>
                    <button onClick={() => onSessionChange(session.session_id)} className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: isActive ? "var(--bg-tertiary)" : "var(--bg)" }}>
                          {session.kind === "task" ? <FileText className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium truncate">{session.title || "新会话"}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: "var(--fg-tertiary)" }}>{session.message_count || 0} 条 · {formatTime(session.updated_at)}</div>
                        </div>
                      </div>
                    </button>
                    <button onClick={async (e) => { e.stopPropagation(); try { await SessionService.delete(session.session_id); loadSessions(); } catch { /* ignore */ } if (activeSession === session.session_id) onNewSession(); }}
                      className="p-1 mr-1 rounded-md opacity-0 group-hover:opacity-100 transition-all btn-ghost shrink-0">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-standard">
        <button onClick={() => setSettingsOpen(true)} className="flex items-center gap-2.5 sidebar-item rounded-lg px-3 py-2 text-sm transition-all">
          <Settings className="w-4 h-4" />
          设置
          <span className="ml-auto text-[10px] text-tertiary">Ctrl+,</span>
        </button>
      </div>

      {settingsOpen && <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

export function Sidebar(props: Props) {
  if (!props.open) return null;
  return (
    <>
      <div className="overlay" onClick={props.onClose} />
      <div className="drawer">
        <SidebarContent {...props} />
      </div>
    </>
  );
}
