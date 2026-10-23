@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Cottage POS - Windows printer diagnostics
if exist "%~dp0runtime\node.exe" ("%~dp0runtime\node.exe" --version) else (node --version)
powershell.exe -NoProfile -Command "Get-Printer | Select-Object Name,PortName,PrinterStatus | Format-Table -AutoSize; foreach ($p in 9130,9131) { try { $s=Invoke-RestMethod ('http://127.0.0.1:'+$p+'/status') -TimeoutSec 3; Write-Output ('Agent '+$s.agent+' on port '+$p) } catch { Write-Output ('No agent on port '+$p) } }"
pause
