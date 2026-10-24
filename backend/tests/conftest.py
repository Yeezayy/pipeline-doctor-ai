import os
import tempfile

import pytest
from fastapi.testclient import TestClient

_directory = tempfile.TemporaryDirectory(prefix="doctor-tests-")
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", f"sqlite:///{_directory.name}/test.db"
)
os.environ["DEMO_MODE"] = "true"
os.environ["APP_API_KEY"] = ""
os.environ["GITLAB_TOKEN"] = ""
os.environ["LLM_API_KEY"] = ""
os.environ["AUTH_MODE"] = "local"

from app.core.config import Settings, get_settings  # noqa: E402
from app.core.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    settings = get_settings()
    settings.demo_mode = True
    settings.app_api_key = ""
    settings.gitlab_token = ""
    settings.llm_api_key = ""
    settings.auth_mode = "local"
    settings.gitlab_client_id = ""
    settings.gitlab_client_secret = ""
    settings.gitlab_oauth_public = False
    settings.token_encryption_key = ""
    settings.public_app_url = Settings().public_app_url
    settings.gitlab_url = Settings().gitlab_url
    yield


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
