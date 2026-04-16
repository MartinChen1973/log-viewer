## ⬇️ Persist AI log-analysis runs for the sidebar “分析历史” list (YAML on disk).
from __future__ import annotations

import logging
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

_HISTORY_LOCK = threading.Lock()
_MAX_ENTRIES = 400
_FILE_VERSION = 1


def _backend_dir() -> Path:
    return Path(__file__).resolve().parent.parent


def history_yaml_path() -> Path:
    return _backend_dir() / "storage" / "log_analysis_history.yaml"


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _coerce_int(val: Any) -> int | None:
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _coerce_float(val: Any) -> float | None:
    if val is None:
        return None
    try:
        f = float(val)
        if f != f:  # NaN
            return None
        return f
    except (TypeError, ValueError):
        return None


def usage_totals_from_usage_items(items: list[Any]) -> dict[str, Any]:
    ## ⬇️ Mirrors `frontend/js/app/ai-analyze.js` footer sums (agent rows only).
    sum_in = 0
    sum_out = 0
    sum_tot = 0
    sum_cost = 0.0
    sum_est_cny = 0.0
    counted_agent = 0
    catalog_in: float | None = None
    catalog_out: float | None = None
    for row in items:
        if not isinstance(row, dict) or row.get("kind") != "agent":
            continue
        inn = _coerce_int(row.get("input_tokens"))
        outt = _coerce_int(row.get("output_tokens"))
        tot = _coerce_int(row.get("tokens"))
        cost = _coerce_float(row.get("cost_usd"))
        pin = _coerce_float(row.get("price_input_cny_per_million"))
        pout = _coerce_float(row.get("price_output_cny_per_million"))
        est = _coerce_float(row.get("estimated_cost_cny"))
        if catalog_in is None and pin is not None:
            catalog_in = pin
        if catalog_out is None and pout is not None:
            catalog_out = pout
        if inn is not None:
            sum_in += inn
        if outt is not None:
            sum_out += outt
        if tot is not None:
            sum_tot += tot
        if cost is not None:
            sum_cost += cost
        if est is not None:
            sum_est_cny += est
        counted_agent += 1
    return {
        "has_agent_steps": counted_agent > 0,
        "counted_agent": counted_agent,
        "sum_in": sum_in,
        "sum_out": sum_out,
        "sum_tot": sum_tot,
        "sum_cost_usd": sum_cost,
        "catalog_in_cny_per_m": catalog_in,
        "catalog_out_cny_per_m": catalog_out,
        "sum_est_cny": sum_est_cny,
    }


def _read_raw() -> dict[str, Any]:
    path = history_yaml_path()
    if not path.is_file():
        return {"version": _FILE_VERSION, "entries": []}
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as e:
        logger.warning("Failed to read %s: %s", path, e)
        return {"version": _FILE_VERSION, "entries": []}
    if not isinstance(raw, dict):
        return {"version": _FILE_VERSION, "entries": []}
    entries = raw.get("entries")
    if not isinstance(entries, list):
        entries = []
    return {"version": _FILE_VERSION, "entries": entries}


def _write_raw(root: dict[str, Any]) -> None:
    path = history_yaml_path()
    _ensure_parent(path)
    text = yaml.safe_dump(
        root,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
        width=120,
    )
    path.write_text(text, encoding="utf-8")


def append_analysis_record(
    *,
    log_name: str,
    preset: str,
    preset_label: str,
    profile: str,
    approx_tokens: int,
    analysis: str,
    usage_items: list[Any],
) -> str | None:
    ## ⬇️ Returns new entry id, or None on failure (never raises to callers).
    entry_id = uuid.uuid4().hex
    created = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    record = {
        "id": entry_id,
        "created_at": created,
        "log_name": log_name,
        "preset": preset,
        "preset_label": preset_label,
        "profile": profile,
        "approx_tokens": int(approx_tokens),
        "usage_items": usage_items if isinstance(usage_items, list) else [],
        "analysis": analysis if isinstance(analysis, str) else "",
    }
    try:
        with _HISTORY_LOCK:
            root = _read_raw()
            entries = root.get("entries")
            if not isinstance(entries, list):
                entries = []
            entries.insert(0, record)
            if len(entries) > _MAX_ENTRIES:
                del entries[_MAX_ENTRIES:]
            root["entries"] = entries
            root["version"] = _FILE_VERSION
            _write_raw(root)
        return entry_id
    except OSError as e:
        logger.warning("Failed to append log analysis history: %s", e)
        return None


def list_summaries_newest_first() -> list[dict[str, Any]]:
    ## ⬇️ Lightweight rows for GET /api/logs/analyze-history (no full analysis body).
    root = _read_raw()
    entries = root.get("entries")
    if not isinstance(entries, list):
        return []
    out: list[dict[str, Any]] = []
    for row in entries:
        if not isinstance(row, dict):
            continue
        eid = row.get("id")
        if not isinstance(eid, str) or not eid:
            continue
        usage_items = row.get("usage_items")
        if not isinstance(usage_items, list):
            usage_items = []
        totals = usage_totals_from_usage_items(usage_items)
        out.append(
            {
                "id": eid,
                "created_at": row.get("created_at"),
                "log_name": row.get("log_name"),
                "preset": row.get("preset"),
                "preset_label": row.get("preset_label"),
                "profile": row.get("profile"),
                "approx_tokens": row.get("approx_tokens"),
                "totals": totals,
            }
        )
    return out


def get_entry_by_id(entry_id: str) -> dict[str, Any] | None:
    s = (entry_id or "").strip()
    if not s or len(s) > 128:
        return None
    root = _read_raw()
    entries = root.get("entries")
    if not isinstance(entries, list):
        return None
    for row in entries:
        if isinstance(row, dict) and str(row.get("id")) == s:
            return row
    return None
