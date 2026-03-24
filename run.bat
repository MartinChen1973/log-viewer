@echo off
cd /d "%~dp0"

python -m pip install -q -r "%~dp0backend\requirements.txt"
if errorlevel 1 (
  echo pip install failed.
  pause
  exit /b 1
)

start "log-viewer server" /D "%~dp0backend" cmd /k python app.py

timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:5000/docs"
start "" "http://127.0.0.1:5000/"

echo.
echo OpenAPI: http://127.0.0.1:5000/docs
echo Web UI: http://127.0.0.1:5000/
echo Close the server window to stop.
