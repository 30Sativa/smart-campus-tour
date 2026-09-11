@echo off
setlocal
cd /d "%~dp0.."

set "IDE=C:\ST\STM32CubeIDE_2.1.1\STM32CubeIDE\plugins"
set "MAKE=%IDE%\com.st.stm32cube.ide.mcu.externaltools.make.win32_2.2.200.202604021615\tools\bin"
set "GCC=%IDE%\com.st.stm32cube.ide.mcu.externaltools.gnu-tools-for-stm32.14.3.rel1.win32_1.0.100.202602081740\tools\bin"
set "OCD_BIN=%IDE%\com.st.stm32cube.ide.mcu.externaltools.openocd.win32_2.4.500.202604080855\tools\bin"
set "OCD_SCR=%IDE%\com.st.stm32cube.ide.mcu.debug.openocd_2.3.400.202606220929\resources\openocd\st_scripts"

set "PATH=%MAKE%;%GCC%;%PATH%"

echo ================================================
echo   [1/2] Build
echo ================================================
make -C Debug all -j8
if errorlevel 1 (
  echo.
  echo [LOI] Build that bai - sua code truoc da.
  pause
  exit /b 1
)

echo.
echo ================================================
echo   [2/2] Nap qua ST-Link
echo ================================================
"%OCD_BIN%\openocd.exe" -s "%OCD_SCR%" -f scripts\stlink.cfg -c "program Debug/motor_controller.elf verify reset exit"
if errorlevel 1 (
  echo.
  echo [LOI] Nap that bai. Kiem tra theo thu tu:
  echo   1. Dong STM32CubeIDE va STM32CubeProgrammer
  echo   2. Du 5 day: 3.3V, GND, SWCLK-^>CLK, SWDIO-^>DIO, RST-^>NRST
  echo   3. Thao tai khoi board (motor driver, contactor, sonar, IMU)
  echo   4. Ha toc do: sua CLOCK_FREQ trong scripts\stlink.cfg xuong 100
  echo.
  echo Chi tiet: docs\FLASHING.md
  pause
  exit /b 1
)

echo.
echo ================================================
echo   XONG - firmware da chay tren board
echo ================================================
pause
