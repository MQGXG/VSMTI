# OmniAgent 部署文档

## 开发环境

### 前置要求

- Python 3.11+
- Node.js 20+
- pnpm 或 npm

### 后端启动

```bash
cd agent-backend
cp .env.example .env
# 编辑 .env 填入 API Key
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 前端启动

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:3000

## Docker 部署

### 一键部署

```bash
cp .env.example .env
# 编辑 .env 填入 API Key
docker-compose up -d
```

访问:
- 前端: http://localhost:3000
- 后端 API: http://localhost:8000/docs

### 单独构建

```bash
# 后端
docker build -t omniagent-backend ./agent-backend
docker run -p 8000:8000 -e OPENAI_API_KEY=sk-xxx omniagent-backend

# 前端
docker build -t omniagent-frontend ./frontend
docker run -p 3000:3000 omniagent-frontend
```
