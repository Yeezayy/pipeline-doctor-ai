"""Request-scoped identity; never shared mutable credentials between requests."""

from contextvars import ContextVar
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Identity:
    owner_id: str | None = None
    access_token: str = field(default="", repr=False)
    refresh_token: str = field(default="", repr=False)


ANONYMOUS = Identity()
identity: ContextVar[Identity] = ContextVar("identity", default=ANONYMOUS)


def owner_id() -> str | None:
    return identity.get().owner_id
