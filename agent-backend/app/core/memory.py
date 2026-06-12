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
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                parent_session_id TEXT,
                fork_point INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                title TEXT DEFAULT ''
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

    def _ensure_session(self, session_id: str):
        """确保会话记录存在"""
        cur = self.conn.execute("SELECT session_id FROM sessions WHERE session_id = ?", (session_id,))
        if not cur.fetchone():
            now = datetime.now().isoformat()
            self.conn.execute(
                "INSERT INTO sessions (session_id, created_at, updated_at) VALUES (?, ?, ?)",
                (session_id, now, now),
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

    def get_session_info(self, session_id: str) -> dict | None:
        cur = self.conn.execute(
            "SELECT * FROM sessions WHERE session_id = ?", (session_id,)
        )
        row = cur.fetchone()
        if not row:
            return None
        msg_count = self.get_message_count(session_id)
        return {
            "session_id": row["session_id"],
            "parent_session_id": row["parent_session_id"],
            "fork_point": row["fork_point"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "title": row["title"] or "",
            "message_count": msg_count,
        }

    def fork_session(self, source_session_id: str, fork_at_message_id: int | None = None) -> str:
        """从源会话分叉出一个新会话

        fork_at_message_id: None 表示分叉整个会话
                           指定消息 ID 表示只复制到该消息为止
        """
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

        # 创建会话记录
        self.conn.execute(
            "INSERT INTO sessions (session_id, parent_session_id, fork_point, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (new_id, source_session_id, fork_at_message_id, now, now),
        )

        # 复制消息
        for msg in messages_to_copy:
            self.conn.execute(
                "INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
                (new_id, msg["role"], msg["content"], msg["timestamp"]),
            )

        self.conn.commit()
        return new_id

    def list_sessions(self) -> list[dict]:
        cursor = self.conn.execute("""
            SELECT s.*, COUNT(m.id) as message_count
            FROM sessions s
            LEFT JOIN messages m ON s.session_id = m.session_id
            GROUP BY s.session_id
            ORDER BY s.updated_at DESC
        """)
        return [
            {
                "session_id": row["session_id"],
                "parent_session_id": row["parent_session_id"],
                "fork_point": row["fork_point"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "title": row["title"] or "",
                "message_count": row["message_count"],
            }
            for row in cursor.fetchall()
        ]

    def delete_session(self, session_id: str):
        self.conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        self.conn.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
        self.conn.commit()

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
