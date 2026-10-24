"""Projects, analyses and conversations; no raw log storage."""

import sqlalchemy as sa

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "projects",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column("gitlab_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("web_url", sa.String(2000), nullable=False),
        sa.Column("source", sa.String(10), nullable=False),
    )
    op.create_table(
        "analyses",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(40), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("pipeline_id", sa.Integer(), nullable=False),
        sa.Column("job_id", sa.Integer(), nullable=False),
        sa.Column("job_name", sa.String(500), nullable=False),
        sa.Column("source", sa.String(10), nullable=False),
        sa.Column("diagnosis", sa.JSON(), nullable=False),
        sa.Column("pipeline", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_analyses_source", "analyses", ["source"])
    op.create_index("ix_analyses_created_at", "analyses", ["created_at"])
    op.create_table(
        "messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "analysis_id",
            sa.String(36),
            sa.ForeignKey("analyses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(12), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_messages_analysis_id", "messages", ["analysis_id"])


def downgrade():
    op.drop_table("messages")
    op.drop_table("analyses")
    op.drop_table("projects")
