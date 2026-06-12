import logging
from typing import Dict, List, Optional
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger(__name__)


class FetchModelsRequest(BaseModel):
    baseUrl: str
    apiKey: str = ""
    headers: Dict[str, str] = {}
    provider: str = "openai"


class ModelInfo(BaseModel):
    id: str
    name: Optional[str] = None


@router.post("/api/models/fetch")
async def fetch_models(request: FetchModelsRequest):
    """从提供商 API 获取可用模型列表（OpenAI 兼容格式）"""
    
    url = request.baseUrl.rstrip("/") + "/models"
    
    headers = {
        "Content-Type": "application/json",
        **request.headers,
    }
    
    if request.apiKey:
        headers["Authorization"] = f"Bearer {request.apiKey}"
    
    logger.info(f"[Models] Fetching from {url} for provider {request.provider}")
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as e:
        logger.error(f"[Models] HTTP error: {e}")
        raise HTTPException(status_code=502, detail=f"无法连接到提供商 API: {str(e)}")
    except Exception as e:
        logger.error(f"[Models] Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=f"获取模型列表失败: {str(e)}")
    
    # 解析 OpenAI 兼容格式
    models: List[ModelInfo] = []
    
    if isinstance(data, dict) and "data" in data:
        # OpenAI 标准格式: { "data": [{ "id": "gpt-4", ... }] }
        for item in data["data"]:
            if isinstance(item, dict) and "id" in item:
                model_id = item["id"]
                # 使用 id 作为 name（如果没有 object/name 字段）
                name = item.get("name") or item.get("object") or model_id
                models.append(ModelInfo(id=model_id, name=name))
    elif isinstance(data, list):
        # 某些提供商直接返回列表
        for item in data:
            if isinstance(item, dict) and "id" in item:
                models.append(ModelInfo(id=item["id"], name=item.get("name", item["id"])))
            elif isinstance(item, str):
                models.append(ModelInfo(id=item, name=item))
    
    if not models:
        logger.warning(f"[Models] No models found in response: {data.keys() if isinstance(data, dict) else type(data)}")
        raise HTTPException(status_code=422, detail="无法解析模型列表，提供商返回格式不支持")
    
    logger.info(f"[Models] Found {len(models)} models")
    return {
        "success": True,
        "count": len(models),
        "models": [{"id": m.id, "name": m.name or m.id} for m in models],
    }
