"""
MCP server: log analysis skill playbooks from `aiend/skills/<profile>/SKILL.md`.

Streamable HTTP at http://<host>:<port>/mcp (default 127.0.0.1:28084; use with ai-api POST /analyze-log).
"""

from __future__ import annotations

import asyncio
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from starlette.responses import HTMLResponse, JSONResponse, Response

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SKILLS_ROOT = _REPO_ROOT / "aiend" / "skills"

# Repo-root .env; override=False so launcher MCP_PORT wins over .env.
load_dotenv(_REPO_ROOT / ".env", override=False)

_host = os.environ.get("MCP_HOST", "127.0.0.1")
_port = int(os.environ.get("MCP_PORT", "28084"))

_PROFILE_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_-]{0,127}$")

mcp = FastMCP(
    "log-analyzer",
    instructions=(
        "Exposes log-analysis SKILL.md playbooks under aiend/skills/. "
        "Call list_log_analysis_profiles first if unsure, then get_log_analysis_skill_md(profile) "
        "for the checklist matching the log type (e.g. log-access for HTTP access logs)."
    ),
    host=_host,
    port=_port,
)


def _allowed_profiles() -> list[str]:
    # Directories under aiend/skills/ that contain SKILL.md.
    if not _SKILLS_ROOT.is_dir():
        return []
    out: list[str] = []
    for p in sorted(_SKILLS_ROOT.iterdir(), key=lambda x: x.name.lower()):
        if p.is_dir() and (p / "SKILL.md").is_file():
            out.append(p.name)
    return out


@mcp.tool()
def list_log_analysis_profiles() -> str:
    """List available log analysis profile ids (subfolders of aiend/skills/ with SKILL.md)."""
    ids = _allowed_profiles()
    if not ids:
        return "No profiles found. Ensure repo has aiend/skills/<profile>/SKILL.md."
    return "Available profiles: " + ", ".join(ids)


@mcp.tool()
def get_log_analysis_skill_md(profile: str) -> str:
    """Load SKILL.md for a profile (e.g. log-generic, log-access, log-java). Used during AI log analysis."""
    raw = (profile or "").strip()
    if not raw or not _PROFILE_RE.match(raw):
        return f"Invalid profile id: {profile!r}. Use letters, digits, underscore, hyphen only."
    if raw not in _allowed_profiles():
        allowed = ", ".join(_allowed_profiles()) or "(none)"
        return f"Unknown profile {raw!r}. Allowed: {allowed}"
    path = _SKILLS_ROOT / raw / "SKILL.md"
    try:
        return path.read_text(encoding="utf-8")
    except OSError as e:
        return f"Failed to read {path}: {e}"


_OPENAPI_SPEC = {
    "openapi": "3.1.0",
    "info": {
        "title": "MCP log analyzer",
        "version": "1.0.0",
        "description": "Log analysis skills from aiend/skills/. MCP protocol: POST /mcp",
    },
    "paths": {
        "/mcp": {
            "post": {
                "summary": "MCP Streamable HTTP",
                "responses": {"200": {"description": "Protocol response"}},
            }
        }
    },
}

_DOCS_HTML = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>MCP log analyzer</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/>
<style>body{margin:0}</style></head><body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
<script>
window.onload=function(){
  window.ui = SwaggerUIBundle({
    url: '/openapi.json',
    dom_id: '#swagger-ui',
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: 'StandaloneLayout'
  });
};
</script>
</body></html>"""

_FAVICON_ICO_CACHE: bytes | None = None


def _stack_assets_favicon_ico() -> bytes:
    global _FAVICON_ICO_CACHE
    if _FAVICON_ICO_CACHE is None:
        ico = _REPO_ROOT / "assets" / "favicon.ico"
        if ico.is_file():
            _FAVICON_ICO_CACHE = ico.read_bytes()
        else:
            _FAVICON_ICO_CACHE = b""
    return _FAVICON_ICO_CACHE


@mcp.custom_route("/openapi.json", methods=["GET"], include_in_schema=False)
async def _openapi_json(_request):
    return JSONResponse(_OPENAPI_SPEC)


@mcp.custom_route("/docs", methods=["GET"], include_in_schema=False)
async def _swagger_docs(_request):
    return HTMLResponse(_DOCS_HTML)


@mcp.custom_route("/favicon.ico", methods=["GET"], include_in_schema=False)
async def _favicon(_request):
    data = _stack_assets_favicon_ico()
    if not data:
        return Response(status_code=404)
    return Response(content=data, media_type="image/x-icon")


if __name__ == "__main__":
    asyncio.run(mcp.run_streamable_http_async())
