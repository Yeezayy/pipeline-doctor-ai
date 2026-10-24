"""Encrypted OAuth sessions and per-user ownership; legacy rows remain unowned."""

import sqlalchemy as sa

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("instance_url", sa.String(2000), nullable=False),
        sa.Column("gitlab_id", sa.BigInteger(), nullable=False),
        sa.Column("username", sa.String(255), nullable=False),
        sa.Column("name", sa.String(500), nullable=False),
        sa.UniqueConstraint("instance_url", "gitlab_id", name="uq_user_gitlab_identity"),
    )
    op.create_table(
        "login_sessions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("access_cipher", sa.Text(), nullable=False),
        sa.Column("refresh_cipher", sa.Text(), nullable=False),
        sa.Column("token_expires_at", sa.BigInteger(), nullable=False),
        sa.Column("expires_at", sa.BigInteger(), nullable=False),
        sa.Column("csrf_token", sa.String(64), nullable=False),
        sa.Column("refresh_claim", sa.String(36)),
        sa.Column("refresh_started_at", sa.BigInteger()),
    )
    op.create_index("ix_login_sessions_user_id", "login_sessions", ["user_id"])
    op.create_index("ix_login_sessions_expires_at", "login_sessions", ["expires_at"])
    op.create_table(
        "oauth_states",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("browser_hash", sa.String(64), nullable=False),
        sa.Column("verifier_cipher", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.BigInteger(), nullable=False),
    )
    op.create_index("ix_oauth_states_expires_at", "oauth_states", ["expires_at"])
    for table in ("projects", "analyses"):
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("owner_id", sa.String(36), nullable=True))
            batch.create_foreign_key(f"fk_{table}_owner", "users", ["owner_id"], ["id"])
            batch.create_index(f"ix_{table}_owner_id", ["owner_id"])


def downgrade():
    for table in ("analyses", "projects"):
        with op.batch_alter_table(table) as batch:
            batch.drop_index(f"ix_{table}_owner_id")
            batch.drop_constraint(f"fk_{table}_owner", type_="foreignkey")
            batch.drop_column("owner_id")
    op.drop_table("oauth_states")
    op.drop_table("login_sessions")
    op.drop_table("users")
