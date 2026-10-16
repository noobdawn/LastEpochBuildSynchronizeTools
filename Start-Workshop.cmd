@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24, then run this file again.
  pause
  exit /b 1
)
if not exist node_modules\vite\package.json (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Starting Last Epoch Offline Workshop. Keep this window open while editing.
call npm run dev -- --open
pause
