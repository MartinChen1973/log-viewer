## ⬇️ Flask app: serves frontend static files and JSON APIs for log files under LOG_ROOT.
import os
from pathlib import Path
from typing import Optional

from flask import Flask, Response, jsonify, request, send_from_directory

from paths import get_log_root

_BACKEND_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _BACKEND_DIR.parent
_FRONTEND_DIR = _REPO_ROOT / "frontend"
_OPENAPI_PATH = _BACKEND_DIR / "openapi.json"

# ⬇️ Max single response size for log body (bytes); larger files are truncated with a notice.
_MAX_LOG_BYTES = int(os.environ.get("MAX_LOG_BYTES", str(2 * 1024 * 1024)))

app = Flask(__name__, static_folder=str(_FRONTEND_DIR), static_url_path="")


@app.after_request
def add_cors(response):
    ## ⬇️ Allow local dev when frontend is opened from another origin or port.
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


def _safe_log_path(name: str) -> Optional[Path]:
    root = get_log_root()
    if not root.is_dir():
        return None
    candidate = (root / name).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    if not candidate.is_file():
        return None
    return candidate


_SWAGGER_UI_HTML = """<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>log-viewer API — OpenAPI</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
      });
    </script>
  </body>
</html>
"""


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/openapi.json", methods=["GET"])
def openapi_spec():
    ## ⬇️ Machine-readable OpenAPI document for Swagger UI and tooling.
    if not _OPENAPI_PATH.is_file():
        return jsonify({"error": "openapi spec missing"}), 500
    return Response(
        _OPENAPI_PATH.read_text(encoding="utf-8"),
        mimetype="application/json",
    )


@app.route("/docs", methods=["GET"])
def openapi_docs():
    ## ⬇️ Swagger UI for interactive OpenAPI exploration.
    return Response(_SWAGGER_UI_HTML, mimetype="text/html; charset=utf-8")


@app.route("/api/logs", methods=["GET"])
def list_logs():
    root = get_log_root()
    if not root.is_dir():
        return jsonify({"error": "log root is not a directory", "path": str(root)}), 500
    names = sorted(p.name for p in root.iterdir() if p.is_file())
    return jsonify({"root": str(root), "files": names})


@app.route("/api/logs/<name>", methods=["GET"])
def get_log(name: str):
    path = _safe_log_path(name)
    if path is None:
        return jsonify({"error": "not found or invalid name"}), 404
    try:
        size = path.stat().st_size
    except OSError as e:
        return jsonify({"error": str(e)}), 500
    truncated = False
    if size > _MAX_LOG_BYTES:
        truncated = True
        with path.open("rb") as f:
            f.seek(max(0, size - _MAX_LOG_BYTES))
            raw = f.read()
        # ⬇️ Skip partial leading line after seek so content starts at a line boundary.
        nl = raw.find(b"\n")
        if nl != -1:
            raw = raw[nl + 1 :]
        text = raw.decode("utf-8", errors="replace")
        prefix = f"[… truncated: showing last ~{_MAX_LOG_BYTES} bytes …]\n"
        text = prefix + text
    else:
        text = path.read_text(encoding="utf-8", errors="replace")
    tail = request.args.get("tail", type=int)
    if tail is not None and tail > 0:
        lines = text.splitlines()
        if len(lines) > tail:
            text = f"[… {len(lines) - tail} lines omitted …]\n" + "\n".join(lines[-tail:])
    return jsonify(
        {
            "name": path.name,
            "path": str(path),
            "size": size,
            "truncated": truncated,
            "content": text,
        }
    )


if __name__ == "__main__":
    app.run(debug=True)
