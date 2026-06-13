import os
from pathlib import Path
from pydantic_settings import BaseSettings


def _find_and_load_env():
    """按优先级查找 .env 文件并加载到环境变量"""
    root_dir = Path(__file__).resolve().parent.parent.parent  # 项目根目录
    backend_dir = Path(__file__).resolve().parent.parent      # agent-backend 目录

    candidates = [
        root_dir / ".env",
        backend_dir / ".env",
        root_dir / ".env.example",
    ]

    for env_file in candidates:
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip("\"'")
                if value and key not in os.environ:
                    os.environ[key] = value
            break


_find_and_load_env()


class Settings(BaseSettings):
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"
    ollama_base_url: str = "http://localhost:11434"
    database_url: str = "sqlite:///./data/omniagent.db"
    redis_url: str = "redis://localhost:6379"
    chroma_path: str = "./data/chroma"
    upload_dir: str = "./data/uploads"
    max_iterations: int = 10
    jwt_secret: str = "dev-secret-key-change-in-production"
    cors_origins: list[str] = ["http://localhost:3000"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
