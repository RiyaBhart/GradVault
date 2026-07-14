from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EntrySong(Base):
    """
    Optional YouTube song attached to a letter entry.

    DESIGN NOTE: Only the 11-character YouTube video ID is stored.
    No audio or video bytes are ever fetched or written to disk.
    The IFrame Player API streams content directly from YouTube's CDN.

    Constraints:
      - One song per entry (unique entry_id).
      - start_seconds: playback start offset in seconds (default 0).
      - volume: IFrame player volume 0-100 (default 100).
    """

    __tablename__ = "entry_songs"

    entry_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("entries.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )
    # Exactly 11 characters — YouTube's stable video ID format.
    youtube_video_id: Mapped[str] = mapped_column(String(11), nullable=False)
    start_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    volume: Mapped[int] = mapped_column(Integer, nullable=False, default=100)

    def __repr__(self) -> str:
        return f"<EntrySong entry={self.entry_id} vid={self.youtube_video_id!r}>"
