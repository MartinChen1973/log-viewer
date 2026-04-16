@echo off

setlocal EnableExtensions

set "ROOT=%~dp0"

set "ROOT=%ROOT:~0,-1%"



echo Starting stack: MCP OA + Bingchuan + aux + log-analyzer, AI API, Flask log-viewer (5000^)...

echo Root: %ROOT%



REM 1) MCP OA FAISS (28081) — folder: mcp-servers\mcp-server-oa (lookup_docs; 86xx can be excluded on Windows — use MCP_PORT to override)

REM ## ⬇️ cmd /k + title keeps the taskbar/console label readable (direct python.exe titles often show only the .exe path).

if exist "%ROOT%\mcp-servers\mcp-server-oa\venv\Scripts\python.exe" (

  start "MCP OA (28081)" /D "%ROOT%\mcp-servers\mcp-server-oa" cmd /k "title MCP OA (28081) & set MCP_PORT=28081&& venv\Scripts\python.exe server.py"

) else (

  start "MCP OA (28081)" /D "%ROOT%\mcp-servers\mcp-server-oa" cmd /k "title MCP OA (28081) & set MCP_PORT=28081&& python server.py"

)

timeout /t 2 /nobreak >nul



REM 2) MCP Bingchuan FAISS (28083) — does not collide with OA (28081) or aux (28082)

if exist "%ROOT%\mcp-servers\mcp-server-bingchuan\venv\Scripts\python.exe" (

REM ## ⬇️ Use cwd-relative venv path after /D — nested ""quotes"" around %ROOT%\...\python.exe can make cmd run `python` with the .exe as a script (SyntaxError on \x90).

  start "MCP Bingchuan (28083)" /D "%ROOT%\mcp-servers\mcp-server-bingchuan" cmd /k "title MCP Bingchuan (28083) & set MCP_PORT=28083&& venv\Scripts\python.exe server.py"

) else (

  start "MCP Bingchuan (28083)" /D "%ROOT%\mcp-servers\mcp-server-bingchuan" cmd /k "title MCP Bingchuan (28083) & set MCP_PORT=28083&& python server.py"

)

timeout /t 2 /nobreak >nul



REM 3) Auxiliary MCP (28082; empty tools demo — optional third connection in ai-api)

if exist "%ROOT%\mcp-servers\mcp-server\venv\Scripts\python.exe" (

  start "MCP aux (28082)" /D "%ROOT%\mcp-servers\mcp-server" cmd /k "title MCP aux (28082) & set MCP_PORT=28082&& venv\Scripts\python.exe server.py"

) else (

  start "MCP aux (28082)" /D "%ROOT%\mcp-servers\mcp-server" cmd /k "title MCP aux (28082) & set MCP_PORT=28082&& python server.py"

)

timeout /t 3 /nobreak >nul



REM 3b) MCP log-analyzer (28084) — ai-api/skills/* log playbooks for MCP tools

python -m pip install -q -r "%ROOT%\mcp-servers\mcp-log-analyzer\requirements.txt"

if exist "%ROOT%\mcp-servers\mcp-log-analyzer\venv\Scripts\python.exe" (

  start "MCP log-analyzer (28084)" /D "%ROOT%\mcp-servers\mcp-log-analyzer" cmd /k "title MCP log-analyzer (28084) & set MCP_PORT=28084&& venv\Scripts\python.exe server.py"

) else (

  start "MCP log-analyzer (28084)" /D "%ROOT%\mcp-servers\mcp-log-analyzer" cmd /k "title MCP log-analyzer (28084) & set MCP_PORT=28084&& python server.py"

)

timeout /t 2 /nobreak >nul



REM 4) FastAPI + deep agent (loads MCP at process startup)

if exist "%ROOT%\ai-api\venv\Scripts\python.exe" (

  start "AI API (8500)" /D "%ROOT%\ai-api" cmd /k "title AI API (8500) & venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8500"

) else (

  start "AI API (8500)" /D "%ROOT%\ai-api" cmd /k "title AI API (8500) & uvicorn main:app --host 127.0.0.1 --port 8500"

)

timeout /t 5 /nobreak >nul



REM 5) Flask log-viewer (same as run.bat: static UI + /docs on port 5000)

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\warn-if-port-in-use.ps1" -Port 5000 -Hint "Close the old Flask window or taskkill that PID; then this new instance can bind."

python -m pip install -q -r "%ROOT%\backend\requirements.txt"

start "Flask log-viewer (5000)" /D "%ROOT%\backend" cmd /k "title Flask log-viewer (5000) & python app.py"

timeout /t 4 /nobreak >nul

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\arrange-console-grid.ps1"



REM ## ⬇️ AI API blocks accept until lifespan finishes (MCP retries, model, SQLite); open browser only after /openapi.json responds

echo Waiting for AI API (8500) before opening docs tabs (can take up to ~120s while MCP/model/SQLite initialize^)...

echo Do not close this window until you see the browser message below, or tabs will never open.

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\wait-http-ready.ps1" -Url "http://127.0.0.1:8500/openapi.json" -Label "AI API (8500)" -MaxWaitSec 120

if errorlevel 1 echo WARNING: AI API ^(8500^) did not respond in time; opening tabs anyway - refresh /docs when its console finishes startup.



REM ## ⬇️ Use PowerShell Start-Process (registry + standard paths) - cmd start + msedge + multiple URLs is easy to mis-parse.

echo Opening documentation tabs...

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\open-local-docs.ps1" "http://127.0.0.1:8500/docs" "http://127.0.0.1:28081/docs" "http://127.0.0.1:28082/docs" "http://127.0.0.1:28083/docs" "http://127.0.0.1:28084/docs" "http://127.0.0.1:5000/docs" "http://127.0.0.1:5000/"

if errorlevel 1 (
  echo WARNING: PowerShell open-local-docs failed; retrying with cmd start for each URL...
  start "" "http://127.0.0.1:8500/docs"
  ping -n 2 127.0.0.1 >nul
  start "" "http://127.0.0.1:28081/docs"
  ping -n 2 127.0.0.1 >nul
  start "" "http://127.0.0.1:28082/docs"
  ping -n 2 127.0.0.1 >nul
  start "" "http://127.0.0.1:28083/docs"
  ping -n 2 127.0.0.1 >nul
  start "" "http://127.0.0.1:28084/docs"
  ping -n 2 127.0.0.1 >nul
  start "" "http://127.0.0.1:5000/docs"
  ping -n 2 127.0.0.1 >nul
  start "" "http://127.0.0.1:5000/"
)



echo.

echo One browser window should show seven tabs ^(8500 AI / 28081-28084 MCP / 5000 log-viewer^). Six service consoles should be running.

echo Press any key to close this launcher window (servers keep running).

pause >nul
