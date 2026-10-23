@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Cottage POS Print Agent (USB Thermal)
echo ================================================
echo   Cottage POS Print Agent (USB Thermal Printer)
echo   ปล่อยหน้าต่างนี้เปิดไว้ตลอดตอนใช้งานเว็บ POS
echo ================================================
node agent.js
echo.
echo โปรแกรมหยุดทำงานแล้ว ถ้าไม่ได้ตั้งใจปิด ให้ตรวจสอบข้อความด้านบน
pause
