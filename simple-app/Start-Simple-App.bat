@echo off
echo Starting RAGMaker Desktop Simple - VISIBLE VERSION
echo =================================================
echo.
cd /d "%~dp0"
echo Current directory: %CD%
echo.
echo Installing dependencies if needed...
if not exist "node_modules" (
    echo Installing npm packages...
    npm install
)
echo.
echo Launching application...
echo The window WILL be visible!
echo.
npm start
pause