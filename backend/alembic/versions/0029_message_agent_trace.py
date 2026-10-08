"""messages: store the structured self-correction trace with each answer

Revision ID: 0029_message_agent_trace
Revises: 0028_drop_template_tables
Create Date: 2026-10-08
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0029_message_agent_trace"
down_revision = "0028_drop_template_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("agent_trace", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("messages", "agent_trace")
