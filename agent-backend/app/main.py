import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api import chat, sessions, files, models, workspace_api, projects
from app.core.hooks_setup import setup_default_hooks
from app.core.cron_scheduler import start_scheduler as start_cron


from app.core.memory import memory_system
from app.core.workspace import workspace


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 注册默认钩子
    setup_default_hooks()
    # 如果没有项目，创建一个默认项目指向当前工作目录
    if not memory_system.list_projects():
        memory_system.create_project(
            name=workspace.path.name or "默认项目",
            workspace_path=str(workspace.path),
        )
        print(f"[Startup] 创建默认项目: {workspace.path}", flush=True)
    # 启动 Cron 调度器
    start_cron()
    # 启动完成信号
    print("OmniAgent backend startup complete", flush=True)
    print("OmniAgent backend startup complete", file=sys.stderr, flush=True)
    yield
    # 关闭清理
    print("OmniAgent backend shutting down", flush=True)


app = FastAPI(title="OmniAgent API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "file://",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(projects.router)
app.include_router(sessions.router)
app.include_router(files.router)
app.include_router(models.router)
app.include_router(workspace_api.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/health")
async def health_simple():
    return {"status": "ok"}

