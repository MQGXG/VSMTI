import os
from pathlib import Path
from fastapi import APIRouter, UploadFile, File
from fastapi.responses import FileResponse
from app.config import settings

router = APIRouter()


@router.post("/api/files/upload")
async def upload_file(file: UploadFile = File(...)):
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / file.filename
    content = await file.read()
    file_path.write_bytes(content)
    return {
        "filename": file.filename,
        "size": len(content),
        "path": str(file_path),
    }


@router.get("/api/files/{filename}")
async def get_file(filename: str):
    file_path = Path(settings.upload_dir) / filename
    if not file_path.exists():
        return {"error": "文件不存在"}
    return FileResponse(file_path)


@router.get("/api/files")
async def list_files():
    upload_dir = Path(settings.upload_dir)
    if not upload_dir.exists():
        return {"files": []}
    files = []
    for f in upload_dir.iterdir():
        if f.is_file():
            files.append({"name": f.name, "size": f.stat().st_size})
    return {"files": files}
