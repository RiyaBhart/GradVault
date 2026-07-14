from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Signup
# ---------------------------------------------------------------------------


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_]+$")
    nickname: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=8, max_length=128)
    avatar_sticker: Optional[str] = Field(default="✉️", max_length=50)

    @field_validator("username")
    @classmethod
    def username_lowercase(cls, v: str) -> str:
        return v.lower()


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    username: str
    password: str


# ---------------------------------------------------------------------------
# Responses  — password_hash is deliberately absent
# ---------------------------------------------------------------------------


class UserResponse(BaseModel):
    id: int
    username: str
    nickname: str
    avatar_sticker: Optional[str]
    streak_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------------------------------------------------------------------------
# Site config
# ---------------------------------------------------------------------------


class SiteConfigResponse(BaseModel):
    unlock_date: datetime
    server_time: datetime


class SiteConfigUpdate(BaseModel):
    unlock_date: datetime


# ---------------------------------------------------------------------------
# Threads
# ---------------------------------------------------------------------------


class ThreadCreate(BaseModel):
    type: str = Field(..., pattern=r"^(pair|group)$")
    title: str = Field(..., min_length=1, max_length=200)


class ThreadResponse(BaseModel):
    id: int
    type: str
    title: str
    created_by: int
    created_at: datetime

    model_config = {"from_attributes": True}


class MemberResponse(BaseModel):
    user_id: int
    joined_at: datetime
    username: Optional[str] = None
    nickname: Optional[str] = None
    avatar_sticker: Optional[str] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Invites
# ---------------------------------------------------------------------------


class InviteCreate(BaseModel):
    expires_at: Optional[datetime] = None
    max_uses: Optional[int] = Field(default=None, ge=1)


class InviteResponse(BaseModel):
    id: int
    thread_id: int
    code: str
    created_by: int
    expires_at: Optional[datetime]
    max_uses: Optional[int]
    use_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Per-entry Lock
# ---------------------------------------------------------------------------


class LockCreate(BaseModel):
    """
    Sent by the author at entry creation time.
    Exactly one of: passcode (for 'passcode' type) or riddle_question +
    riddle_answer (for 'riddle' type) must be provided.
    """

    lock_type: Literal["passcode", "riddle"]
    passcode: Optional[str] = Field(default=None, min_length=1, max_length=128)
    riddle_question: Optional[str] = Field(default=None, min_length=1, max_length=500)
    riddle_answer: Optional[str] = Field(default=None, min_length=1, max_length=256)

    @model_validator(mode="after")
    def validate_lock_fields(self) -> "LockCreate":
        if self.lock_type == "passcode":
            if not self.passcode:
                raise ValueError("passcode is required for lock_type='passcode'")
        elif self.lock_type == "riddle":
            if not self.riddle_question:
                raise ValueError("riddle_question is required for lock_type='riddle'")
            if not self.riddle_answer:
                raise ValueError("riddle_answer is required for lock_type='riddle'")
        return self


# ---------------------------------------------------------------------------
# Entries — LOCKED
# text_content and media_key are deliberately ABSENT from this schema.
# No GET endpoint should ever return entry content. See Entry model docstring.
# ---------------------------------------------------------------------------


class LetterCreate(BaseModel):
    text_content: str = Field(..., min_length=1)
    lock: Optional[LockCreate] = None
    youtube_url: Optional[str] = Field(default=None, max_length=500)
    theme: Optional[str] = Field(default="classic", max_length=20)


class EntryMetadata(BaseModel):
    """
    Locked placeholder — content fields are intentionally excluded.
    `has_lock`        — whether the author set a passcode/riddle lock.
    `is_unlocked`     — whether the requesting user has already solved the lock.
    `lock_type`       — 'passcode' | 'riddle' | None (if no lock).
    `riddle_question` — only populated when lock_type == 'riddle', so the
                        viewer knows what to answer; the answer hash is never included.
    """

    id: int
    thread_id: int
    author_id: int
    entry_type: str
    created_at: datetime
    # Lock metadata — safe to expose; no secrets included
    has_lock: bool = False
    is_unlocked: bool = False
    lock_type: Optional[str] = None
    riddle_question: Optional[str] = None
    theme: str = "classic"

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Unlock attempt
# ---------------------------------------------------------------------------


class UnlockAttempt(BaseModel):
    guess: str = Field(..., min_length=1, max_length=512)


class UnlockResult(BaseModel):
    success: bool


# ---------------------------------------------------------------------------
# Content reveal — THE ONLY SCHEMA that carries actual entry content.
# Returned exclusively by GET /entries/{id}/content, which enforces both
# the global date gate and the per-user unlock record before responding.
# ---------------------------------------------------------------------------


class EntrySongOut(BaseModel):
    """
    Song metadata returned as part of LetterContent once all gates pass.
    Only a YouTube video reference — no audio/video bytes are stored.
    """

    youtube_video_id: str
    start_seconds: int
    volume: int

    model_config = {"from_attributes": True}


class LetterContent(BaseModel):
    entry_type: Literal["letter"]
    text_content: str
    theme: str
    song: Optional["EntrySongOut"] = None


# ---------------------------------------------------------------------------
# Thread detail (combined response for GET /threads/{id})
# ---------------------------------------------------------------------------


class ThreadDetail(BaseModel):
    thread: ThreadResponse
    members: List[MemberResponse]
    entries: List[EntryMetadata]
