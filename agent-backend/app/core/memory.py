import sqlite3
import os
import uuid
from datetime import datetime
from pathlib import Path
from app.config import settings


class MemorySystem:
    def __init__(self):
        db_path = Path(settings.chroma_path).parent / "sessions.db"
        os.makedirs(db_path.parent, exist_ok=True)
        self.conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_tables()

        try:
            import chromadb
            self.chroma_client = chromadb.PersistentClient(path=settings.chroma_path)
            self.chroma_collection = self.chroma_client.get_or_create_collection("agent_memory")
            self.chroma_available = True
        except Exception:
            self.chroma_available = False

    def _init_tables(self):
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS projects (
                project_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                workspace_path TEXT NOT NULL UNIQUE,
                color TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                project_id TEXT DEFAULT '',
                parent_session_id TEXT,
                fork_point INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                title TEXT DEFAULT '',
                kind TEXT DEFAULT 'session',
                workspace_path TEXT DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_session ON messages(session_id);
        """)
        self.conn.commit()
        # 单独创建项目索引，避免 messages 表不存在时报错
        try:
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_project ON sessions(project_id)")
            self.conn.commit()
        except sqlite3.OperationalError:
            pass
        self._migrate_legacy()
        self.conn.commit()

    def _migrate_legacy(self):
        """迁移旧版数据"""
        # 为旧表增加可能缺失的列
        for col, dtype in [
            ("workspace_path", "TEXT DEFAULT ''"),
            ("project_id", "TEXT DEFAULT ''"),
            ("kind", "TEXT DEFAULT 'session'"),
        ]:
            try:
                self.conn.execute(f"ALTER TABLE sessions ADD COLUMN {col} {dtype}")
                self.conn.commit()
            except sqlite3.OperationalError:
                pass

        # 将旧会话按 workspace_path 归并到项目
        try:
            rows = self.conn.execute(
                "SELECT session_id, workspace_path FROM sessions WHERE project_id = '' OR project_id IS NULL"
            ).fetchall()
            for row in rows:
                ws = row["workspace_path"] or ""
                project_id = self._get_or_create_project_for_path(ws)
                kind = "task" if ws and not self._is_project_path(ws, project_id) else "session"
                self.conn.execute(
                    "UPDATE sessions SET project_id = ?, kind = ? WHERE session_id = ?",
                    (project_id, kind, row["session_id"]),
                )
            self.conn.commit()
        except sqlite3.OperationalError:
            pass

    def _is_project_path(self, path: str, project_id: str) -> bool:
        cur = self.conn.execute(
            "SELECT workspace_path FROM projects WHERE project_id = ?", (project_id,)
        )
        row = cur.fetchone()
        return bool(row and row["workspace_path"] == path)

    def _get_or_create_project_for_path(self, workspace_path: str) -> str:
        """根据路径获取或创建项目"""
        if not workspace_path:
            workspace_path = str(Path.home())
        ws = str(Path(workspace_path).resolve())

        cur = self.conn.execute(
            "SELECT project_id FROM projects WHERE workspace_path = ?", (ws,)
        )
        row = cur.fetchone()
        if row:
            return row["project_id"]

        project_id = str(uuid.uuid4())
        name = Path(ws).name or ws
        now = datetime.now().isoformat()
        self.conn.execute(
            "INSERT INTO projects (project_id, name, workspace_path, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (project_id, name, ws, "", now, now),
        )
        return project_id

    def _ensure_session(self, session_id: str):
        """确保会话记录存在"""
        cur = self.conn.execute("SELECT session_id FROM sessions WHERE session_id = ?", (session_id,))
        if not cur.fetchone():
            now = datetime.now().isoformat()
            project_id = self._get_or_create_project_for_path("")
            self.conn.execute(
                "INSERT INTO sessions (session_id, project_id, created_at, updated_at, kind, workspace_path) VALUES (?, ?, ?, ?, ?, ?)",
                (session_id, project_id, now, now, "session", ""),
            )
            self.conn.commit()

    def add_message(self, session_id: str, role: str, content: str):
        self._ensure_session(session_id)
        now = datetime.now().isoformat()
        self.conn.execute(
            "INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
            (session_id, role, content, now),
        )
        self.conn.execute("UPDATE sessions SET updated_at = ? WHERE session_id = ?", (now, session_id))
        # 同时更新项目 updated_at
        self.conn.execute(
            "UPDATE projects SET updated_at = ? WHERE project_id = (SELECT project_id FROM sessions WHERE session_id = ?)",
            (now, session_id),
        )
        self.conn.commit()

    def get_history(self, session_id: str, limit: int = 100) -> list[dict]:
        cursor = self.conn.execute(
            "SELECT id, role, content, timestamp FROM messages WHERE session_id = ? ORDER BY id ASC",
            (session_id,),
        )
        rows = cursor.fetchall()
        if limit and len(rows) > limit:
            rows = rows[-limit:]
        return [
            {"id": row["id"], "role": row["role"], "content": row["content"], "timestamp": row["timestamp"]}
            for row in rows
        ]

    def get_message_count(self, session_id: str) -> int:
        cur = self.conn.execute(
            "SELECT COUNT(*) as cnt FROM messages WHERE session_id = ?", (session_id,)
        )
        row = cur.fetchone()
        return row["cnt"] if row else 0

    def get_project(self, project_id: str) -> dict | None:
        cur = self.conn.execute("SELECT * FROM projects WHERE project_id = ?", (project_id,))
        row = cur.fetchone()
        if not row:
            return None
        return {
            "project_id": row["project_id"],
            "name": row["name"],
            "workspace_path": row["workspace_path"],
            "color": row["color"] or "",
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def get_project_by_path(self, workspace_path: str) -> dict | None:
        ws = str(Path(workspace_path).resolve())
        cur = self.conn.execute("SELECT * FROM projects WHERE workspace_path = ?", (ws,))
        row = cur.fetchone()
        if not row:
            return None
        return self.get_project(row["project_id"])

    def list_projects(self) -> list[dict]:
        cursor = self.conn.execute("""
            SELECT p.*, COUNT(s.session_id) as session_count
            FROM projects p
            LEFT JOIN sessions s ON p.project_id = s.project_id
            GROUP BY p.project_id
            ORDER BY p.updated_at DESC
        """)
        return [
            {
                "project_id": row["project_id"],
                "name": row["name"],
                "workspace_path": row["workspace_path"],
                "color": row["color"] or "",
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "session_count": row["session_count"],
            }
            for row in cursor.fetchall()
        ]

    def create_project(self, name: str, workspace_path: str, color: str = "") -> str:
        """创建项目，返回 project_id"""
        p = Path(workspace_path).resolve()
        if not p.exists():
            p.mkdir(parents=True, exist_ok=True)
        ws = str(p)

        # 如果路径已存在，返回已有项目
        existing = self.get_project_by_path(ws)
        if existing:
            return existing["project_id"]

        project_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        self.conn.execute(
            "INSERT INTO projects (project_id, name, workspace_path, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (project_id, name or p.name, ws, color or "", now, now),
        )
        self.conn.commit()
        return project_id

    def update_project(self, project_id: str, name: str | None = None, color: str | None = None):
        if name is not None:
            self.conn.execute("UPDATE projects SET name = ? WHERE project_id = ?", (name, project_id))
        if color is not None:
            self.conn.execute("UPDATE projects SET color = ? WHERE project_id = ?", (color, project_id))
        self.conn.commit()

    def delete_project(self, project_id: str):
        """删除项目及其下所有会话"""
        self.conn.execute("DELETE FROM messages WHERE session_id IN (SELECT session_id FROM sessions WHERE project_id = ?)", (project_id,))
        self.conn.execute("DELETE FROM sessions WHERE project_id = ?", (project_id,))
        self.conn.execute("DELETE FROM projects WHERE project_id = ?", (project_id,))
        self.conn.commit()

    def get_session_info(self, session_id: str) -> dict | None:
        cur = self.conn.execute("""
            SELECT s.*, p.name as project_name, p.workspace_path as project_path
            FROM sessions s
            LEFT JOIN projects p ON s.project_id = p.project_id
            WHERE s.session_id = ?
        """, (session_id,))
        row = cur.fetchone()
        if not row:
            return None
        msg_count = self.get_message_count(session_id)
        return {
            "session_id": row["session_id"],
            "project_id": row["project_id"] or "",
            "project_name": row["project_name"] or "",
            "project_path": row["project_path"] or "",
            "parent_session_id": row["parent_session_id"],
            "fork_point": row["fork_point"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "title": row["title"] or "",
            "kind": row["kind"] or "session",
            "workspace_path": row["workspace_path"] or "",
            "message_count": msg_count,
        }

    def list_sessions(self, project_id: str | None = None, kind: str | None = None) -> list[dict]:
        where = []
        params = []
        if project_id:
            where.append("s.project_id = ?")
            params.append(project_id)
        if kind:
            where.append("s.kind = ?")
            params.append(kind)

        where_sql = f"WHERE {' AND '.join(where)}" if where else ""
        cursor = self.conn.execute(f"""
            SELECT s.*, COUNT(m.id) as message_count
            FROM sessions s
            LEFT JOIN messages m ON s.session_id = m.session_id
            {where_sql}
            GROUP BY s.session_id
            ORDER BY s.updated_at DESC
        """, tuple(params))
        return [
            {
                "session_id": row["session_id"],
                "project_id": row["project_id"] or "",
                "parent_session_id": row["parent_session_id"],
                "fork_point": row["fork_point"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "title": row["title"] or "",
                "kind": row["kind"] or "session",
                "workspace_path": row["workspace_path"] or "",
                "message_count": row["message_count"],
            }
            for row in cursor.fetchall()
        ]

    def create_session(self, project_id: str, title: str = "", kind: str = "session", workspace_path: str = "") -> str:
        """在项目下创建会话/任务"""
        project = self.get_project(project_id)
        if not project:
            raise ValueError(f"项目不存在: {project_id}")

        session_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        ws = workspace_path or project["workspace_path"]
        self.conn.execute(
            "INSERT INTO sessions (session_id, project_id, created_at, updated_at, title, kind, workspace_path) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (session_id, project_id, now, now, title or "", kind, ws),
        )
        self.conn.execute("UPDATE projects SET updated_at = ? WHERE project_id = ?", (now, project_id))
        self.conn.commit()
        return session_id

    def update_session(self, session_id: str, title: str | None = None, workspace_path: str | None = None):
        if title is not None:
            self.conn.execute("UPDATE sessions SET title = ? WHERE session_id = ?", (title, session_id))
        if workspace_path is not None:
            self.conn.execute("UPDATE sessions SET workspace_path = ? WHERE session_id = ?", (workspace_path, session_id))
        self.conn.commit()

    def fork_session(self, source_session_id: str, fork_at_message_id: int | None = None) -> str:
        new_id = str(uuid.uuid4())
        now = datetime.now().isoformat()

        source_messages = self.get_history(source_session_id)
        if not source_messages:
            raise ValueError(f"源会话无消息: {source_session_id}")

        if fork_at_message_id:
            copy_until = None
            for i, m in enumerate(source_messages):
                if m["id"] == fork_at_message_id:
                    copy_until = i + 1
                    break
            if copy_until is None:
                raise ValueError(f"消息不存在: {fork_at_message_id}")
            messages_to_copy = source_messages[:copy_until]
        else:
            messages_to_copy = source_messages

        source_info = self.get_session_info(source_session_id)

        self.conn.execute(
            "INSERT INTO sessions (session_id, project_id, parent_session_id, fork_point, created_at, updated_at, title, kind, workspace_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                new_id,
                source_info["project_id"] if source_info else "",
                source_session_id,
                fork_at_message_id,
                now,
                now,
                source_info["title"] if source_info else "",
                source_info["kind"] if source_info else "session",
                source_info["workspace_path"] if source_info else "",
            ),
        )

        for msg in messages_to_copy:
            self.conn.execute(
                "INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
                (new_id, msg["role"], msg["content"], msg["timestamp"]),
            )

        self.conn.commit()
        return new_id

    def delete_session(self, session_id: str):
        self.conn.executescript(f"""
            PRAGMA synchronous = OFF;
            DELETE FROM messages WHERE session_id = '{session_id}';
            DELETE FROM sessions WHERE session_id = '{session_id}';
            PRAGMA synchronous = FULL;
        """)

    def update_title(self, session_id: str, title: str):
        self.conn.execute("UPDATE sessions SET title = ? WHERE session_id = ?", (title, session_id))
        self.conn.commit()

    async def remember(self, session_id: str, content: str, metadata: dict = None):
        if not self.chroma_available:
            return
        self.chroma_collection.add(
            documents=[content],
            ids=[f"{session_id}_{datetime.now().timestamp()}"],
            metadatas=[{
                "session_id": session_id,
                "timestamp": datetime.now().isoformat(),
                **(metadata or {}),
            }],
        )

    async def recall(self, query: str, session_id: str = None, top_k: int = 5) -> list[str]:
        if not self.chroma_available:
            return []
        where = {"session_id": session_id} if session_id else None
        results = self.chroma_collection.query(
            query_texts=[query],
            n_results=top_k,
            where=where,
        )
        return results["documents"][0] if results.get("documents") else []


memory_system = MemorySystem()
