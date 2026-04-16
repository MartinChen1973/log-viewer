## ⬇️ Flask app: serves frontend static files and JSON APIs for log files under LOG_ROOT.
import calendar
import json
import os
import re
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path
from typing import Dict, List, Literal, Optional, Tuple

from flask import Flask, Response, jsonify, request, send_from_directory

_BACKEND_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _BACKEND_DIR.parent

from log_analysis.profile import resolve_profile
from log_analysis.window import (
    PRESET_ORDER,
    approx_tokens_from_bytes,
    preset_stats_for_capped_text,
    slice_for_preset,
)
from paths import get_log_root
_FRONTEND_DIR = _REPO_ROOT / "frontend"
_OPENAPI_PATH = _BACKEND_DIR / "openapi.json"

# ⬇️ Max single response size for log body (bytes); larger files are truncated with a notice.
_MAX_LOG_BYTES = int(os.environ.get("MAX_LOG_BYTES", str(2 * 1024 * 1024)))
# ⬇️ Bytes read from start/end of each file when scanning the list for error/warning heuristics (cap total read).
_SCAN_SLICE = int(os.environ.get("LOG_LIST_SCAN_BYTES", str(48 * 1024)))
## ⬇️ Log analysis proxies to FastAPI `POST /analyze-log` (run ai-api or start-all.bat).
_AI_ANALYZE_URL = (os.environ.get("AI_ANALYZE_URL") or "http://127.0.0.1:8500/analyze-log").strip()
_PRESET_IDS = frozenset(PRESET_ORDER)

_LOG_ERROR_RE = re.compile(
    r"(?i)(exception\b|traceback|\bfatal\b|\berror\b|\bcritical\b|errno\s+|failed\s+with|\] err(?:or)?\b)",
)
_LOG_WARNING_RE = re.compile(r"(?i)(\bwarn(?:ing)?\b|\] warn\b)")

_MON_ABBR_EN: Dict[str, int] = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}


def _valid_calendar_ymd(y: int, mo: int, d: int) -> bool:
    ## ⬇️ True if (y, mo, d) is a real calendar date.
    try:
        date(y, mo, d)
    except ValueError:
        return False
    return True


def _normalize_log_line_for_timeparse(line: str) -> str:
    ## ⬇️ BOM / leading space / CRLF — nginx error default lines must match `^YYYY/MM/DD`.
    return line.lstrip("\ufeff \t").rstrip("\r\n")


def _calendar_date_from_line(line: str) -> Optional[Tuple[int, int, int]]:
    ## ⬇️ First timestamp calendar (y, mo, d) on the line for daily bucketing (nginx / ISO / JSON time).
    s = _normalize_log_line_for_timeparse(line)
    m = re.match(
        r"^(\d{4})/(\d{2})/(\d{2})\s+\d{2}:\d{2}:\d{2}\b",
        s,
    )
    if m:
        y0, mo0, d0 = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if _valid_calendar_ymd(y0, mo0, d0):
            return y0, mo0, d0
    m = re.search(r"\[(\d{2})/([A-Za-z]{3})/(\d{4}):", s)
    if m:
        d0 = int(m.group(1))
        mo0 = _MON_ABBR_EN.get(m.group(2).lower()[:3])
        y0 = int(m.group(3))
        if mo0 is not None and _valid_calendar_ymd(y0, mo0, d0):
            return y0, mo0, d0
    m = re.search(r'"time"\s*:\s*"(\d{4})-(\d{2})-(\d{2})T', s)
    if m:
        y0, mo0, d0 = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if _valid_calendar_ymd(y0, mo0, d0):
            return y0, mo0, d0
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})T", s)
    if m:
        y0, mo0, d0 = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if _valid_calendar_ymd(y0, mo0, d0):
            return y0, mo0, d0
    m = re.search(r"\b(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}", s)
    if m:
        y0, mo0, d0 = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if _valid_calendar_ymd(y0, mo0, d0):
            return y0, mo0, d0
    m = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\s+\d{2}:\d{2}:\d{2}", s)
    if m:
        y0, mo0, d0 = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if _valid_calendar_ymd(y0, mo0, d0):
            return y0, mo0, d0
    return None


