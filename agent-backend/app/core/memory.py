import json
import sqlite3
import os
from datetime import datetime
from pathlib import Path
from app.config import settings


class MemorySystem:
    def __init__(self):
        db_path = Path(settings.chroma_path).parent / "sessions.db"
        os.makedirs(db_path.parent, exist_ok=True)
        self.conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL
            )
        """)
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_session ON messages(session_id)")
        self.conn.commit()

        try:
            import chromadb
            self.chroma_client = chromadb.PersistentClient(path=settings.chroma_path)
            self.chroma_collection = self.chroma_client.get_or_create_collection("agent_memory")
            self.chroma_available = True
        except Exception:
            self.chroma_available = False

    def add_message(self, session_id: str, role: str, content: str):
        now = datetime.now().isoformat()
        self.conn.execute(
            "INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
            (session_id, role, content, now),
        )
        self.conn.commit()

    def get_history(self, session_id: str, limit: int = 50) -> list[dict]:
        cursor = self.conn.execute(
            "SELECT role, content, timestamp FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ?",
            (session_id, limit),
        )
        rows = cursor.fetchall()
        return [
            {"role": row[0], "content": row[1], "timestamp": row[2]}
            for row in reversed(rows)
        ]

    def list_sessions(self) -> list[str]:
        cursor = self.conn.execute(
            "SELECT session_id FROM messages GROUP BY session_id ORDER BY MAX(id) DESC"
        )
        return [row[0] for row in cursor.fetchall()]

    def delete_session(self, session_id: str):
        self.conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
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
