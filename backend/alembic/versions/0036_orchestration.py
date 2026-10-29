"""orchestration platform: runs, events, user specs, run feedback

Revision ID: 0036_orchestration
Revises: 0035_research_reports
Create Date: 2026-10-30
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from alembic import op

revision = "0036_orchestration"
down_revision = "0035_research_reports"
branch_labels = None
depends_on = None


def _ts() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    ]


def upgrade() -> None:
    op.create_table(
        "orch_runs",
        sa.Column("id", PG_UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            PG_UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("spec_name", sa.String(120), nullable=False),
        sa.Column("topic", sa.Text(), nullable=False),
        sa.Column("run_input", JSONB(), nullable=False, server_default="{}"),
        sa.Column("bundle", JSONB(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("stage", sa.String(200), nullable=False, server_default=""),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("result", JSONB(), nullable=True),
        sa.Column("metrics", JSONB(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        *_ts(),
    )
    op.create_index("ix_orch_runs_user_id", "orch_runs", ["user_id"])
    op.create_table(
        "orch_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "run_id",
            PG_UUID(as_uuid=True),
            sa.ForeignKey("orch_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("t", sa.Float(), nullable=False),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("detail", JSONB(), nullable=False, server_default="{}"),
        sa.UniqueConstraint("run_id", "seq", name="uq_orch_events_run_seq"),
    )
    op.create_index("ix_orch_events_run_id", "orch_events", ["run_id"])
    op.create_table(
        "orch_specs",
        sa.Column("id", PG_UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            PG_UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("yaml", sa.Text(), nullable=False),
        *_ts(),
        sa.UniqueConstraint("user_id", "name", name="uq_orch_specs_user_name"),
    )
    op.create_index("ix_orch_specs_user_id", "orch_specs", ["user_id"])
    op.create_table(
        "orch_feedback",
        sa.Column("id", PG_UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "run_id",
            PG_UUID(as_uuid=True),
            sa.ForeignKey("orch_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            PG_UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("tags", JSONB(), nullable=False, server_default="[]"),
        sa.Column("comment", sa.Text(), nullable=True),
        *_ts(),
        sa.UniqueConstraint("run_id", "user_id", name="uq_orch_feedback_run_user"),
    )
    op.create_index("ix_orch_feedback_run_id", "orch_feedback", ["run_id"])
    op.create_index("ix_orch_feedback_user_id", "orch_feedback", ["user_id"])


def downgrade() -> None:
    for table in ("orch_feedback", "orch_specs", "orch_events", "orch_runs"):
        op.drop_table(table)