def _sample_text_for_scan(path: Path) -> str:
    ## ⬇️ Read up to `_SCAN_SLICE` from file start and end to classify issues without loading whole file.
    try:
        size = path.stat().st_size
    except OSError:
        return ""
    if size <= 0:
        return ""
    chunks: list[bytes] = []
    try:
        with path.open("rb") as f:
            if size <= _SCAN_SLICE * 2:
                chunks.append(f.read())
            else:
                chunks.append(f.read(_SCAN_SLICE))
                f.seek(max(0, size - _SCAN_SLICE))
                chunks.append(f.read())
    except OSError:
        return ""
    raw = b"\n".join(chunks)
    return raw.decode("utf-8", errors="replace")


IssueKind = Literal["error", "warning"]


def _issue_counts_from_sample(text: str) -> Tuple[int, int]:
    ## ⬇️ Count regex matches in sampled text (non-overlapping); same sample as list scan, not a full-file guarantee.
    if not text.strip():
        return 0, 0
    err_n = len(_LOG_ERROR_RE.findall(text))
    warn_n = len(_LOG_WARNING_RE.findall(text))
    return err_n, warn_n


def _issue_entry_for_file(path: Path) -> dict:
    sample = _sample_text_for_scan(path)
    err_n, warn_n = _issue_counts_from_sample(sample)
    issues: list[IssueKind] = []
    if err_n:
        issues.append("error")
    if warn_n:
        issues.append("warning")
    return {
        "name": path.name,
        "issues": issues,
        "error_count": err_n,
        "warning_count": warn_n,
    }


def _parse_ymd_param(s: str) -> Optional[Tuple[int, int, int]]:
    ## ⬇️ Validate `YYYY-MM-DD` for hourly summary requests.
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", (s or "").strip())
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if mo < 1 or mo > 12 or d < 1 or d > 31:
        return None
    return y, mo, d


def _hour_for_target_date_line(line: str, y: int, mo: int, d: int) -> Optional[int]:
    ## ⬇️ Best-effort hour (0–23) for log lines whose primary timestamp matches the target calendar day.
    s = _normalize_log_line_for_timeparse(line)
    m = re.match(
        r"^(\d{4})/(\d{2})/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})",
        s,
    )
    if m:
        y0, mo0, d0 = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y0 == y and mo0 == mo and d0 == d:
            h = int(m.group(4))
            return h if 0 <= h <= 23 else None
    tok_n = f"[{d:02d}/{calendar.month_abbr[mo]}/{y}:"
    k = s.find(tok_n)
    if k >= 0:
        rest = s[k + len(tok_n) : k + len(tok_n) + 12]
        hm = re.match(r"(\d{2}):\d{2}:\d{2}", rest)
        if hm:
            h = int(hm.group(1))
            return h if 0 <= h <= 23 else None
    ds = f"{y:04d}-{mo:02d}-{d:02d}"
    m = re.search(r'"time"\s*:\s*"' + re.escape(ds) + r"T(\d{2}):", s)
    if m:
        h = int(m.group(1))
        return h if 0 <= h <= 23 else None
    m = re.match(re.escape(ds) + r"T(\d{2}):", s)
    if m:
        h = int(m.group(1))
        return h if 0 <= h <= 23 else None
    m = re.search(re.escape(ds) + r"T(\d{2}):\d{2}:\d{2}", s)
    if m:
        h = int(m.group(1))
        return h if 0 <= h <= 23 else None
    m = re.search(re.escape(ds) + r"\s+(\d{2}):\d{2}:\d{2}", s)
    if m:
        h = int(m.group(1))
        return h if 0 <= h <= 23 else None
    return None


def _pack_health_buckets(
    has_line: List[bool], has_err: List[bool], has_warn: List[bool]
) -> list[str]:
    ## ⬇️ Turn per-slot flags into empty | ok | warning | error | error_warning (both → split in UI).
    out: list[str] = []
    for i in range(24):
        if not has_line[i]:
            out.append("empty")
        elif has_err[i] and has_warn[i]:
            out.append("error_warning")
        elif has_err[i]:
            out.append("error")
        elif has_warn[i]:
            out.append("warning")
        else:
            out.append("ok")
    return out


