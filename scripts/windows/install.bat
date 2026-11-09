@echo off
rem SAB - installs the extension and its automatic updates. Double-click to run.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f = Join-Path $env:TEMP 'sab-update.ps1'; Invoke-WebRequest -Uri 'https://github.com/ZSWolt/SAB/releases/download/latest/sab-update.ps1' -OutFile $f -UseBasicParsing; & $f -Install"
pause
