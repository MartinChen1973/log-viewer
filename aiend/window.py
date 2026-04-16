## Time-window presets and line filtering for AI log analysis (server local clock).
from __future__ import annotations

import calendar
import re
from datetime import date, datetime, timedelta
from typing import Literal

PresetId = Literal["last_1h", "today", "week", "last_7d", "last_30d"]

PRESET_ORDER: tuple[PresetId, ...] = (
    "last_1h",
    "today",
    "week",
    "last_7d",
    "last_30d",
)

PRESET_LABELS: dict[str, str] = {
    "last_1h": "\u6700\u8fd11\u5c0f\u65f6",
    "today": "\u4eca\u5929",
    "week": "\u672c\u5468",
    "last_7d": "\u8fd17\u5929",
    "last_30d": "\u8fd130\u5929",
}

_MON_ABBR: dict[str, int] = {
    calendar.month_abbr[i].lower(): i for i in range(1, 13)
}


def approx_tokens_from_bytes(n: int) -> int:
    ## Rough UI estimate: bytes / 3, rounded.
    if n <= 0:
        return 0
    return max(0, int(round(n / 3)))


def _week_start_monday_local(now: datetime) -> datetime:
    ## Monday 00:00:00 for the calendar week containing now (local).
    d = now.date()
    monday = d - timedelta(days=d.weekday())
    return datetime.combine(monday, datetime.min.time())


def window_bounds(preset: str, now: datetime | None = None) -> tuple[datetime, datetime]:
    ## Inclusive time range on the log line timestamp axis; end is always now.
    now = now or datetime.now()
    if preset == "last_1h":
        return now - timedelta(hours=1), now
    if preset == "today":
        return datetime.combine(now.date(), datetime.min.time()), now
    if preset == "week":
        return _week_start_monday_local(now), now
    if preset == "last_7d":
        return now - timedelta(days=7), now
    if preset == "last_30d":
        return now - timedelta(days=30), now
    raise ValueError(f"unknown preset: {preset!r}")


def _valid_ymd(y: int, mo: int, d: int) -> bool:
    try:
        date(y, mo, d)
    except ValueError:
        return False
    return True


def _normalize_line(line: str) -> str:
    return line.lstrip("\ufeff \t").rstrip("\r\n")


def first_datetime_in_line(line: str) -> datetime | None:
    ## Best-effort first parseable timestamp (nginx, Apache, ISO, JSON time).
    s = _normalize_line(line)
    candidates: list[tuple[int, datetime]] = []

    def add_at(pos: int, dt: datetime) -> None:
        candidates.append((pos, dt))

    for m in re.finditer(
        r"^(\d{4})/(\d{2})/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\b",
        s,
    ):
        y, mo, d, hh, mm, ss = (int(m.group(i)) for i in range(1, 7))
        if _valid_ymd(y, mo, d) and 0 <= hh <= 23 and 0 <= mm <= 59 and 0 <= ss <= 59:
            add_at(m.start(), datetime(y, mo, d, hh, mm, ss))

    for m in re.finditer(r"\[(\d{2})/([A-Za-z]{3})/(\d{4}):(\d{2}):(\d{2}):(\d{2})", s):
        d0 = int(m.group(1))
        mo0 = _MON_ABBR.get(m.group(2).lower()[:3])
        y = int(m.group(3))
        hh, mm, ss = int(m.group(4)), int(m.group(5)), int(m.group(6))
        if mo0 is not None and _valid_ymd(y, mo0, d0) and 0 <= hh <= 23 and 0 <= mm <= 59 and 0 <= ss <= 59:
            add_at(m.start(), datetime(y, mo0, d0, hh, mm, ss))

    for m in re.finditer(
        r'"time"\s*:\s*"(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})',
        s,
    ):
        y, mo, d, hh, mm, ss = (int(m.group(i)) for i in range(1, 7))
        if _valid_ymd(y, mo, d) and 0 <= hh <= 23 and 0 <= mm <= 59 and 0 <= ss <= 59:
            add_at(m.start(), datetime(y, mo, d, hh, mm, ss))

    for m in re.finditer(r"\b(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\b", s):
        y, mo, d, hh, mm, ss = (int(m.group(i)) for i in range(1, 7))
        if _valid_ymd(y, mo, d) and 0 <= hh <= 23 and 0 <= mm <= 59 and 0 <= ss <= 59:
            add_at(m.start(), datetime(y, mo, d, hh, mm, ss))

    for m in re.finditer(r"\b(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\b", s):
        y, mo, d, hh, mm, ss = (int(m.group(i)) for i in range(1, 7))
        if _valid_ymd(y, mo, d) and 0 <= hh <= 23 and 0 <= mm <= 59 and 0 <= ss <= 59:
            add_at(m.start(), datetime(y, mo, d, hh, mm, ss))

    for m in re.finditer(r"\b(\d{4})-(\d{2})-(\d{2})\b", s):
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if _valid_ymd(y, mo, d):
            add_at(m.start(), datetime(y, mo, d, 0, 0, 0))

    if not candidates:
        return None
    candidates.sort(key=lambda x: x[0])
    return candidates[0][1]


def filter_log_lines(text: str, start: datetime, end: datetime) -> str:
    ## Keep lines whose first parseable timestamp falls in [start, end].
    out: list[str] = []
    for line in text.splitlines():
        dt = first_datetime_in_line(line)
        if dt is None:
            continue
        if start <= dt <= end:
            out.append(line)
    return "\n".join(out)


def slice_for_preset(text: str, preset: str, now: datetime | None = None) -> str:
    ## UTF-8 text slice for one preset id.
    a, b = window_bounds(preset, now)
    return filter_log_lines(text, a, b)


def preset_stats_for_capped_text(
    text: str, now: datetime | None = None
) -> list[dict[str, str | int]]:
    ## Stats for all presets; bytes is UTF-8 length of filtered slice.
    now = now or datetime.now()
    rows: list[dict[str, str | int]] = []
    for pid in PRESET_ORDER:
        body = slice_for_preset(text, pid, now)
        b = len(body.encode("utf-8"))
        rows.append(
            {
                "id": pid,
                "label": PRESET_LABELS[pid],
                "bytes": b,
                "approx_tokens": approx_tokens_from_bytes(b),
            }
        )
    return rows
