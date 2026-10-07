@echo off
TITLE MusicTalk Launcher
echo ==============================================================================
echo                      Starting MusicTalk Microservices
echo ==============================================================================
echo.

REM Set project root
set ROOT_DIR=%~dp0

REM Launch Recognition Service (:8000)
echo [1/5] Launching Recognition Service on port 8000...
start "MusicTalk - Recognition Service (8000)" cmd /k "cd /d "%ROOT_DIR%recognition-service" & (call ..\venv\Scripts\activate.bat 2>nul || echo VENV not found, using global Python) & uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

REM Launch Catalog Service (:8001)
echo [2/5] Launching Catalog Service on port 8001...
start "MusicTalk - Catalog Service (8001)" cmd /k "cd /d "%ROOT_DIR%catalog-service" & call ..\venv\Scripts\activate.bat 2>nul & uvicorn main:app --host 0.0.0.0 --port 8001 --reload"

REM Launch Recommendation Service (:8002)
echo [3/5] Launching Recommendation Service on port 8002...
start "MusicTalk - Recommendation Service (8002)" cmd /k "cd /d "%ROOT_DIR%recommendation-service" & call ..\venv\Scripts\activate.bat 2>nul & uvicorn main:app --host 0.0.0.0 --port 8002 --reload"

REM Launch API Gateway (:3000)
echo [4/5] Launching API Gateway on port 3000...
start "MusicTalk - API Gateway (3000)" cmd /k "cd /d "%ROOT_DIR%gateway" & call ..\venv\Scripts\activate.bat 2>nul & uvicorn main:app --host 0.0.0.0 --port 3000 --reload"

REM Launch Frontend (:5173)
echo [5/5] Launching Frontend (Vite) on port 5173...
start "MusicTalk - Frontend (5173)" cmd /k "cd /d "%ROOT_DIR%frontend" & if not exist node_modules (call npm install) & call npm run dev"

echo.
echo ==============================================================================
echo All 5 services launched in separate windows!
echo Open your browser at: http://localhost:5173
echo ==============================================================================