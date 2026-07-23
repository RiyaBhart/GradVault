"""
entries.py — POST /entries/{id}/unlock  +  GET /entries/{id}/content

Two-layer lock check (in order):
  1. Global gate  — reject if now < site_config.unlock_date
  2. Entry lock   — verify passcode (bcrypt) or riddle (difflib fuzzy match)
  3. On success   — insert entry_unlocks row (idempotent)
  4. Always       — return {success: bool}; NEVER hint at the correct answer
                    or how close the global date is.

Content endpoint (GET /entries/{id}/content):
  - Enforces BOTH the global gate AND a per-user entry_unlocks row.
  - Letters  → JSON { entry_type: "letter", text_content: "..." }
  - Photos   → Binary image stream (correct Content-Type) + X-Entry-Notes header
  - Videos   → Binary video stream with HTTP Range support (206 Partial Content)
               + X-Entry-Notes header for the optional caption
  - 403 on any gate failure — identical message to prevent oracle attacks.
"""

import difflib
import os
import re
from datetime import datetime, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.entry import Entry
from app.models.lock import EntryLock, EntryUnlock, SiteConfig
from app.models.thread import ThreadMember
from app.models.user import User
from app.models.entry_song import EntrySong
from app.schemas import LetterContent, UnlockAttempt, UnlockResult, EntrySongOut
from app.core.crypto import decrypt_content
from app.core.storage import download_media, delete_media

router = APIRouter(prefix="/entries", tags=["entries"])

# Path where photo files are stored (must match threads.py STORAGE_DIR)
STORAGE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "storage", "photos")
)

# Path where video files are stored (must match threads.py VIDEO_STORAGE_DIR)
VIDEOS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "storage", "videos")
)

# Fuzzy-match threshold for riddle answers (0 – 1.0).
RIDDLE_MATCH_THRESHOLD: float = 0.85

# Characters stripped during riddle normalization
_STRIP_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)

