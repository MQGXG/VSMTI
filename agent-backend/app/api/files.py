import os
from pathlib import Path
from fastapi import APIRouter, UploadFile, File
from fastapi.responses import FileResponse
from app.config import settings

# 项目根目录 (agent-backend/..)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent

router = APIRouter()


@router.post("/api/files/upload")
async def upload_file(file: UploadFile = File(...)):
    upload_dir = PROJECT_ROOT / "data" / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / file.filename
    content = await file.read()
    file_path.write_bytes(content)
    relative_path = f"data/uploads/{file.filename}"
    return {
        "filename": file.filename,
        "size": len(content),
        "path": relative_path,
    }


@router.get("/api/files/{filename}")
async def get_file(filename: str):
    file_path = PROJECT_ROOT / "data" / "uploads" / filename
    if not file_path.exists():
        return {"error": "文件不存在"}
    return FileResponse(file_path)


@router.get("/api/files")
async def list_files():
    upload_dir = PROJECT_ROOT / "data" / "uploads"
    if not upload_dir.exists():
        return {"files": []}
    files = []
    for f in upload_dir.iterdir():
        if f.is_file():
            files.append({"name": f.name, "size": f.stat().st_size})
    return {"files": files}
