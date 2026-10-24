import os
import subprocess

from sqlalchemy import create_engine, inspect


def test_upgrade_and_downgrade(tmp_path):
    url = f"sqlite:///{tmp_path}/migration.db"
    env = os.environ | {"DATABASE_URL": url}
    subprocess.run(["alembic", "upgrade", "head"], check=True, env=env, capture_output=True)
    engine = create_engine(url)
    assert {"projects", "analyses", "messages"}.issubset(inspect(engine).get_table_names())
    engine.dispose()
    subprocess.run(["alembic", "check"], check=True, env=env, capture_output=True)
    subprocess.run(["alembic", "downgrade", "base"], check=True, env=env, capture_output=True)
    engine = create_engine(url)
    assert inspect(engine).get_table_names() == ["alembic_version"]
    engine.dispose()
