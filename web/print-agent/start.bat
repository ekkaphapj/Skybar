@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Cottage POS Print Agent (USB Thermal)
echo ================================================
echo   Cottage POS Print Agent (USB Thermal Printer)
echo   ปล่อยหน้าต่างนี้เปิดไว้ตลอดตอนใช้งานเว็บ POS
echo ================================================
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" "%~dp0agent.js"
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js was not found. Use the Windows x64 portable package with runtime included.
    echo Download: https://github.com/ekkaphapj/Skybar/releases/latest
  ) else (
    node "%~dp0agent.js"
  )
)
echo.
echo โปรแกรมหยุดทำงานแล้ว ถ้าไม่ได้ตั้งใจปิด ให้ตรวจสอบข้อความด้านบน
pause
