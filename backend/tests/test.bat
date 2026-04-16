@echo off
REM One-click backend tests: install deps, run pytest from backend (parent of this folder).
cd /d "%~dp0.."

python -m pip install -q -r requirements.txt -r requirements-dev.txt
if errorlevel 1 (
  echo pip install failed.
  pause
  exit /b 1
)

python -m pytest tests -v --tb=short
if errorlevel 1 (
  echo.
  echo Backend tests failed.
  pause
  exit /b 1
)

echo.
echo Backend tests passed.
pause
exit /b 0
