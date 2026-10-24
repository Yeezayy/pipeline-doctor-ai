"""GitLab IDs can exceed PostgreSQL's signed 32-bit integer range."""

import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("projects") as batch:
        batch.alter_column(
            "gitlab_id", existing_type=sa.Integer(), type_=sa.BigInteger(), existing_nullable=False
        )
    with op.batch_alter_table("analyses") as batch:
        for column in ("pipeline_id", "job_id"):
            batch.alter_column(
                column, existing_type=sa.Integer(), type_=sa.BigInteger(), existing_nullable=False
            )


def downgrade():
    # Downgrade is only possible if all retained IDs fit in a signed 32-bit integer.
    with op.batch_alter_table("analyses") as batch:
        for column in ("pipeline_id", "job_id"):
            batch.alter_column(
                column, existing_type=sa.BigInteger(), type_=sa.Integer(), existing_nullable=False
            )
    with op.batch_alter_table("projects") as batch:
        batch.alter_column(
            "gitlab_id", existing_type=sa.BigInteger(), type_=sa.Integer(), existing_nullable=False
        )
