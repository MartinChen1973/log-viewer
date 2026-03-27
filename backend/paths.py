## ⬇️ Resolve LOG_ROOT from env `LOG_ROOT`, otherwise use repo `logs/` beside `backend/`.
## ⬇️ 解析日志根目录：优先环境变量 LOG_ROOT，否则使用仓库中 `backend/` 旁的 `logs/`。
import os
from pathlib import Path

## ⬇️ Absolute paths to this package and the repo root (parent of `backend/`).
## ⬇️ 本包目录与仓库根目录（`backend/` 的上一级）的绝对路径。
_BACKEND_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _BACKEND_DIR.parent


def get_log_root() -> Path:
    ## ⬇️ Prefer `LOG_ROOT`; relative paths resolve against `backend/`; default `<repo>/logs`.
    ## ⬇️ 优先使用 LOG_ROOT；相对路径相对于 `backend/` 解析；默认目录为 `<仓库根>/logs`。
    raw = os.environ.get("LOG_ROOT", "").strip()
    if raw:
        p = Path(raw).expanduser()
        return p.resolve() if p.is_absolute() else (_BACKEND_DIR / p).resolve()
    return (_REPO_ROOT / "logs").resolve()
