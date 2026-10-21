@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 20+ from https://nodejs.org and try again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies for the first run...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed. Check your internet connection and npm output.
    pause
    exit /b 1
  )
)
if not exist .env copy .env.example .env >nul
echo Starting SalesPilot. Open http://localhost:5173 in your browser.
call npm run dev
pause
