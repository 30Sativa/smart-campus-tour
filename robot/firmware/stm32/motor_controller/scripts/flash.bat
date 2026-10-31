@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Nap firmware STM32 - CampusTour
rem Bam dup de nap firmware qua ST-Link (SWD).
rem Tim file .hex: cung thu muc voi file nay, roi ..\build\ (khi nam trong repo).
rem Tim STM32_Programmer_CLI: PATH, CubeProgrammer, roi CubeIDE.

cd /d "%~dp0"
set "TARGET=MotorController_G431.hex"

rem ---- 1. Tim file firmware --------------------------------------------------
set "HEX="
if exist "%~dp0%TARGET%" set "HEX=%~dp0%TARGET%"
if not defined HEX if exist "%~dp0..\build\%TARGET%" set "HEX=%~dp0..\build\%TARGET%"
if not defined HEX (
  for /f "delims=" %%F in ('dir /b /o-d "%~dp0*.hex" 2^>nul') do if not defined HEX set "HEX=%~dp0%%F"
)
if not defined HEX (
  echo [LOI] Khong tim thay file %TARGET%.
  echo       Dat file .hex cung thu muc voi file nay roi bam lai.
  goto :fail
)

rem ---- 2. Tim STM32CubeProgrammer CLI -----------------------------------------
set "CLI="
set "PF86=%ProgramFiles(x86)%"
for /f "delims=" %%C in ('where STM32_Programmer_CLI.exe 2^>nul') do if not defined CLI set "CLI=%%C"
for %%D in (
  "%ProgramFiles%\STMicroelectronics\STM32Cube\STM32CubeProgrammer\bin"
  "!PF86!\STMicroelectronics\STM32Cube\STM32CubeProgrammer\bin"
  "%LOCALAPPDATA%\Programs\STMicroelectronics\STM32Cube\STM32CubeProgrammer\bin"
) do if not defined CLI if exist "%%~D\STM32_Programmer_CLI.exe" set "CLI=%%~D\STM32_Programmer_CLI.exe"
if not defined CLI (
  for /d %%I in ("C:\ST\STM32CubeIDE*" "%ProgramFiles%\STMicroelectronics\STM32CubeIDE*") do (
    if not defined CLI for /f "delims=" %%C in ('dir /s /b "%%~I\STM32_Programmer_CLI.exe" 2^>nul') do if not defined CLI set "CLI=%%C"
  )
)
if not defined CLI (
  echo [LOI] Khong tim thay STM32_Programmer_CLI.exe.
  echo       Cai STM32CubeProgrammer: https://www.st.com/en/development-tools/stm32cubeprog.html
  goto :fail
)

echo ============================================================
echo  Firmware : !HEX!
echo  Cong cu  : !CLI!
echo ============================================================
echo  Truoc khi nap:
echo   - Ngat nguon dong luc (motor, contactor). Chi cap nguon mach STM32.
echo   - Cam ST-Link (SWDIO, SWCLK, GND, 3V3).
echo.
echo  Nhan phim bat ky de NAP, hoac dong cua so de huy.
pause >nul

rem ---- 3. Nap: thu "under reset" truoc, loi thi thu ket noi thuong -----------
echo.
echo [1/2] Nap (mode=UR)...
"!CLI!" -c port=SWD mode=UR -w "!HEX!" -v -rst
if not errorlevel 1 goto :ok

echo.
echo [2/2] Thu lai khong dung chan NRST (mode=Normal)...
"!CLI!" -c port=SWD -w "!HEX!" -v -rst
if not errorlevel 1 goto :ok

echo.
echo [LOI] Nap that bai. Kiem tra: day ST-Link, nguon 3V3 cua mach,
echo       khong mo CubeIDE/CubeProgrammer khac dang giu ST-Link.
goto :fail

:ok
echo.
echo ============================================================
echo  NAP THANH CONG - da verify va reset STM32.
echo  Kiem tra: mo cong COM, khung FB phai co 24 truong.
echo ============================================================
color 2F
pause
exit /b 0

:fail
color 4F
pause
exit /b 1
