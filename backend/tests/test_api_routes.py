## ⬇️ Automated API tests: success and error paths for every Flask route.
from __future__ import annotations

import json

import pytest


@pytest.mark.api_route("GET", "/")
def test_index_returns_html(api_client):
    client, _root = api_client
    rv = client.get("/")
    assert rv.status_code == 200
    assert b"html" in rv.data.lower() or rv.mimetype == "text/html; charset=utf-8"


@pytest.mark.api_route("GET", "/")
def test_index_rejects_post(api_client):
    client, _root = api_client
    rv = client.post("/")
    assert rv.status_code == 405


@pytest.mark.api_route("GET", "/openapi.json")
def test_openapi_json_ok(api_client):
    client, _root = api_client
    rv = client.get("/openapi.json")
    assert rv.status_code == 200
    assert rv.mimetype == "application/json"
    data = json.loads(rv.data)
    assert "openapi" in data or "swagger" in data


@pytest.mark.api_route("GET", "/openapi.json")
def test_openapi_json_missing_returns_500(api_client, monkeypatch):
    client, root = api_client
    import app as app_module

    monkeypatch.setattr(app_module, "_OPENAPI_PATH", root / "nonexistent_openapi.json")
    rv = client.get("/openapi.json")
    assert rv.status_code == 500
    body = json.loads(rv.data)
    assert "error" in body


@pytest.mark.api_route("GET", "/docs")
def test_docs_returns_swagger_ui(api_client):
    client, _root = api_client
    rv = client.get("/docs")
    assert rv.status_code == 200
    assert b"swagger" in rv.data.lower()


@pytest.mark.api_route("GET", "/docs")
def test_docs_not_json(api_client):
    client, _root = api_client
    rv = client.get("/docs")
    assert "html" in (rv.mimetype or "")


@pytest.mark.api_route("GET", "/api/logs")
def test_list_logs_empty_directory(api_client):
    client, _root = api_client
    rv = client.get("/api/logs")
    assert rv.status_code == 200
    body = json.loads(rv.data)
    assert body["files"] == []


@pytest.mark.api_route("GET", "/api/logs")
def test_list_logs_includes_files_and_issues(api_client):
    client, root = api_client
    (root / "app.log").write_text("2025/01/15 10:00:00 ERROR something failed\n", encoding="utf-8")
    (root / "warn.log").write_text("2025/01/15 10:00:00 warning disk low\n", encoding="utf-8")
    rv = client.get("/api/logs")
    assert rv.status_code == 200
    body = json.loads(rv.data)
    names = {e["name"] for e in body["files"]}
    assert names == {"app.log", "warn.log"}
    by_name = {e["name"]: e for e in body["files"]}
    assert "error" in by_name["app.log"]["issues"]
    assert "warning" in by_name["warn.log"]["issues"]


@pytest.mark.api_route("GET", "/api/logs")
def test_list_logs_fails_when_root_not_directory(api_client, monkeypatch):
    import app as app_module

    client, root = api_client
    file_path = root / "not_a_dir"
    file_path.write_text("x", encoding="utf-8")

    monkeypatch.setattr(app_module, "get_log_root", lambda: file_path)
    rv = client.get("/api/logs")
    assert rv.status_code == 500
    body = json.loads(rv.data)
    assert "error" in body


@pytest.mark.api_route("GET", "/api/logs/hourly-summary")
def test_hourly_summary_missing_date(api_client):
    client, _root = api_client
    rv = client.get("/api/logs/hourly-summary")
    assert rv.status_code == 400


@pytest.mark.api_route("GET", "/api/logs/hourly-summary")
def test_hourly_summary_invalid_date_format(api_client):
    client, _root = api_client
    rv = client.get("/api/logs/hourly-summary?date=not-a-date")
    assert rv.status_code == 400


@pytest.mark.api_route("GET", "/api/logs/hourly-summary")
def test_hourly_summary_invalid_month(api_client):
    client, _root = api_client
    rv = client.get("/api/logs/hourly-summary?date=2025-13-01")
    assert rv.status_code == 400


