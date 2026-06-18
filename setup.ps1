param(
    [switch]$full
)

Write-Host "=== Mira 环境设置 ===" -ForegroundColor Cyan
Write-Host ""

# 1. 检查 Node.js
$npmPath = "C:\Program Files\nodejs\npm.cmd"
if (-not (Test-Path $npmPath)) {
    Write-Host "❌ 未找到 Node.js，请从 https://nodejs.org 安装" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Node.js 已安装" -ForegroundColor Green

# 2. 安装前端依赖
Write-Host "📦 安装前端依赖..." -ForegroundColor Yellow
& $npmPath install
Write-Host "✅ 前端依赖已安装" -ForegroundColor Green

# 3. 摘要
Write-Host ""
Write-Host "=== 设置完成 ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "启动命令: npm run dev" -ForegroundColor Green
Write-Host "打包命令: npm run package:win" -ForegroundColor Green
