@echo off
setlocal
cd /d "%~dp0"
title Cottage POS Print Agent
echo ================================================
echo Cottage POS Print Agent - keep this window open
echo ================================================
if exist "%~dp0runtime\node.exe" goto bundled
where node >nul 2>nul
if errorlevel 1 goto missing
node "%~dp0agent.js"
goto stopped
:bundled
"%~dp0runtime\node.exe" "%~dp0agent.js"
goto stopped
:missing
echo Node.js was not found. Download the Windows x64 portable package:
echo https://github.com/ekkaphapj/Skybar/releases/latest
:stopped
echo.
echo Agent stopped. Check the messages above before closing this window.
pause
endlocal
