## ���️ Map log file names to skill profile ids under `aiend/skills/<profile>/`.
from __future__ import annotations

# ## ���️ First matching tuple wins; extend with more (substring, profile) pairs.
_PROFILE_RULES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("access", "nginx", "http"), "log-access"),
    (("java", "spring", "jvm"), "log-java"),
)

_DEFAULT_PROFILE = "log-generic"


def resolve_profile(log_name: str) -> str:
    ## ���️ Case-insensitive substring rules; unknown files use `log-generic`.
    lower = (log_name or "").lower()
    for needles, profile in _PROFILE_RULES:
        if any(n in lower for n in needles):
            return profile
    return _DEFAULT_PROFILE
