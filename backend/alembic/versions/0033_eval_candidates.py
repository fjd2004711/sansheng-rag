"""eval_candidates: real questions admins queue for the evaluation set

Revision ID: 0033_eval_candidates
Revises: 0032_token_usage
Create Date: 2026-10-09
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

revision = "0033_eval_candidates"
down_revision = "0032_token_usage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "eval_candidates",
        sa.Column("id", PG_UUID(as_uuid=True), primary_key=True),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("expected_phrase", sa.String(300), nullable=False, server_default=""),
        sa.Column("abstain", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("failure_type", sa.String(40), nullable=False, server_default="insufficient_evidence"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "source_message_id", PG_UUID(as_uuid=True), sa.ForeignKey("messages.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("created_by", PG_UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("eval_candidates")
