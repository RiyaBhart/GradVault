from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.thread import ThreadInvite, ThreadMember
from app.models.user import User
from app.schemas import ThreadResponse

router = APIRouter(prefix="/invites", tags=["invites"])


# ---------------------------------------------------------------------------
# POST /invites/{code}/accept
# ---------------------------------------------------------------------------


@router.post("/{code}/accept", status_code=status.HTTP_200_OK)
def accept_invite(
    code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Validates the invite code and adds the current user as a thread member.

    Rules:
    - Code must exist.
    - Code must not be expired (if expires_at is set).
    - use_count must be below max_uses (if max_uses is set).
    - If the user is already a member, returns 200 silently (idempotent).
    """
    invite: ThreadInvite | None = (
        db.query(ThreadInvite).filter(ThreadInvite.code == code).first()
    )
    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invite code not found.",
        )

    # Expiry check
    if invite.expires_at and datetime.now(timezone.utc) > invite.expires_at:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This invite link has expired.",
        )

    # Max-uses check
    if invite.max_uses is not None and invite.use_count >= invite.max_uses:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This invite link has reached its maximum number of uses.",
        )

    # Idempotency — already a member
    existing = (
        db.query(ThreadMember)
        .filter(
            ThreadMember.thread_id == invite.thread_id,
            ThreadMember.user_id == current_user.id,
        )
        .first()
    )
    if existing:
        return {"thread_id": invite.thread_id, "already_member": True}

    # Add member
    member = ThreadMember(thread_id=invite.thread_id, user_id=current_user.id)
    db.add(member)
    invite.use_count += 1
    db.commit()

    return {"thread_id": invite.thread_id, "already_member": False}
