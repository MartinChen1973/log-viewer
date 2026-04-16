## ⬇️ Load AGICTO list prices into `data/model_prices.yaml` and resolve per-model CNY / million tokens.
from __future__ import annotations

import logging
import os
import re
import threading
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

_RE_MODEL_H4 = re.compile(r"<h4[^>]*>([^<]+)</h4>", re.IGNORECASE)
_RE_PRICE_BOLD = re.compile(
    r'text-2xl[^>]*font-bold[^>]*>([\d.]+)</span>',
    re.IGNORECASE,
)

_DATA_DIR = Path(__file__).resolve().parent / "data"
_MODEL_PRICES_PATH = _DATA_DIR / "model_prices.yaml"

_AGICTO_URL_DEFAULT = "https://agicto.com/model?companyId=0&typeId=0&freeType=0"
AGICTO_MODEL_URL = (os.environ.get("AGICTO_MODEL_URL") or _AGICTO_URL_DEFAULT).strip()


def _agicto_fetch_enabled() -> bool:
    return os.environ.get("AGICTO_FETCH", "true").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )


_file_lock = threading.Lock()


def normalize_lc_model_id(model_str: str) -> str:
    ## ⬇️ Strip `provider:` from LangChain `init_chat_model` id, e.g. `openai:gpt-4o-mini` → `gpt-4o-mini`.
    s = (model_str or "").strip()
    if not s:
        return ""
    if ":" in s:
        s = s.split(":", 1)[1].strip()
    return s


def _load_yaml_raw() -> dict[str, Any]:
    if not _MODEL_PRICES_PATH.is_file():
        return {"version": 1, "source_url": AGICTO_MODEL_URL, "models": {}}
    try:
        raw = _MODEL_PRICES_PATH.read_text(encoding="utf-8")
        data = yaml.safe_load(raw)
        if not isinstance(data, dict):
            return {"version": 1, "source_url": AGICTO_MODEL_URL, "models": {}}
        models = data.get("models")
        if not isinstance(models, dict):
            data["models"] = {}
        data.setdefault("version", 1)
        data.setdefault("source_url", AGICTO_MODEL_URL)
        return data
    except OSError:
        logger.exception("Failed to read %s", _MODEL_PRICES_PATH)
        return {"version": 1, "source_url": AGICTO_MODEL_URL, "models": {}}


def _atomic_write_yaml(data: dict[str, Any]) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    text = yaml.safe_dump(
        data,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    )
    tmp = _MODEL_PRICES_PATH.with_suffix(".yaml.tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(_MODEL_PRICES_PATH)


def _parse_agicto_markdown(page_text: str) -> dict[str, tuple[float, float]]:
    ## ⬇️ Fallback: markdown snapshot (`####` + ￥… Input / Output).
    out: dict[str, tuple[float, float]] = {}
    parts = re.split(r"(?m)^####\s+", page_text)
    for part in parts[1:]:
        lines = part.strip().split("\n")
        if not lines:
            continue
        name = lines[0].strip()
        if not name:
            continue
        blob = "\n".join(lines[1:])
        m_in = re.search(r"￥\s*([\d.]+)\s*Input", blob, re.IGNORECASE)
        m_out = re.search(r"￥\s*([\d.]+)\s*Output", blob, re.IGNORECASE)
        if not m_in or not m_out:
            continue
        try:
            inp = float(m_in.group(1))
            outp = float(m_out.group(1))
        except ValueError:
            continue
        out.setdefault(name, (inp, outp))
    return out


def _parse_agicto_html(page_html: str) -> dict[str, tuple[float, float]]:
    ## ⬇️ Live `agicto.com` list: `<h4>model</h4>` then first two `text-2xl … font-bold` prices (¥/M).
    out: dict[str, tuple[float, float]] = {}
    for m in _RE_MODEL_H4.finditer(page_html):
        name = (m.group(1) or "").strip()
        if not name:
            continue
        start = m.end()
        next_h4 = page_html.find("<h4", start)
        chunk = page_html[start : next_h4 if next_h4 != -1 else len(page_html)]
        nums = _RE_PRICE_BOLD.findall(chunk)
        if len(nums) < 2:
            continue
        try:
            inp = float(nums[0])
            outp = float(nums[1])
        except ValueError:
            continue
        out.setdefault(name, (inp, outp))
    return out


def parse_agicto_catalog(page_text: str) -> dict[str, tuple[float, float]]:
    ## ⬇️ Prefer HTML parsing; fall back to markdown-style dump.
    html = _parse_agicto_html(page_text)
    if html:
        return html
    return _parse_agicto_markdown(page_text)


def _fetch_agicto_text(url: str, *, timeout_s: int = 45) -> str | None:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "log-viewer-ai-api/model_prices (+https://github.com/MartinChen1973/log-viewer)",
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read()
            return raw.decode("utf-8", errors="replace")
    except (urllib.error.URLError, OSError) as e:
        logger.warning("AGICTO fetch failed: %s", e)
        return None


def _merge_catalog_into_yaml(catalog: dict[str, tuple[float, float]]) -> None:
    with _file_lock:
        data = _load_yaml_raw()
        models: dict[str, Any] = data.setdefault("models", {})
        for name, (inp, outp) in catalog.items():
            key = name.strip()
            if not key:
                continue
            models[key] = {
                "input_cny_per_million": inp,
                "output_cny_per_million": outp,
            }
        data["source_url"] = AGICTO_MODEL_URL
        try:
            _atomic_write_yaml(data)
        except OSError:
            logger.exception("Failed to write %s", _MODEL_PRICES_PATH)


def resolve_cny_prices_per_million(model_label: str) -> tuple[float | None, float | None]:
    ## ⬇️ Return (input ¥/M, output ¥/M) from cache or after refreshing from AGICTO.
    norm = normalize_lc_model_id(model_label)
    if not norm:
        return None, None

    with _file_lock:
        data = _load_yaml_raw()
        models: dict[str, Any] = data.get("models") or {}
        for key, row in models.items():
            if not isinstance(key, str) or key.strip().lower() != norm.lower():
                continue
            if not isinstance(row, dict):
                break
            a = row.get("input_cny_per_million")
            b = row.get("output_cny_per_million")
            try:
                if a is not None and b is not None:
                    return float(a), float(b)
            except (TypeError, ValueError):
                break

    if not _agicto_fetch_enabled():
        return None, None

    html = _fetch_agicto_text(AGICTO_MODEL_URL)
    if not html:
        return None, None

    catalog = parse_agicto_catalog(html)
    if not catalog:
        logger.warning("AGICTO parse: no model rows extracted from %s", AGICTO_MODEL_URL)
        return None, None

    _merge_catalog_into_yaml(catalog)

    for name, pair in catalog.items():
        if name.strip().lower() == norm.lower():
            return pair[0], pair[1]

    logger.info("No AGICTO row for model %r (normalized %r)", model_label, norm)
    return None, None


def estimated_step_cost_cny(
    input_tokens: int | None,
    output_tokens: int | None,
    price_in: float | None,
    price_out: float | None,
) -> float | None:
    ## ⬇️ cost = Σ (tokens / 1e6) * (¥ per million), when all pieces exist.
    if price_in is None or price_out is None:
        return None
    if input_tokens is None or output_tokens is None:
        return None
    return (input_tokens / 1_000_000.0) * price_in + (output_tokens / 1_000_000.0) * price_out
