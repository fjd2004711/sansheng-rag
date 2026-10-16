"""research_reports: web research reports generated in the background (Word / PDF export)

Revision ID: 0035_research_reports
Revises: 0034_app_settings
Create Date: 2026-10-16
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

revision = "0035_research_reports"
down_revision = "0034_app_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "research_reports",
        sa.Column("id", PG_UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", PG_UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("topic", sa.Text(), nullable=False),
        sa.Column("title", sa.String(300), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("stage", sa.String(200), nullable=False, server_default=""),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("report", JSONB(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_research_reports_user_id", "research_reports", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_research_reports_user_id", table_name="research_reports")
    op.drop_table("research_reports")
