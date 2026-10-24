"""Public app identity is distributable; encryption keys are local private state."""

import json
import os
from pathlib import Path

from cryptography.fernet import Fernet
from filelock import FileLock

REGISTRATION = Path(__file__).with_name("gitlab-registration.json")


def registered_client_id(instance: str) -> str:
    data = json.loads(REGISTRATION.read_text())
    return (
        str(data.get("client_id", ""))
        if str(data.get("instance_url", "")).rstrip("/") == instance.rstrip("/")
        else ""
    )


def local_encryption_key(path: Path) -> str:
    path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    with FileLock(str(path) + ".lock"):
        if path.exists():
            key = path.read_text().strip()
            Fernet(key.encode())  # Fail closed; never replace an unreadable existing key.
            return key
        key = Fernet.generate_key().decode()
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w") as stream:
            stream.write(key + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        return key
