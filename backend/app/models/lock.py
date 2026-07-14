from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SiteConfig(Base):
    """
    Single-row table that holds the global unlock gate date.
    Row id=1 is seeded by migration and must never be deleted.
    PATCH /site/config updates this row in-place.
    """

    __tablename__ = "site_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # All content is locked until this datetime passes (server clock, UTC).
    unlock_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    def __repr__(self) -> str:
        return f"<SiteConfig unlock_date={self.unlock_date}>"


class EntryLock(Base):
    """
    Optional per-entry lock.  An entry without a matching row here is treated
    as 'no lock' — it auto-opens once the global unlock_date passes.

    SECURITY NOTE: passcode_hash and riddle_answer_hash store bcrypt hashes.
    The plain-text values are discarded immediately after hashing.  The riddle
    question is intentionally stored in plaintext so the frontend can display it.
    """

    __tablename__ = "entry_locks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    entry_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("entries.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    # 'passcode' | 'riddle'
    lock_type: Mapped[str] = mapped_column(String(10), nullable=False)
    # Set when lock_type = 'passcode'
    passcode_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Set when lock_type = 'riddle'
    riddle_question: Mapped[str | None] = mapped_column(String(500), nullable=True)
    riddle_answer_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    def __repr__(self) -> str:
        return f"<EntryLock entry={self.entry_id} type={self.lock_type!r}>"


class EntryUnlock(Base):
    """
    Records that a specific user has successfully solved a specific entry's lock.
    Composite PK ensures the (entry, user) pair is idempotent — solving twice
    is silently accepted by the unlock endpoint.
    """

    __tablename__ = "entry_unlocks"
    __table_args__ = (
        UniqueConstraint("entry_id", "user_id", name="uq_entry_unlock"),
    )

    entry_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("entries.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    unlocked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<EntryUnlock entry={self.entry_id} user={self.user_id}>"