def _hourly_and_days24_for_file(path: Path, y: int, mo: int, d: int) -> Tuple[list[str], list[str]]:
    ## ⬇️ Today’s 24 hours plus 24 calendar days; `days24` index 0 = oldest, 23 = `date` (UI: right = today).
    end = date(y, mo, d)
    day_key_to_idx: Dict[str, int] = {}
    for i in range(24):
        dt = end - timedelta(days=i)
        day_key_to_idx[dt.isoformat()] = 23 - i

    has_line_h = [False] * 24
    has_err_h = [False] * 24
    has_warn_h = [False] * 24
    has_line_d = [False] * 24
    has_err_d = [False] * 24
    has_warn_d = [False] * 24

    try:
        with path.open("r", encoding="utf-8", errors="replace") as f:
            for line in f:
                hh = _hour_for_target_date_line(line, y, mo, d)
                if hh is not None:
                    has_line_h[hh] = True
                    if _LOG_ERROR_RE.search(line):
                        has_err_h[hh] = True
                    if _LOG_WARNING_RE.search(line):
                        has_warn_h[hh] = True

                ymd = _calendar_date_from_line(line)
                if ymd:
                    y2, m2, d2 = ymd
                    key = f"{y2:04d}-{m2:02d}-{d2:02d}"
                    di = day_key_to_idx.get(key)
                    if di is not None:
                        has_line_d[di] = True
                        if _LOG_ERROR_RE.search(line):
                            has_err_d[di] = True
                        if _LOG_WARNING_RE.search(line):
                            has_warn_d[di] = True
    except OSError:
        pass

    return _pack_health_buckets(has_line_h, has_err_h, has_warn_h), _pack_health_buckets(
        has_line_d, has_err_d, has_warn_d
    )


app = Flask(__name__, static_folder=str(_FRONTEND_DIR), static_url_path="")


@app.after_request
def add_cors(response):
    ## ⬇️ Allow local dev when frontend is opened from another origin or port.
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


def _read_log_text_capped(path: Path) -> Tuple[str, int, bool]:
    ## ���️ Same tail cap as `get_log`; presets and analyze run on this slice only when the file is large.
    try:
        size = path.stat().st_size
    except OSError as e:
        raise OSError(str(e)) from e
    truncated = False
    if size > _MAX_LOG_BYTES:
        truncated = True
        with path.open("rb") as f:
            f.seek(max(0, size - _MAX_LOG_BYTES))
            raw = f.read()
        nl = raw.find(b"\n")
        if nl != -1:
            raw = raw[nl + 1 :]
        text = raw.decode("utf-8", errors="replace")
        prefix = f"[… truncated: showing last ~{_MAX_LOG_BYTES} bytes …]\n"
        text = prefix + text
    else:
        text = path.read_text(encoding="utf-8", errors="replace")
    return text, size, truncated


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
    entries = []
    for p in sorted(root.iterdir(), key=lambda x: x.name.lower()):
        if not p.is_file():
            continue
        entries.append(_issue_entry_for_file(p))
    return jsonify({"root": str(root), "files": entries})


@app.route("/api/logs/hourly-summary", methods=["GET"])
def hourly_summary():
    ## ⬇️ Per-file 24-hour buckets for `date` and 24 trailing calendar days (`days24` index 23 = that day; same scan pass).
    ymd = _parse_ymd_param(request.args.get("date", type=str) or "")
    if ymd is None:
        return jsonify({"error": "invalid or missing date=YYYY-MM-DD"}), 400
    y, mo, d = ymd
    root = get_log_root()
    if not root.is_dir():
        return jsonify({"error": "log root is not a directory", "path": str(root)}), 500
    date_key = f"{y:04d}-{mo:02d}-{d:02d}"
    files_out = []
    for p in sorted(root.iterdir(), key=lambda x: x.name.lower()):
        if not p.is_file():
            continue
        hours, days24 = _hourly_and_days24_for_file(p, y, mo, d)
        files_out.append({"name": p.name, "hours": hours, "days24": days24})
    return jsonify(
        {
            "date": date_key,
            "recent_days": 24,
            "files": files_out,
        }
    )


