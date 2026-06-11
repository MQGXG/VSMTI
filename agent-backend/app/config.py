from pydantic_settings import BaseSettings

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

settings = Settings()
