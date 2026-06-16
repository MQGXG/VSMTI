#!/bin/bash

MODE=${1:-dev}

start_dev() {
    echo "🚀 启动 Mira 开发环境..."
    cd agent-backend && pip install -r requirements.txt -q && cd ..
    cd frontend && npm install && cd ..

    echo ""
    echo "🌐 后端: http://localhost:8000"
    echo "🌐 前端: http://localhost:3000"
    echo ""

    (cd agent-backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000) &
    (cd frontend && npm run dev) &
    wait
}

start_electron() {
    echo "🚀 启动 Mira 桌面应用..."
    cd agent-backend && pip install -r requirements.txt -q && cd ..
    cd frontend && npm install

    echo ""
    echo "🖥️  启动 Electron 窗口..."
    echo ""

    (cd agent-backend && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000) &
    npm run dev:electron
}

start_docker() {
    echo "🐳 启动 Mira Docker 环境..."
    docker-compose up -d --build
    echo ""
    echo "🌐 前端: http://localhost:3000"
    echo "🌐 后端: http://localhost:8000"
}

start_dist() {
    echo "📦 打包桌面应用..."
    cd frontend && npm install && npm run dist
    echo ""
    echo "✅ 安装包在 frontend/release/ 目录"
}

case $MODE in
    dev)      start_dev ;;
    electron) start_electron ;;
    docker)   start_docker ;;
    dist)     start_dist ;;
    *)        echo "用法: ./start.sh [dev|electron|docker|dist]" ;;
esac
