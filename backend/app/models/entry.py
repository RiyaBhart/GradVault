from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Entry(Base):
    """
    A single entry (letter, photo, or video) in a thread.

    SECURITY NOTE: text_content, media_key, and notes are stored in the
    database but are DELIBERATELY EXCLUDED from every Pydantic response schema.
    No GET endpoint should ever return any of these fields — the content is
    locked until both gates pass (global date + per-user unlock record).
    If you add a new response schema, double-check that none of these fields
    appears in it.
    """

    __tablename__ = "entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    thread_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("threads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # 'letter' | 'photo' | 'video'
    entry_type: Mapped[str] = mapped_column(String(10), nullable=False, default="letter")

    # ------------------------------------------------------------------ LOCKED
    # These columns must NEVER appear in any API response schema.
    text_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Optional caption for photo/video entries (≤ 500 chars, enforced at app layer).
    # Returned ONLY by GET /entries/{id}/content after both gates pass.
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # ------------------------------------------------------------------ /LOCKED
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<Entry id={self.id} type={self.entry_type!r} thread={self.thread_id}>"
