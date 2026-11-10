@echo off
title GoogleSheet UI Auditor
cd /d "%~dp0"

echo ======================================================================
echo   GoogleSheet UI Auditor - Studio Launcher
echo ======================================================================
echo.

:: 1. Detect Python command (py launcher or python)
set "PY_CMD="
where py >nul 2>&1 && set "PY_CMD=py"
if "%PY_CMD%"=="" where python >nul 2>&1 && set "PY_CMD=python"

if "%PY_CMD%"=="" goto :install_python

echo [*] Python detected:
%PY_CMD% --version
echo.

:: 2. Auto-initialize .env if missing
if not exist .env if exist .env.example copy .env.example .env >nul

:: 3. Setup virtual environment if missing
if not exist .venv goto :create_venv
goto :activate_venv

:create_venv
echo [*] Setting up local virtual environment...
%PY_CMD% -m venv .venv
if errorlevel 1 goto :run_direct

:activate_venv
if exist .venv\Scripts\activate.bat (
    call .venv\Scripts\activate.bat
    echo [*] Checking dependencies...
    python -m pip install -r requirements.txt --quiet --disable-pip-version-check
    echo.
    echo [*] Starting GoogleSheet UI Auditor studio...
    python run.py
    goto :end
)

:run_direct
echo [*] Checking dependencies with system Python...
%PY_CMD% -m pip install -r requirements.txt --quiet --disable-pip-version-check
echo.
echo [*] Starting GoogleSheet UI Auditor studio...
%PY_CMD% run.py
goto :end

:install_python
echo [!] Python was not found on this Windows 11 device.
echo [*] Attempting to install Python via winget...
where winget >nul 2>&1
if errorlevel 1 goto :manual_python

winget install Python.Python.3.11 --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto :manual_python

echo.
echo [OK] Python installed! Please close and reopen start.bat.
pause
exit /b 0

:manual_python
echo.
echo [!] Could not install Python automatically.
echo [*] Opening official Python download page in your browser...
start https://www.python.org/downloads/
echo.
echo Please install Python (be sure to check 'Add python.exe to PATH'),
echo then double-click start.bat again.
pause
exit /b 1

:end
if errorlevel 1 (
    echo.
    echo [!] Server exited. Press any key to close this window.
    pause
)
