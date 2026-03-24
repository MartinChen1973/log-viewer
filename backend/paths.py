## ⬇️ Resolve LOG_ROOT: env LOG_ROOT, else repository `logs/` next to `backend/`.
import os
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _BACKEND_DIR.parent


def get_log_root() -> Path:
    raw = os.environ.get("LOG_ROOT", "").strip()
    if raw:
        p = Path(raw).expanduser()
        return p.resolve() if p.is_absolute() else (_BACKEND_DIR / p).resolve()
    return (_REPO_ROOT / "logs").resolve()
