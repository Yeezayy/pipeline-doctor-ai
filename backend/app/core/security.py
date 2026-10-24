import re

from app.core.config import get_settings
from app.core.identity import identity

REDACTED = "[REDACTED]"
PATTERNS = [
    (
        re.compile(
            r"""(?i)((?:[\w-]*(?:token|password|passwd|secret|api[_-]?key)[\w-]*)["']?\s*[:=]\s*)(["'])(.*?)\2"""
        ),
        r"\1\2[REDACTED]\2",
    ),
    (re.compile(r"(?i)(authorization\s*[:=]\s*(?:bearer|basic)\s+)[^\s\"']+"), r"\1[REDACTED]"),
    (
        re.compile(
            r"(?i)((?:[\w-]*(?:token|password|passwd|secret|api[_-]?key|private[_-]?key)[\w-]*)[\"']?\s*[:=]\s*[\"']?)[^\s\"',;}]+"
        ),
        r"\1[REDACTED]",
    ),
    (re.compile(r"(?i)(https?://)[^\s/@:]+:[^\s/@]+@"), r"\1[REDACTED]@"),
    (re.compile(r"\b(?:glpat-|glrt-|ghp_|github_pat_|sk-)[A-Za-z0-9_-]{8,}"), REDACTED),
    (re.compile(r"\bAKIA[A-Z0-9]{16}\b"), REDACTED),
    (re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"), REDACTED),
    (
        re.compile(r"-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----", re.S),
        REDACTED,
    ),
]
ANSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


def redact(text: str) -> str:
    settings = get_settings()
    text = ANSI.sub("", text)
    principal = identity.get()
    for secret in (
        settings.gitlab_token,
        settings.llm_api_key,
        settings.app_api_key,
        settings.gitlab_client_secret,
        settings.token_encryption_key,
        principal.access_token,
        principal.refresh_token,
    ):
        if secret:
            text = text.replace(secret, REDACTED)
    for pattern, replacement in PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def excerpt(text: str, limit: int) -> str:
    """Sanitize before limiting so cutting a credential cannot defeat masking."""
    clean = redact(text)
    if len(clean) <= limit:
        return clean
    marker = "\n[… middle omitted; excerpt only …]\n"
    budget = limit - len(marker)
    return clean[: budget // 4] + marker + clean[-(budget - budget // 4) :]
