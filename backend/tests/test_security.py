import pytest

from app.core.config import get_settings
from app.core.security import excerpt, redact


@pytest.mark.parametrize(
    "text,secret",
    [
        ("PRIVATE-TOKEN: sensitive_value", "sensitive_value"),
        ('{"password": "sensitive_value"}', "sensitive_value"),
        ("Authorization: Bearer sensitive_value", "sensitive_value"),
        ("https://user:sensitive_value@registry.example/image", "sensitive_value"),
        ("glpat-sample1234567890", "sample1234567890"),
        ("sk-proj-sample1234567890", "sample1234567890"),
        ("AWS_ACCESS_KEY_ID=AKIA1234567890123456", "AKIA1234567890123456"),
        ("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature", "eyJzdWIiOiJ0ZXN0In0"),
        (
            "-----BEGIN RSA PRIVATE KEY-----\nsensitive_value\n-----END RSA PRIVATE KEY-----",
            "sensitive_value",
        ),
    ],
)
def test_redact_secrets(text, secret):
    result = redact(text)
    assert secret not in result
    assert "[REDACTED]" in result


def test_configured_secret_and_ansi():
    get_settings().gitlab_token = "custom-credential"
    assert redact("\x1b[31mcustom-credential\x1b[0m") == "[REDACTED]"


def test_quoted_password_with_spaces():
    result = redact('PASSWORD="a long sensitive passphrase"')
    assert "sensitive" not in result
    assert "passphrase" not in result


def test_budget_preserves_head_and_tail_after_redaction():
    logs = "START\n" + "token=do-not-send\n" + "x" * 20000 + "\nERROR: missing Dockerfile"
    result = excerpt(logs, 1000)
    assert len(result) == 1000
    assert result.startswith("START")
    assert result.endswith("ERROR: missing Dockerfile")
    assert "do-not-send" not in result
