@echo off
chcp 65001 >nul 2>&1
title RAG 知识库服务
cd /d "%~dp0"

echo ========================================
echo   RAG 知识库服务
echo ========================================
echo.

REM Check Python venv
if not exist ".venv\Scripts\python.exe" (
    echo [1/2] Creating Python virtual environment...
    python -m venv .venv
    echo [2/2] Installing dependencies...
    .venv\Scripts\pip install -r requirements.txt -q
    echo.
    echo Dependencies installed!
    echo.
)

echo Starting server...
echo Management page: http://localhost:8000
echo API endpoint:    http://localhost:8000/v1
echo.
echo Press Ctrl+C to stop
echo ----------------------------------------
.venv\Scripts\python server.py
pause
