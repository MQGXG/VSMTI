param(
    [switch]$full
)

Write-Host "=== OmniAgent 环境设置 ===" -ForegroundColor Cyan
Write-Host ""

# 1. 检查 Node.js
$npmPath = "C:\Program Files\nodejs\npm.cmd"
if (-not (Test-Path $npmPath)) {
    Write-Host "❌ 未找到 Node.js，请从 https://nodejs.org 安装" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Node.js 已安装" -ForegroundColor Green

# 2. 创建便携 Python
$pythonDir = Join-Path $PWD "portable-python"
if (-not (Test-Path "$pythonDir\Scripts\python.exe")) {
    Write-Host "📦 正在创建便携 Python 环境..." -ForegroundColor Yellow
    
    # 检查系统 Python
    $sysPython = Get-Command "python" -ErrorAction SilentlyContinue
    if (-not $sysPython) {
        Write-Host "❌ 未找到 Python，请先从 https://python.org 安装 Python 3.10+" -ForegroundColor Red
        exit 1
    }
    
    python -m venv $pythonDir
    Write-Host "  安装核心依赖..." -ForegroundColor Yellow
    & "$pythonDir\Scripts\pip.exe" install fastapi uvicorn openai anthropic python-multipart duckduckgo_search -q
    
    if ($full) {
        Write-Host "  安装完整依赖（含数据分析、图表）..." -ForegroundColor Yellow
        & "$pythonDir\Scripts\pip.exe" install pandas matplotlib chromadb playwright -q
    }
    
    Write-Host "✅ 便携 Python 已创建" -ForegroundColor Green
} else {
    Write-Host "✅ 便携 Python 已存在" -ForegroundColor Green
}

# 3. 安装前端依赖
Write-Host "📦 安装前端依赖..." -ForegroundColor Yellow
& $npmPath install
Write-Host "✅ 前端依赖已安装" -ForegroundColor Green

# 4. 摘要
$size = (Get-ChildItem $pythonDir -Recurse -File | Measure-Object Length -Sum).Sum
Write-Host ""
Write-Host "=== 设置完成 ===" -ForegroundColor Cyan
Write-Host "便携 Python: $('{0:N0}' -f ($size/1MB)) MB"
Write-Host ""
Write-Host "启动命令: npm run dev" -ForegroundColor Green
Write-Host "打包命令: npm run package:win" -ForegroundColor Green