@pytest.mark.api_route("GET", "/api/logs/hourly-summary")
def test_hourly_summary_ok_empty_files(api_client):
    client, _root = api_client
    rv = client.get("/api/logs/hourly-summary?date=2025-03-15")
    assert rv.status_code == 200
    body = json.loads(rv.data)
    assert body["date"] == "2025-03-15"
    assert body["files"] == []


@pytest.mark.api_route("GET", "/api/logs/hourly-summary")
def test_hourly_summary_ok_with_sample_log(api_client):
    client, root = api_client
    (root / "nginx.log").write_text(
        "2025/03/15 14:30:00 [error] upstream timeout\n",
        encoding="utf-8",
    )
    rv = client.get("/api/logs/hourly-summary?date=2025-03-15")
    assert rv.status_code == 200
    body = json.loads(rv.data)
    assert len(body["files"]) == 1
    f0 = body["files"][0]
    assert f0["name"] == "nginx.log"
    assert len(f0["hours"]) == 24
    assert f0["hours"][14] == "error"


@pytest.mark.api_route("GET", "/api/logs/hourly-summary")
def test_hourly_summary_fails_when_root_not_directory(api_client, monkeypatch):
    import app as app_module

    client, root = api_client
    file_path = root / "file_not_dir"
    file_path.write_text("x", encoding="utf-8")
    monkeypatch.setattr(app_module, "get_log_root", lambda: file_path)
    rv = client.get("/api/logs/hourly-summary?date=2025-01-01")
    assert rv.status_code == 500


@pytest.mark.api_route("GET", "/api/logs/{name}")
def test_get_log_not_found(api_client):
    client, _root = api_client
    rv = client.get("/api/logs/does-not-exist.log")
    assert rv.status_code == 404


@pytest.mark.api_route("GET", "/api/logs/{name}")
def test_get_log_path_traversal_rejected(api_client):
    client, root = api_client
    secret = root.parent / "secret.txt"
    secret.write_text("secret", encoding="utf-8")
    rv = client.get("/api/logs/../secret.txt")
    assert rv.status_code == 404


@pytest.mark.api_route("GET", "/api/logs/{name}")
def test_get_log_returns_content_and_metadata(api_client):
    client, root = api_client
    (root / "small.log").write_text("line one\nline two\n", encoding="utf-8")
    rv = client.get("/api/logs/small.log")
    assert rv.status_code == 200
    body = json.loads(rv.data)
    assert body["name"] == "small.log"
    assert body["truncated"] is False
    assert "line two" in body["content"]


@pytest.mark.api_route("GET", "/api/logs/{name}")
def test_get_log_tail_parameter(api_client):
    client, root = api_client
    lines = "\n".join(f"row {i}" for i in range(10))
    (root / "many.log").write_text(lines + "\n", encoding="utf-8")
    rv = client.get("/api/logs/many.log?tail=3")
    assert rv.status_code == 200
    body = json.loads(rv.data)
    assert "row 9" in body["content"]
    assert "row 0" not in body["content"]


@pytest.mark.api_route("GET", "/api/logs/{name}")
def test_get_log_tail_zero_or_negative_ignored(api_client):
    client, root = api_client
    (root / "t.log").write_text("a\nb\n", encoding="utf-8")
    rv = client.get("/api/logs/t.log?tail=0")
    assert rv.status_code == 200
    body = json.loads(rv.data)
    assert "a" in body["content"] and "b" in body["content"]


@pytest.mark.api_route("GET", "/api/logs/{name}")
def test_get_log_truncation_when_over_max_bytes(api_client, monkeypatch):
    import app as app_module

    client, root = api_client
    monkeypatch.setattr(app_module, "_MAX_LOG_BYTES", 64)
    big = "x" * 200 + "\nENDMARKER\n"
    (root / "big.log").write_text(big, encoding="utf-8")
    rv = client.get("/api/logs/big.log")
    assert rv.status_code == 200
    body = json.loads(rv.data)
    assert body["truncated"] is True
    assert "truncated" in body["content"].lower()
    assert "ENDMARKER" in body["content"]
