import { MessageSquare, Plus, Settings, FolderOpen, PanelLeftClose, PanelLeft, Cpu, HardDrive, Trash2, GitBranch } from "lucide-react";
import { useState, useEffect } from "react";
import { SettingsDialog } from "./SettingsDialog";

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  activeSession: string;
  onSessionChange: (id: string) => void;
}

interface Session {
  id: string;
  title: string;
  parent_session_id?: string;
  message_count?: number;
}

export function Sidebar({ isOpen, onToggle, activeSession, onSessionChange }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [systemInfo, setSystemInfo] = useState<{ status: string; port: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const status = await window.electronAPI.getPythonStatus();
        setSystemInfo(status);
        if (status.status === "running") {
          const res = await fetch(`${status.url}/api/sessions`);
          const data = await res.json();
          const sessionList: Session[] = (data.sessions || []).map((s: any) => {
            const sid = typeof s === "string" ? s : s.session_id;
            const title = typeof s === "string" ? "" : (s.title || "");
            return {
              id: sid,
              title: title || (sid.length > 20 ? sid.slice(0, 20) + "..." : sid),
              parent_session_id: typeof s === "string" ? undefined : s.parent_session_id,
              message_count: typeof s === "string" ? undefined : s.message_count,
            };
          });
          setSessions(sessionList);
        }
      } catch {
        /* ignore */
      }
    };
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, []);

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
      <div className="p-3 flex items-center justify-between border-b border-gray-200 dark:border-neutral-800">
        <span className="text-xs font-medium text-gray-500 dark:text-neutral-500 uppercase tracking-wider">会话</span>
        <div className="flex gap-1">
          <button
            onClick={() => {
              const id = crypto.randomUUID();
              onSessionChange(id);
            }}
            className="p-1.5 rounded hover:bg-neutral-800 transition-colors"
            title="新建会话"
          >
            <Plus className="w-4 h-4 text-neutral-400" />
          </button>
          <button onClick={onToggle} className="p-1.5 rounded hover:bg-neutral-800 transition-colors">
            <PanelLeftClose className="w-4 h-4 text-neutral-400" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`group flex items-center rounded-lg text-sm transition-colors ${
              activeSession === session.id
                ? "bg-gray-200 dark:bg-neutral-800"
                : "hover:bg-gray-100 dark:hover:bg-neutral-800/50"
            }`}
          >
            <button
              onClick={() => onSessionChange(session.id)}
              className={`flex-1 text-left px-3 py-2 ${
                activeSession === session.id
                  ? "text-gray-900 dark:text-neutral-100"
                  : "text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-neutral-200"
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <MessageSquare className="w-4 h-4 shrink-0" />
                <span className="truncate">{session.title}</span>
              </div>
            </button>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const status = await window.electronAPI.getPythonStatus();
                  if (status.status === "running") {
                    const res = await fetch(`${status.url}/api/sessions/${encodeURIComponent(session.id)}/fork`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ session_id: session.id }),
                    });
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
              title="分叉此会话"
            >
              <GitBranch className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const status = await window.electronAPI.getPythonStatus();
                  if (status.status === "running") {
                    await fetch(`${status.url}/api/sessions/${encodeURIComponent(session.id)}`, {
                      method: "DELETE",
                    });
                  }
                } catch (err) {
                  console.error("删除会话失败:", err);
                }
                if (activeSession === session.id) {
                  const id = crypto.randomUUID();
                  onSessionChange(id);
                }
              }}
              className="p-2 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all shrink-0"
              title="删除会话"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="text-xs text-neutral-600 text-center py-8">暂无会话</div>
        )}
      </div>

        <div className="p-3 border-t border-gray-200 dark:border-neutral-800 space-y-2">
        <button
          onClick={async () => {
            const paths = await window.electronAPI.openFile();
            if (paths && paths.length > 0) {
              onSessionChange(paths[0]);
            }
          }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-neutral-400 hover:bg-neutral-800 transition-colors"
        >
          <FolderOpen className="w-4 h-4" />
          <span>打开本地文件</span>
        </button>

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
    </div>
  );
}
