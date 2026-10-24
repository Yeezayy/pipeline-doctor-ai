from functools import lru_cache
from pathlib import Path
from typing import Literal

from cryptography.fernet import Fernet
from pydantic import Field, HttpUrl, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

    demo_mode: bool = True
    database_url: str = "sqlite:///./doctor.db"
    gitlab_url: HttpUrl = "https://gitlab.com"
    gitlab_token: str = ""
    gitlab_project_id: str = ""
    llm_api_key: str = ""
    llm_base_url: HttpUrl = "https://api.openai.com/v1"
    llm_model: str = "gpt-4.1-mini"
    app_api_key: str = ""
    auth_mode: Literal["local", "gitlab"] = "local"
    public_app_url: HttpUrl = "http://localhost:8080"
    gitlab_client_id: str = ""
    gitlab_client_secret: str = ""
    gitlab_oauth_public: bool = False
    oauth_key_file: Path = Path(".local/oauth.key")
    token_encryption_key: str = ""
    session_days: int = Field(default=7, ge=1, le=30)
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    retention_days: int = Field(default=30, ge=1, le=365)
    log_max_chars: int = Field(default=16000, ge=1000, le=64000)

    @field_validator("gitlab_url", "llm_base_url", "public_app_url")
    @classmethod
    def no_url_credentials(cls, url: HttpUrl) -> HttpUrl:
        if url.username or url.password or url.query or url.fragment:
            raise ValueError("Service URLs must not include credentials, query or fragment")
        return url

    @model_validator(mode="after")
    def validate_oauth(self):
        if self.auth_mode == "gitlab":
            if self.demo_mode:
                raise ValueError(
                    "OAuth requires DEMO_MODE=false; demo remains a separate local deployment"
                )
            if self.public_app_url.path not in (None, "/"):
                raise ValueError("PUBLIC_APP_URL must be an origin without a path")
            if self.public_app_url.scheme != "https" and self.public_app_url.host not in (
                "localhost",
                "127.0.0.1",
                "[::1]",
            ):
                raise ValueError("Public OAuth deployments require HTTPS")
            if self.gitlab_url.scheme != "https" and self.gitlab_url.host not in (
                "localhost",
                "127.0.0.1",
                "[::1]",
            ):
                raise ValueError("GitLab OAuth requires HTTPS except on loopback")
            if self.gitlab_oauth_public:
                from app.core.local_oauth import local_encryption_key, registered_client_id

                self.gitlab_client_id = self.gitlab_client_id or registered_client_id(
                    str(self.gitlab_url)
                )
                if not self.gitlab_client_id:
                    raise ValueError(
                        "The maintainer must register the public GitLab OAuth application and set its client_id in app/core/gitlab-registration.json first"
                    )
                if not self.token_encryption_key and self.public_app_url.host in (
                    "localhost",
                    "127.0.0.1",
                    "[::1]",
                ):
                    self.token_encryption_key = local_encryption_key(self.oauth_key_file)
            if (
                not self.gitlab_client_id
                or (not self.gitlab_oauth_public and not self.gitlab_client_secret)
                or not self.token_encryption_key
            ):
                raise ValueError(
                    "OAuth requires client ID and encryption key; confidential applications also require a client secret"
                )
            try:
                Fernet(self.token_encryption_key.encode())
            except (ValueError, TypeError) as exc:
                raise ValueError("TOKEN_ENCRYPTION_KEY must be a Fernet key") from exc
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
