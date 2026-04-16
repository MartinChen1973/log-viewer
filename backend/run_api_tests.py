## ⬇️ Run API tests; `conftest` writes `test_reports/api_test_report_<UTC>.md`.
from __future__ import annotations

import os
from pathlib import Path

import pytest


def main() -> int:
    backend = Path(__file__).resolve().parent
    os.chdir(backend)
    return pytest.main(
        [
            "tests",
            "-v",
            "--tb=short",
        ],
    )


if __name__ == "__main__":
    raise SystemExit(main())
