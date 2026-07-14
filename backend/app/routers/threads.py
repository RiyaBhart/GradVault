import json
import os
import re
import secrets
import shutil
import string
import uuid
from datetime import datetime, timezone
from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, Form, HTTPException, status, File, UploadFile
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.entry import Entry
from app.models.lock import EntryLock, EntryUnlock
from app.models.thread import Thread, ThreadInvite, ThreadMember
from app.models.entry_song import EntrySong
from app.models.user import User
from app.schemas import (
    EntryMetadata,
    InviteCreate,
    InviteResponse,
    LetterCreate,
    LockCreate,
    MemberResponse,
    ThreadCreate,
    ThreadDetail,
    ThreadResponse,
)

router = APIRouter(prefix="/threads", tags=["threads"])

_INVITE_ALPHABET = string.ascii_letters + string.digits

# Characters stripped during riddle normalization (mirrors entries.py)
_STRIP_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)

# ---------------------------------------------------------------------------
# Storage constants
# ---------------------------------------------------------------------------

STORAGE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "storage", "photos")
)

VIDEO_STORAGE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "storage", "videos")
)

# Max file sizes
MAX_PHOTO_SIZE: int = 8 * 1024 * 1024   # 8 MB
MAX_VIDEO_SIZE: int = 50 * 1024 * 1024  # 50 MB

# Allowed MIME types (validated server-side, not just by extension)
ALLOWED_VIDEO_MIME_TYPES = {"video/webm", "video/mp4", "video/quicktime"}
ALLOWED_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}

# Notes field: max length enforced at app layer
MAX_NOTES_LENGTH: int = 500


def _normalize_riddle(text: str) -> str:
    text = text.lower()
    text = _STRIP_PUNCT.sub("", text)
    text = " ".join(text.split())
    return text


def _generate_code(length: int = 8) -> str:
    """Generate a URL-safe random invite code."""
    return "".join(secrets.choice(_INVITE_ALPHABET) for _ in range(length))


def _assert_member(thread_id: int, user_id: int, db: Session) -> ThreadMember:
    """Raise 403 if the user is not a member of the thread."""
    member = (
        db.query(ThreadMember)
        .filter(ThreadMember.thread_id == thread_id, ThreadMember.user_id == user_id)
        .first()
    )
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this thread.",
        )
    return member


