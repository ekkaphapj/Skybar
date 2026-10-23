@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-pos58.ps1"
if errorlevel 1 echo If administrator access is required, run this file as administrator.
pause
