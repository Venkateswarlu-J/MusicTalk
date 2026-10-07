# ==============================================================================
# MusicTalk — PowerShell Microservices Launcher
# ==============================================================================

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "                      Starting MusicTalk Microservices                        " -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

$rootDir = $PSScriptRoot

# 1. Recognition Service (:8000)
Write-Host "[1/5] Launching Recognition Service on port 8000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$rootDir\recognition-service'; uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

# 2. Catalog Service (:8001)
Write-Host "[2/5] Launching Catalog Service on port 8001..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$rootDir\catalog-service'; uvicorn main:app --host 0.0.0.0 --port 8001 --reload"

# 3. Recommendation Service (:8002)
Write-Host "[3/5] Launching Recommendation Service on port 8002..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$rootDir\recommendation-service'; uvicorn main:app --host 0.0.0.0 --port 8002 --reload"

# 4. API Gateway (:3000)
Write-Host "[4/5] Launching API Gateway on port 3000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$rootDir\gateway'; uvicorn main:app --host 0.0.0.0 --port 3000 --reload"

# 5. Frontend (:5173)
Write-Host "[5/5] Launching Frontend (Vite) on port 5173..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$rootDir\frontend'; npm run dev"

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host " All 5 services launched! Visit http://localhost:5173 in your browser. " -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