@app.route("/api/logs/<name>", methods=["GET"])
def get_log(name: str):
    """Return one log file as JSON: safe path resolution, byte cap, optional ``tail`` line limit."""
    ## ⬇️ Step 1️⃣ — Resolve `name` to a safe path under the log root; 404 if missing or traversal. / 步骤 1️⃣ — 将 `name` 解析为日志根下的安全路径；不存在或路径穿越则 404。
    path = _safe_log_path(name)
    if path is None:
        return jsonify({"error": "not found or invalid name"}), 404
    ## ⬇️ Step 2️⃣ — Read file size; 500 on stat failure. / 步骤 2️⃣ — 读取文件大小；`stat` 失败则 500。
    try:
        size = path.stat().st_size
    except OSError as e:
        return jsonify({"error": str(e)}), 500
    ## ⬇️ Step 3️⃣ — Load UTF-8 text: tail slice when over `MAX_LOG_BYTES`, else full read. / 步骤 3️⃣ — 载入 UTF-8 文本：超过 `MAX_LOG_BYTES` 则只读后段，否则整文件读取。
    truncated = False
    if size > _MAX_LOG_BYTES:
        truncated = True
        with path.open("rb") as f:
            f.seek(max(0, size - _MAX_LOG_BYTES))
            raw = f.read()
        ## ⬇️ Skip partial leading line after seek so content starts at a line boundary. / 定位后丢弃不完整的首行，使正文从整行起算。
        nl = raw.find(b"\n")
        if nl != -1:
            raw = raw[nl + 1 :]
        text = raw.decode("utf-8", errors="replace")
        prefix = f"[… truncated: showing last ~{_MAX_LOG_BYTES} bytes …]\n"
        text = prefix + text
    else:
        text = path.read_text(encoding="utf-8", errors="replace")
    ## ⬇️ Step 4️⃣ — Optional `?tail=N`: keep only the last N lines. / 步骤 4️⃣ — 可选查询参数 `?tail=N`：仅保留末尾 N 行。
    tail = request.args.get("tail", type=int)
    if tail is not None and tail > 0:
        lines = text.splitlines()
        if len(lines) > tail:
            text = f"[… {len(lines) - tail} lines omitted …]\n" + "\n".join(lines[-tail:])
    ## ⬇️ Step 5️⃣ — Return JSON with metadata and `content`. / 步骤 5️⃣ — 返回含元数据与 `content` 的 JSON。
    return jsonify(
        {
            "name": path.name,
            "path": str(path),
            "size": size,
            "truncated": truncated,
            "content": text,
        }
    )


@app.route("/api/logs/<name>/analyze-presets", methods=["GET"])
def analyze_presets(name: str):
    ## ���️ Token estimates: UTF-8 bytes of time-filtered slice / 3 (rounded); uses capped tail when file is huge.
    path = _safe_log_path(name)
    if path is None:
        return jsonify({"error": "not found or invalid name"}), 404
    try:
        text, size, truncated = _read_log_text_capped(path)
    except OSError as e:
        return jsonify({"error": str(e)}), 500
    presets = preset_stats_for_capped_text(text)
    return jsonify(
        {
            "name": path.name,
            "source_size": size,
            "source_truncated": truncated,
            "presets": presets,
        }
    )


@app.route("/api/logs/<name>/analyze", methods=["POST", "OPTIONS"])
def analyze_log(name: str):
    ## ���️ JSON body `preset`; forwards excerpt to ai-api Deep Agent analysis.
    if request.method == "OPTIONS":
        return Response(status=204)
    path = _safe_log_path(name)
    if path is None:
        return jsonify({"error": "not found or invalid name"}), 404
    body = request.get_json(silent=True) or {}
    preset = (body.get("preset") or "").strip()
    if preset not in _PRESET_IDS:
        return jsonify({"error": "invalid or missing preset"}), 400
    try:
        text, size, truncated = _read_log_text_capped(path)
    except OSError as e:
        return jsonify({"error": str(e)}), 500
    content = slice_for_preset(text, preset)
    byte_len = len(content.encode("utf-8"))
    approx_tok = approx_tokens_from_bytes(byte_len)
    profile = resolve_profile(path.name)
    payload = {
        "log_name": path.name,
        "preset": preset,
        "log_profile": profile,
        "content": content,
        "approx_tokens": approx_tok,
        "byte_length": byte_len,
        "source_truncated": truncated,
        "source_size": size,
    }
    req = urllib.request.Request(
        _AI_ANALYZE_URL,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            data = json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        return (
            jsonify(
                {
                    "analysis": "",
                    "preset": preset,
                    "approx_tokens": approx_tok,
                    "profile": profile,
                    "ai_error": err_body or e.reason,
                    "source_truncated": truncated,
                }
            ),
            502,
        )
    except urllib.error.URLError as e:
        return (
            jsonify(
                {
                    "analysis": "",
                    "preset": preset,
                    "approx_tokens": approx_tok,
                    "profile": profile,
                    "ai_error": str(e.reason) if e.reason else str(e),
                    "source_truncated": truncated,
                }
            ),
            502,
        )
    analysis = data.get("analysis")
    if not isinstance(analysis, str):
        analysis = ""
    usage_items = data.get("usage_items")
    if not isinstance(usage_items, list):
        usage_items = []
    return jsonify(
        {
            "analysis": analysis,
            "preset": preset,
            "approx_tokens": approx_tok,
            "profile": profile,
            "ai_error": None,
            "source_truncated": truncated,
            "usage_items": usage_items,
        }
    )


if __name__ == "__main__":
    app.run(debug=True)
