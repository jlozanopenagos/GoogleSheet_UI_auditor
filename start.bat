@echo off
setlocal enabledelayedexpansion
title GoogleSheet UI Auditor

echo ======================================================================
echo   GoogleSheet UI Auditor - Windows 11 Studio Launcher
echo ======================================================================
echo.

cd /d "%~dp0"

:: 1. Detect Python or py launcher
set "PYTHON_CMD="
where py >nul 2>nul
if %errorlevel% equ 0 (
    set "PYTHON_CMD=py -3"
    goto :python_found
)

where python >nul 2>nul
if %errorlevel% equ 0 (
    set "PYTHON_CMD=python"
    goto :python_found
)

:: If Python is not installed, use Windows 11 winget
echo [!] Python was not detected on this Windows 11 device.
echo [*] Attempting to install Python via Windows Package Manager (winget)...
echo.
where winget >nul 2>nul
if %errorlevel% equ 0 (
    winget install Python.Python.3.11 --accept-package-agreements --accept-source-agreements
    if %errorlevel% equ 0 (
        echo.
        echo [OK] Python installed successfully! Refreshing environment...
        set "PATH=%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python311\Scripts;%PATH%"
        set "PYTHON_CMD=python"
        goto :python_found
    )
)

echo [!] Automatic installation failed or winget is unavailable.
echo [*] Opening official Python download page...
start https://www.python.org/downloads/
echo.
echo Please install Python (check 'Add python.exe to PATH' during install),
echo then run this script again.
pause
exit /b 1

:python_found
echo [*] Using Python: %PYTHON_CMD%
%PYTHON_CMD% --version
echo.

:: 2. Ensure .env exists
if not exist ".env" (
    if exist ".env.example" (
        echo [*] No .env found. Creating .env from .env.example...
        copy .env.example .env >nul
        echo [!] Created .env file. Please check your GEMINI_API_KEY in .env if needed.
        echo.
    )
)

:: 3. Setup / Activate Virtual Environment
if not exist ".venv" (
    echo [*] Creating isolated virtual environment (.venv)...
    %PYTHON_CMD% -m venv .venv
    if %errorlevel% neq 0 (
        echo [!] Failed to create venv. Running with system python directly...
        goto :run_system
    )
)

echo [*] Activating virtual environment (.venv)...
call .venv\Scripts\activate.bat

echo [*] Checking dependencies...
python -m pip install -r requirements.txt --quiet --disable-pip-version-check
if %errorlevel% neq 0 (
    echo [!] Warning: Some dependencies failed to install. Attempting launch anyway...
)

echo.
echo [*] Launching GoogleSheet UI Auditor Studio...
python run.py
goto :done

:run_system
%PYTHON_CMD% -m pip install -r requirements.txt --quiet --disable-pip-version-check
%PYTHON_CMD% run.py

:done
pause

