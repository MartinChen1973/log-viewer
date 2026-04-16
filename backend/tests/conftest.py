## ⬇️ Pytest fixtures and session report: timestamped markdown with results and route coverage.
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import pytest

## ⬇️ Canonical API surface (method + logical path) used for coverage accounting.
CANONICAL_API_ROUTES: list[tuple[str, str]] = [
    ("GET", "/"),
    ("GET", "/openapi.json"),
    ("GET", "/docs"),
    ("GET", "/api/logs"),
    ("GET", "/api/logs/hourly-summary"),
    ("GET", "/api/logs/{name}"),
]

_REPORT_STATE: dict = {
    "results": [],
}


def _reports_dir() -> Path:
    ## ⬇️ `backend/test_reports/` next to `app.py`.
    return Path(__file__).resolve().parent.parent / "test_reports"


@pytest.fixture()
def api_client(tmp_path, monkeypatch):
    ## ⬇️ Flask test client and writable log root directory (`tmp_path`).
    import app as app_module

    monkeypatch.setattr(app_module, "get_log_root", lambda: tmp_path)
    app_module.app.config.update(TESTING=True)
    with app_module.app.test_client() as c:
        yield c, tmp_path


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    _ = call  ## ⬅️ hookspec requires this parameter name
    outcome = yield
    rep = outcome.get_result()
    if rep.when != "call":
        return
    m = item.get_closest_marker("api_route")
    route_key = None
    if m and len(m.args) >= 2:
        route_key = (str(m.args[0]), str(m.args[1]))
    _REPORT_STATE["results"].append(
        {
            "nodeid": item.nodeid,
            "route": route_key,
            "outcome": rep.outcome,
            "longrepr": str(rep.longrepr) if rep.failed else "",
        }
    )


def pytest_sessionfinish(session, exitstatus):
    _ = session  ## ⬅️ hookspec requires this parameter name
    ## ⬇️ Write test summary and per-route coverage to a timestamped markdown file.
    results = _REPORT_STATE["results"]
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_dir = _reports_dir()
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"api_test_report_{ts}.md"

    passed = sum(1 for r in results if r["outcome"] == "passed")
    failed = sum(1 for r in results if r["outcome"] == "failed")
    skipped = sum(1 for r in results if r["outcome"] == "skipped")
    total = len(results)

    by_route: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in results:
        if r["route"]:
            by_route[r["route"]].append(r)

    lines: list[str] = [
        "# API automated test report",
        "",
        f"Generated (UTC): `{datetime.now(timezone.utc).isoformat()}`",
        "",
        "## 1. Test execution summary",
        "",
        "| Metric | Count |",
        "| --- | ---: |",
        f"| Total | {total} |",
        f"| Passed | {passed} |",
        f"| Failed | {failed} |",
        f"| Skipped | {skipped} |",
        f"| Pytest exit status | {exitstatus} |",
        "",
        "### Per-test outcomes",
        "",
        "| Outcome | Test | Route |",
        "| --- | --- | --- |",
    ]
    for r in results:
        rk = "`" + " ".join(r["route"]) + "`" if r["route"] else "—"
        lines.append(f"| {r['outcome']} | `{r['nodeid']}` | {rk} |")

    fails = [r for r in results if r["outcome"] == "failed" and r.get("longrepr")]
    if fails:
        lines.extend(["", "### Failed test details", ""])
        for r in fails:
            lines.extend(
                [
                    f"#### `{r['nodeid']}`",
                    "",
                    "```",
                    r["longrepr"][:8000],
                    "```",
                    "",
                ]
            )

    lines.extend(
        [
            "",
            "## 2. Endpoint coverage (test cases per route)",
            "",
            "Logical path `{name}` denotes `/api/logs/<name>`.",
            "",
            "| Method | Path | Test cases | Status |",
            "| --- | --- | ---: | --- |",
        ]
    )

    covered_set = set(by_route.keys())
    canonical_set = set(CANONICAL_API_ROUTES)

    for method, path in CANONICAL_API_ROUTES:
        key = (method, path)
        cases = by_route.get(key, [])
        n = len(cases)
        if n == 0:
            status = "**Uncovered**"
        elif n == 1:
            status = "Covered (single case)"
        else:
            status = "Covered"
        lines.append(f"| {method} | `{path}` | {n} | {status} |")

    extra_routes = sorted(covered_set - canonical_set)
    if extra_routes:
        lines.extend(["", "### Routes marked in tests but not in canonical list", ""])
        for method, path in extra_routes:
            n = len(by_route[(method, path)])
            lines.append(f"- `{method}` `{path}` — {n} case(s)")

    missing = [f"`{m}` `{p}`" for m, p in sorted(canonical_set - covered_set)]
    lines.extend(
        [
            "",
            "## 3. Uncovered endpoints",
            "",
        ]
    )
    if missing:
        for m in missing:
            lines.append(f"- {m}")
    else:
        lines.append("All canonical endpoints have at least one marked test.")

    lines.append("")
    lines.append(f"Report file: `{out_path}`")
    lines.append("")

    text = "\n".join(lines)
    out_path.write_text(text, encoding="utf-8")
    print("\n" + "=" * 60)
    print("API test report (summary)")
    print("=" * 60)
    print(f"  Total: {total}  |  Passed: {passed}  |  Failed: {failed}  |  Skipped: {skipped}")
    print(f"  Markdown: {out_path}")
    print("  Endpoint coverage:")
    for method, path in CANONICAL_API_ROUTES:
        n = len(by_route.get((method, path), []))
        flag = "OK" if n else "MISSING"
        print(f"    {method} {path}: {n} case(s)  [{flag}]")
    print("=" * 60 + "\n")

    _REPORT_STATE["results"].clear()
