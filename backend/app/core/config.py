from functools import lru_cache

from pydantic import Field, HttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    demo_mode: bool = True
    database_url: str = "sqlite:///./doctor.db"
    gitlab_url: HttpUrl = "https://gitlab.com"
    gitlab_token: str = ""
    gitlab_project_id: str = ""
    llm_api_key: str = ""
    llm_base_url: HttpUrl = "https://api.openai.com/v1"
    llm_model: str = "gpt-4.1-mini"
    app_api_key: str = ""
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    retention_days: int = Field(default=30, ge=1, le=365)
    log_max_chars: int = Field(default=16000, ge=1000, le=64000)

    @field_validator("gitlab_url", "llm_base_url")
    @classmethod
    def no_url_credentials(cls, url: HttpUrl) -> HttpUrl:
        if url.username or url.password or url.query or url.fragment:
            raise ValueError("Service URLs must not include credentials, query or fragment")
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
