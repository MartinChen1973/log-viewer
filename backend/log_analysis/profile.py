## ⬇️ Map log file names to skill profile ids under `ai-api/skills/<profile>/`.
from __future__ import annotations

# ## ⬇️ First matching tuple wins; extend with more (substring, profile) pairs.
_PROFILE_RULES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("nginx-error",), "log-analyzer-nginx-error"),
    (("docker",), "log-analyzer-docker"),
    (("mysql", "mariadb"), "log-analyzer-mysql"),
    (("access", "nginx", "http"), "log-analyzer-access"),
    (("java", "spring", "jvm"), "log-analyzer-java"),
)

_DEFAULT_PROFILE = "log-analyzer-generic"


def resolve_profile(log_name: str) -> str:
    ## ⬇️ Case-insensitive substring rules; unknown files use `log-analyzer-generic`.
    lower = (log_name or "").lower()
    for needles, profile in _PROFILE_RULES:
        if any(n in lower for n in needles):
            return profile
    return _DEFAULT_PROFILE