# Chunk size for video streaming (256 KB)
_VIDEO_CHUNK_SIZE = 256 * 1024


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _normalize(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    text = text.lower()
    text = _STRIP_PUNCT.sub("", text)
    text = " ".join(text.split())
    return text


def _riddle_matches(guess: str, stored_hash: str) -> bool:
    """
    Riddle answers are stored as 'plain:<normalised_answer>' so we can do
    fuzzy matching without bcrypt. The 'plain:' sentinel is an internal
    implementation detail and is never exposed via any API response.
    """
    norm_guess = _normalize(guess)

    if stored_hash.startswith("plain:"):
        norm_answer = stored_hash[len("plain:"):]
        ratio = difflib.SequenceMatcher(None, norm_guess, norm_answer).ratio()
        return ratio >= RIDDLE_MATCH_THRESHOLD
    else:
        # Legacy bcrypt fallback
        try:
            return bcrypt.checkpw(norm_guess.encode(), stored_hash.encode())
        except Exception:
            return False


def _verify_passcode(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _record_unlock(db: Session, entry_id: int, user_id: int) -> None:
    """Insert an entry_unlocks row; silently skip if it already exists."""
    existing = (
        db.query(EntryUnlock)
        .filter(EntryUnlock.entry_id == entry_id, EntryUnlock.user_id == user_id)
        .first()
    )
    if not existing:
        db.add(EntryUnlock(entry_id=entry_id, user_id=user_id))
        db.commit()


def _assert_member(entry: Entry, user_id: int, db: Session) -> None:
    membership = (
        db.query(ThreadMember)
        .filter(
            ThreadMember.thread_id == entry.thread_id,
            ThreadMember.user_id == user_id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")


def _get_unlock_date(db: Session) -> datetime:
    """Return the site unlock_date as a tz-aware UTC datetime."""
    cfg = db.query(SiteConfig).filter(SiteConfig.id == 1).first()
    if cfg is None:
        # No config row → treat as permanently locked
        return datetime(9999, 1, 1, tzinfo=timezone.utc)
    if cfg.unlock_date.tzinfo is None:
        return cfg.unlock_date.replace(tzinfo=timezone.utc)
    return cfg.unlock_date.astimezone(timezone.utc)


def _assert_global_gate(db: Session) -> None:
    """Raise 403 if the site unlock date has not passed yet."""
    unlock_date = _get_unlock_date(db)
    if datetime.now(timezone.utc) < unlock_date:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This content is not yet available.",
        )


def _assert_user_unlocked(entry_id: int, user_id: int, db: Session) -> None:
    """
    Raise 403 if the user does not have an entry_unlocks row for a locked entry.
    Entries without custom locks (EntryLock is None) do not require a per-user
    guess — they are controlled solely by the global site unlock_date gate.
    """
    entry_lock = db.query(EntryLock).filter(EntryLock.entry_id == entry_id).first()
    if entry_lock is None:
        return

    row = (
        db.query(EntryUnlock)
        .filter(EntryUnlock.entry_id == entry_id, EntryUnlock.user_id == user_id)
        .first()
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Entry not unlocked.",
        )


def _media_type_from_key(media_key: str) -> str:
    ext = os.path.splitext(media_key)[1].lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".webm": "video/webm",
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
    }.get(ext, "application/octet-stream")


def _safe_notes_header(notes: str | None) -> str:
    """
    Encode notes for the X-Entry-Notes response header.
    HTTP headers must not contain newlines; replace them with spaces.
    Returns an empty string if notes is None/empty.
    """
    if not notes:
        return ""
    # Strip control characters that are illegal in header values
    return notes.replace("\r", " ").replace("\n", " ").strip()


# ---------------------------------------------------------------------------
# Range-aware video streaming
# ---------------------------------------------------------------------------


def _stream_video_bytes(video_bytes: bytes, media_type: str, notes: str | None, request: Request) -> Response:
    """
    Stream video bytes with HTTP Range request support so the browser's
    <video> player can seek properly (RFC 7233).

    Without Range header  → 200 + full bytes
    With Range header     → 206 Partial Content + slice
    """
    file_size = len(video_bytes)
    range_header = request.headers.get("range", "")

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": media_type,
        "X-Entry-Notes": _safe_notes_header(notes),
    }

    if not range_header:
        headers["Content-Length"] = str(file_size)
        return Response(content=video_bytes, status_code=200, headers=headers, media_type=media_type)

    # Parse "bytes=start-end"
    try:
        range_spec = range_header.replace("bytes=", "").strip()
        start_str, end_str = range_spec.split("-", 1)
        start = int(start_str) if start_str else 0
        end = int(end_str) if end_str else file_size - 1
    except (ValueError, AttributeError):
        raise HTTPException(status_code=416, detail="Invalid Range header.")

    if start > end or end >= file_size:
        headers_416 = {"Content-Range": f"bytes */{file_size}"}
        raise HTTPException(status_code=416, headers=headers_416, detail="Range not satisfiable.")

    chunk = video_bytes[start : end + 1]
    headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
    headers["Content-Length"] = str(len(chunk))
    return Response(content=chunk, status_code=206, headers=headers, media_type=media_type)


# ---------------------------------------------------------------------------
# POST /entries/{id}/unlock
# ---------------------------------------------------------------------------


@router.post("/{entry_id}/unlock", response_model=UnlockResult)
def unlock_entry(
    entry_id: int,
    payload: UnlockAttempt,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Attempt to unlock a single entry for the requesting user.

    Order of checks:
    1. Entry must exist and caller must be a thread member.
    2. Global date gate — now must be ≥ site_config.unlock_date.
    3. Per-entry lock — passcode (bcrypt) or riddle (fuzzy plain-text).
    4. Record unlock (idempotent).
    """

    # ── 1. Fetch entry and assert membership ──────────────────────────────
    entry = db.query(Entry).filter(Entry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found.")
    _assert_member(entry, current_user.id, db)

    # ── 2. Global gate ────────────────────────────────────────────────────
    _assert_global_gate(db)

    # ── 3. Per-entry lock ─────────────────────────────────────────────────
    entry_lock = db.query(EntryLock).filter(EntryLock.entry_id == entry_id).first()

    # No lock at all → auto-open once date passes
    if entry_lock is None:
        _record_unlock(db, entry_id, current_user.id)
        return UnlockResult(success=True)

    # Already unlocked for this user (idempotent)
    existing = (
        db.query(EntryUnlock)
        .filter(EntryUnlock.entry_id == entry_id, EntryUnlock.user_id == current_user.id)
        .first()
    )
    if existing:
        return UnlockResult(success=True)

    # Verify the guess
    if entry_lock.lock_type == "passcode":
        ok = _verify_passcode(payload.guess, entry_lock.passcode_hash or "")
    elif entry_lock.lock_type == "riddle":
        ok = _riddle_matches(payload.guess, entry_lock.riddle_answer_hash or "")
    else:
        ok = False

    if not ok:
        return UnlockResult(success=False)

    # ── 4. Record success ─────────────────────────────────────────────────
    _record_unlock(db, entry_id, current_user.id)
    return UnlockResult(success=True)


# ---------------------------------------------------------------------------
# GET /entries/{id}/content
# The ONLY endpoint allowed to return text_content, photo bytes, video bytes,
# or notes.  Enforces: auth + membership + global gate + per-user unlock record.
# ---------------------------------------------------------------------------


@router.get("/{entry_id}/content")
def get_entry_content(
    entry_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns the actual content of a fully unlocked entry.

    Gates (checked in order, all must pass):
      1. JWT authentication (implicit via get_current_user dependency).
      2. Thread membership.
      3. Global site unlock_date has passed.
      4. A row exists in entry_unlocks for (entry_id, current_user.id).

    Responses:
      - Letter → 200 JSON  { entry_type: "letter", text_content: "..." }
      - Photo  → 200 image bytes + X-Entry-Notes header
      - Video  → 200/206 video bytes + X-Entry-Notes header (Range-aware)
      - Any gate failure → 403 with a generic message (no oracle info leaked)
    """

    # ── 1+2. Entry existence + membership ────────────────────────────────
    entry = db.query(Entry).filter(Entry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found.")
    _assert_member(entry, current_user.id, db)

    # ── 3. Global gate ────────────────────────────────────────────────────
    _assert_global_gate(db)

    # ── 4. Per-user unlock record ─────────────────────────────────────────
    _assert_user_unlocked(entry_id, current_user.id, db)

    # ── 5. Serve content ──────────────────────────────────────────────────
    if entry.entry_type == "letter":
        if not entry.text_content:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Letter content is missing.",
            )
        song_row = db.query(EntrySong).filter(EntrySong.entry_id == entry.id).first()
        song_data = EntrySongOut.model_validate(song_row) if song_row else None
        return LetterContent(
            entry_type="letter",
            text_content=decrypt_content(entry.text_content) or "",
            song=song_data,
        )

    elif entry.entry_type == "photo":
        if not entry.media_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Photo media key is missing.",
            )
        try:
            content_bytes = download_media(entry.media_key)
        except FileNotFoundError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Photo file not found in storage.",
            )
        media_type = _media_type_from_key(entry.media_key)
        return Response(
            content=content_bytes,
            media_type=media_type,
            headers={"X-Entry-Notes": _safe_notes_header(decrypt_content(entry.notes))},
        )

    elif entry.entry_type == "video":
        if not entry.media_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Video media key is missing.",
            )
        try:
            content_bytes = download_media(entry.media_key)
        except FileNotFoundError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Video file not found in storage.",
            )
        media_type = _media_type_from_key(entry.media_key)
        return _stream_video_bytes(content_bytes, media_type, decrypt_content(entry.notes), request)

    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown entry type: {entry.entry_type!r}",
        )


# ---------------------------------------------------------------------------
# DELETE /entries/{entry_id} — delete entry & cleanup media from storage
# ---------------------------------------------------------------------------


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete an entry. Only the author of the entry or an admin can delete it.
    If the entry has associated media (photo/video), deletes the object from storage.
    """
    entry = db.query(Entry).filter(Entry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found.")

    if entry.author_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to delete this entry.",
        )

    # If the entry has a media key, delete object from storage
    if entry.media_key:
        delete_media(entry.media_key)

    db.delete(entry)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
