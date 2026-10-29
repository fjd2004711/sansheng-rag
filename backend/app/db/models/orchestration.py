"""Orchestration platform tables: runs, their replayable event log, user-defined specs and run feedback."""

import uuid
from typing import Any

from sqlalchemy import BigInteger, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class OrchRun(TimestampMixin, Base):
    """One execution of a workflow. ``bundle`` snapshots the exact definitions it ran with (reproducible)."""

    __tablename__ = "orch_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    spec_name: Mapped[str] = mapped_column(String(120), nullable=False)
    topic: Mapped[str] = mapped_column(Text, nullable=False)
    run_input: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    bundle: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="queued"
    )  # queued|running|done|failed
    stage: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    metrics: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<OrchRun(id={self.id}, spec={self.spec_name}, status={self.status})>"


class OrchEvent(Base):
    """Append-only: the run can be replayed (timeline, gate checks, repairs) from these rows alone."""

    __tablename__ = "orch_events"
    __table_args__ = (UniqueConstraint("run_id", "seq", name="uq_orch_events_run_seq"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    run_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("orch_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    t: Mapped[float] = mapped_column(Float, nullable=False)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    detail: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    def __repr__(self) -> str:
        return f"<OrchEvent(run={self.run_id}, seq={self.seq}, kind={self.kind})>"


class OrchSpec(TimestampMixin, Base):
    """A user's own definition set (YAML), validated on save. Built-in definitions live in code."""

    __tablename__ = "orch_specs"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_orch_specs_user_name"),)

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    yaml: Mapped[str] = mapped_column(Text, nullable=False)

    def __repr__(self) -> str:
        return f"<OrchSpec(user={self.user_id}, name={self.name})>"


class OrchFeedback(TimestampMixin, Base):
    """A reader's verdict on a finished run; aggregated with the run's failure types into improvement hints."""

    __tablename__ = "orch_feedback"
    __table_args__ = (UniqueConstraint("run_id", "user_id", name="uq_orch_feedback_run_user"),)

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    run_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("orch_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)  # 1 helpful, -1 not helpful
    tags: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<OrchFeedback(run={self.run_id}, rating={self.rating})>"
