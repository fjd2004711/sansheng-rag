"""EvalCandidate model — a real user question an admin wants in the evaluation set."""

import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class EvalCandidate(TimestampMixin, Base):
    """Awaiting human curation: the expected phrase is what the correct answer must contain."""

    __tablename__ = "eval_candidates"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    expected_phrase: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    abstain: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    failure_type: Mapped[str] = mapped_column(
        String(40), nullable=False, default="insufficient_evidence"
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_message_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("messages.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    def __repr__(self) -> str:
        return f"<EvalCandidate(id={self.id}, abstain={self.abstain})>"