def _get_thread_or_404(thread_id: int, db: Session) -> Thread:
    thread = db.query(Thread).filter(Thread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found.")
    return thread


def _update_streak(db: Session, user: User) -> None:
    last_entry = db.query(Entry).filter(Entry.author_id == user.id).order_by(Entry.created_at.desc()).first()
    now_date = datetime.now(timezone.utc).date()
    if last_entry:
        if last_entry.created_at.tzinfo is None:
            last_date = last_entry.created_at.replace(tzinfo=timezone.utc).date()
        else:
            last_date = last_entry.created_at.astimezone(timezone.utc).date()
        delta = (now_date - last_date).days
        if delta == 1:
            user.streak_count += 1
        elif delta > 1:
            user.streak_count = 1
    else:
        user.streak_count = 1


def _create_entry_lock(db: Session, entry_id: int, lock: LockCreate) -> None:
    """Create an EntryLock row from a validated LockCreate payload."""
    if lock.lock_type == "passcode":
        passcode_hash = bcrypt.hashpw(
            lock.passcode.encode("utf-8"), bcrypt.gensalt()
        ).decode("utf-8")
        db.add(
            EntryLock(
                entry_id=entry_id,
                lock_type="passcode",
                passcode_hash=passcode_hash,
            )
        )
    elif lock.lock_type == "riddle":
        # Store normalised plaintext prefixed with "plain:" so the unlock
        # endpoint can do a fuzzy difflib match without needing the original.
        norm_answer = _normalize_riddle(lock.riddle_answer)
        db.add(
            EntryLock(
                entry_id=entry_id,
                lock_type="riddle",
                riddle_question=lock.riddle_question,
                riddle_answer_hash=f"plain:{norm_answer}",
            )
        )
    db.commit()


def _build_entry_metadata(
    db: Session, entry_id: int, entry_thread_id: int, entry_author_id: int,
    entry_type: str, entry_created_at: datetime, current_user_id: int,
    theme: str
) -> EntryMetadata:
    """Build an EntryMetadata with lock state for the requesting user."""
    lock = db.query(EntryLock).filter(EntryLock.entry_id == entry_id).first()
    has_lock = lock is not None
    lock_type = lock.lock_type if lock else None
    riddle_question = lock.riddle_question if (lock and lock.lock_type == "riddle") else None

    is_unlocked = False
    if has_lock:
        unlock_row = (
            db.query(EntryUnlock)
            .filter(
                EntryUnlock.entry_id == entry_id,
                EntryUnlock.user_id == current_user_id,
            )
            .first()
        )
        is_unlocked = unlock_row is not None

    return EntryMetadata(
        id=entry_id,
        thread_id=entry_thread_id,
        author_id=entry_author_id,
        entry_type=entry_type,
        created_at=entry_created_at,
        has_lock=has_lock,
        is_unlocked=is_unlocked,
        lock_type=lock_type,
        riddle_question=riddle_question,
        theme=theme,
    )


# ---------------------------------------------------------------------------
# POST /threads — create a thread; auto-add creator as member
# ---------------------------------------------------------------------------


@router.post("", response_model=ThreadResponse, status_code=status.HTTP_201_CREATED)
def create_thread(
    payload: ThreadCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    thread = Thread(
        type=payload.type,
        title=payload.title,
        created_by=current_user.id,
    )
    db.add(thread)
    db.flush()  # populate thread.id before creating the member row

    member = ThreadMember(thread_id=thread.id, user_id=current_user.id)
    db.add(member)
    db.commit()
    db.refresh(thread)
    return thread


# ---------------------------------------------------------------------------
# GET /threads — list threads the current user belongs to
# ---------------------------------------------------------------------------


@router.get("", response_model=list[ThreadResponse])
def list_threads(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    memberships = (
        db.query(ThreadMember).filter(ThreadMember.user_id == current_user.id).all()
    )
    thread_ids = [m.thread_id for m in memberships]
    if not thread_ids:
        return []
    threads = db.query(Thread).filter(Thread.id.in_(thread_ids)).all()
    return threads


# ---------------------------------------------------------------------------
# GET /threads/{id} — thread detail with locked entry placeholders + lock state
# ---------------------------------------------------------------------------


@router.get("/{thread_id}", response_model=ThreadDetail)
def get_thread(
    thread_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    thread = _get_thread_or_404(thread_id, db)
    _assert_member(thread_id, current_user.id, db)

    # Build member list with user metadata
    raw_members = (
        db.query(ThreadMember, User)
        .join(User, ThreadMember.user_id == User.id)
        .filter(ThreadMember.thread_id == thread_id)
        .all()
    )
    members = [
        MemberResponse(
            user_id=m.user_id,
            joined_at=m.joined_at,
            username=u.username,
            nickname=u.nickname,
            avatar_sticker=u.avatar_sticker,
        )
        for m, u in raw_members
    ]

    # Entries — only metadata + lock state; content never included
    raw_entries = (
        db.query(
            Entry.id,
            Entry.thread_id,
            Entry.author_id,
            Entry.entry_type,
            Entry.created_at,
            Entry.theme,
        )
        .filter(Entry.thread_id == thread_id)
        .order_by(Entry.created_at.desc())
        .all()
    )
    entries = [
        _build_entry_metadata(
            db=db,
            entry_id=row.id,
            entry_thread_id=row.thread_id,
            entry_author_id=row.author_id,
            entry_type=row.entry_type,
            entry_created_at=row.created_at,
            current_user_id=current_user.id,
            theme=row.theme,
        )
        for row in raw_entries
    ]

    return ThreadDetail(
        thread=ThreadResponse.model_validate(thread),
        members=members,
        entries=entries,
    )


# ---------------------------------------------------------------------------
# POST /threads/{id}/invite — generate invite code (members only)
# ---------------------------------------------------------------------------


@router.post(
    "/{thread_id}/invite",
    response_model=InviteResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_invite(
    thread_id: int,
    payload: InviteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_thread_or_404(thread_id, db)
    _assert_member(thread_id, current_user.id, db)

    # Guarantee uniqueness — retry up to 5 times (collision probability is negligible)
    for _ in range(5):
        code = _generate_code()
        if not db.query(ThreadInvite).filter(ThreadInvite.code == code).first():
            break

    invite = ThreadInvite(
        thread_id=thread_id,
        code=code,
        created_by=current_user.id,
        expires_at=payload.expires_at,
        max_uses=payload.max_uses,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


# ---------------------------------------------------------------------------
# POST /threads/{id}/entries/letter — post a letter + optional lock
# ---------------------------------------------------------------------------


@router.post(
    "/{thread_id}/entries/letter",
    response_model=EntryMetadata,
    status_code=status.HTTP_201_CREATED,
)
def post_letter(
    thread_id: int,
    payload: LetterCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_thread_or_404(thread_id, db)
    _assert_member(thread_id, current_user.id, db)

    video_id = None
    if payload.youtube_url:
        url = payload.youtube_url.strip()
        # Extract YouTube ID
        if re.match(r"^[A-Za-z0-9_-]{11}$", url):
            video_id = url
        else:
            match = re.search(
                r"(?:v=|\/v\/|embed\/|shorts\/|youtu\.be\/)([A-Za-z0-9_-]{11})", url
            )
            if match:
                video_id = match.group(1)

        if not video_id or not re.match(r"^[A-Za-z0-9_-]{11}$", video_id):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid YouTube URL — could not extract a valid video ID.",
            )

    entry = Entry(
        thread_id=thread_id,
        author_id=current_user.id,
        entry_type="letter",
        text_content=payload.text_content,  # stored but never returned via API
        theme=payload.theme,
    )
    _update_streak(db, current_user)
    db.add(entry)
    db.commit()

    if video_id:
        song = EntrySong(
            entry_id=entry.id,
            youtube_video_id=video_id,
            start_seconds=0,
            volume=100,
        )
        db.add(song)
        db.commit()

    # Create the optional per-entry lock
    if payload.lock:
        _create_entry_lock(db, entry.id, payload.lock)

    return _build_entry_metadata(
        db=db,
        entry_id=entry.id,
        entry_thread_id=entry.thread_id,
        entry_author_id=entry.author_id,
        entry_type=entry.entry_type,
        entry_created_at=entry.created_at,
        current_user_id=current_user.id,
        theme=entry.theme,
    )


# ---------------------------------------------------------------------------
# POST /threads/{id}/entries/photo — upload a photo entry + optional lock
# ---------------------------------------------------------------------------


@router.post(
    "/{thread_id}/entries/photo",
    response_model=EntryMetadata,
    status_code=status.HTTP_201_CREATED,
)
def post_photo(
    thread_id: int,
    file: UploadFile = File(...),
    # Lock fields come as separate multipart form fields (JSON body isn't possible
    # alongside a file upload). All are optional.
    lock_type: Optional[str] = Form(default=None),
    lock_passcode: Optional[str] = Form(default=None),
    lock_riddle_question: Optional[str] = Form(default=None),
    lock_riddle_answer: Optional[str] = Form(default=None),
    theme: Optional[str] = Form(default="classic"),
    # Optional caption (≤ MAX_NOTES_LENGTH chars) — locked with the entry.
    notes: Optional[str] = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_thread_or_404(thread_id, db)
    _assert_member(thread_id, current_user.id, db)

    # 1. Validate File Size (< 8MB)
    size = getattr(file, "size", None)
    if size is None:
        file.file.seek(0, 2)
        size = file.file.tell()
        file.file.seek(0)

    if size > MAX_PHOTO_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds the {MAX_PHOTO_SIZE // (1024*1024)}MB limit.",
        )

    # 2. Validate MIME Type (must be an image)
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only image files are allowed.",
        )

    # 3. Validate notes length
    clean_notes: Optional[str] = None
    if notes is not None:
        clean_notes = notes.strip()
        if len(clean_notes) > MAX_NOTES_LENGTH:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Notes must be {MAX_NOTES_LENGTH} characters or fewer.",
            )
        if not clean_notes:
            clean_notes = None

    # 3. Determine Extension and generate Unique Filename
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        ext = ".jpg"  # Default fallback

    filename = f"{uuid.uuid4().hex}{ext}"
    os.makedirs(STORAGE_DIR, exist_ok=True)
    file_path = os.path.join(STORAGE_DIR, filename)

    # 4. Save to disk (outside of statically served directories)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to store the photo file.",
        )

    entry = Entry(
        thread_id=thread_id,
        author_id=current_user.id,
        entry_type="photo",
        media_key=filename,  # Stored filename, not a public URL
        theme=theme,
        notes=clean_notes,
    )
    _update_streak(db, current_user)
    db.add(entry)
    db.commit()

    # 6. Create the optional per-entry lock (parse form fields)
    if lock_type in ("passcode", "riddle"):
        try:
            lock_payload = LockCreate(
                lock_type=lock_type,
                passcode=lock_passcode,
                riddle_question=lock_riddle_question,
                riddle_answer=lock_riddle_answer,
            )
            _create_entry_lock(db, entry.id, lock_payload)
        except Exception:
            # Lock creation is optional; don't fail the photo upload if lock params are invalid
            pass

    return _build_entry_metadata(
        db=db,
        entry_id=entry.id,
        entry_thread_id=entry.thread_id,
        entry_author_id=entry.author_id,
        entry_type=entry.entry_type,
        entry_created_at=entry.created_at,
        current_user_id=current_user.id,
        theme=entry.theme,
    )


# ---------------------------------------------------------------------------
# POST /threads/{id}/entries/video — upload a video entry + optional lock
# ---------------------------------------------------------------------------


@router.post(
    "/{thread_id}/entries/video",
    response_model=EntryMetadata,
    status_code=status.HTTP_201_CREATED,
)
def post_video(
    thread_id: int,
    file: UploadFile = File(...),
    lock_type: Optional[str] = Form(default=None),
    lock_passcode: Optional[str] = Form(default=None),
    lock_riddle_question: Optional[str] = Form(default=None),
    lock_riddle_answer: Optional[str] = Form(default=None),
    theme: Optional[str] = Form(default="classic"),
    notes: Optional[str] = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload a video entry.  Enforces:
      - MAX_VIDEO_SIZE (50 MB)
      - Strict MIME type check (video/webm | video/mp4 | video/quicktime only)
      - Same lock/unlock gating as photo entries
      - Optional notes caption (≤ MAX_NOTES_LENGTH chars), gated with content
    """
    _get_thread_or_404(thread_id, db)
    _assert_member(thread_id, current_user.id, db)

    # 1. Validate file size (≤ 50MB)
    size = getattr(file, "size", None)
    if size is None:
        file.file.seek(0, 2)
        size = file.file.tell()
        file.file.seek(0)

    if size > MAX_VIDEO_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Video file size exceeds the {MAX_VIDEO_SIZE // (1024*1024)}MB limit.",
        )

    # 2. Strict MIME type check — not just by extension
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type not in ALLOWED_VIDEO_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid video type '{content_type}'. "
                "Allowed: video/webm, video/mp4, video/quicktime."
            ),
        )

    # 3. Validate notes length
    clean_notes: Optional[str] = None
    if notes is not None:
        clean_notes = notes.strip()
        if len(clean_notes) > MAX_NOTES_LENGTH:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Notes must be {MAX_NOTES_LENGTH} characters or fewer.",
            )
        if not clean_notes:
            clean_notes = None

    # 4. Determine extension and generate unique filename
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in [".webm", ".mp4", ".mov"]:
        # Derive from MIME type as fallback
        ext = {
            "video/webm": ".webm",
            "video/mp4": ".mp4",
            "video/quicktime": ".mov",
        }.get(content_type, ".webm")

    filename = f"{uuid.uuid4().hex}{ext}"
    os.makedirs(VIDEO_STORAGE_DIR, exist_ok=True)
    file_path = os.path.join(VIDEO_STORAGE_DIR, filename)

    # 5. Save to disk
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to store the video file.",
        )

    entry = Entry(
        thread_id=thread_id,
        author_id=current_user.id,
        entry_type="video",
        media_key=filename,
        theme=theme,
        notes=clean_notes,
    )
    _update_streak(db, current_user)
    db.add(entry)
    db.commit()

    # 6. Optional per-entry lock
    if lock_type in ("passcode", "riddle"):
        try:
            lock_payload = LockCreate(
                lock_type=lock_type,
                passcode=lock_passcode,
                riddle_question=lock_riddle_question,
                riddle_answer=lock_riddle_answer,
            )
            _create_entry_lock(db, entry.id, lock_payload)
        except Exception:
            pass

    return _build_entry_metadata(
        db=db,
        entry_id=entry.id,
        entry_thread_id=entry.thread_id,
        entry_author_id=entry.author_id,
        entry_type=entry.entry_type,
        entry_created_at=entry.created_at,
        current_user_id=current_user.id,
        theme=entry.theme,
    )
