@echo off
chcp 65001 >nul
title Agent Workflow

echo ========================================
echo   Agent Workflow
echo ========================================
echo.

cd /d "%~dp0"

:: Check node_modules
if not exist "node_modules\" (
    echo [INFO] node_modules not found, running npm install...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
    echo.
)

:: Check better-sqlite3 native module
if not exist "node_modules\better-sqlite3\build\Release\better_sqlite3.node" (
    echo [INFO] Rebuilding better-sqlite3 for Electron...
    call npx electron-rebuild -f -w better-sqlite3
    if errorlevel 1 (
        echo [ERROR] electron-rebuild failed.
        pause
        exit /b 1
    )
    echo.
)

:: Build main process
echo [INFO] Building main process...
call npx tsc -p tsconfig.main.json
if errorlevel 1 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)

:: Build renderer
echo [INFO] Building renderer...
call npx vite build
if errorlevel 1 (
    echo [ERROR] Renderer build failed.
    pause
    exit /b 1
)

echo [INFO] Starting Agent Workflow...
echo.

start "" npx electron .

exit
