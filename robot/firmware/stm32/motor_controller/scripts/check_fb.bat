@echo off
title Kiem tra cong COM STM32 - CampusTour
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0check_fb.ps1" %*
if errorlevel 1 (color 4F) else (color 2F)
echo.
pause
