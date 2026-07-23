from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.lock import SiteConfig
from app.models.user import User
from app.schemas import SiteConfigResponse, SiteConfigUpdate

router = APIRouter(prefix="/site", tags=["site"])


# ---------------------------------------------------------------------------
# Dependency — admin guard
# ---------------------------------------------------------------------------


def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """Dependency: raises 403 if the authenticated user is not an admin."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return current_user


def _get_config(db: Session) -> SiteConfig:
    cfg = db.query(SiteConfig).filter(SiteConfig.id == 1).first()
    if cfg is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Site config not found. Run migrations.",
        )
    return cfg


# ---------------------------------------------------------------------------
# GET /site/config — public
# ---------------------------------------------------------------------------


@router.get("/config", response_model=SiteConfigResponse)
def get_site_config(db: Session = Depends(get_db)):
    """
    Returns the global unlock date and current server time.
    The frontend MUST use server_time (not Date.now()) to compute the countdown
    offset — client clocks can be wrong.
    """
    cfg = _get_config(db)
    return SiteConfigResponse(
        unlock_date=cfg.unlock_date,
        server_time=datetime.now(timezone.utc),
    )


# ---------------------------------------------------------------------------
# PATCH /site/config — admin only
# ---------------------------------------------------------------------------


@router.patch("/config", response_model=SiteConfigResponse)
def update_site_config(
    payload: SiteConfigUpdate,
    _admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """
    Update the global unlock date.  Requires is_admin=true on the user.
    To promote a user to admin, run:
        UPDATE users SET is_admin = true WHERE username = 'your_username';
    """
    cfg = _get_config(db)
    new_date = payload.unlock_date
    if new_date.tzinfo is None:
        new_date = new_date.replace(tzinfo=timezone.utc)
    else:
        new_date = new_date.astimezone(timezone.utc)
    cfg.unlock_date = new_date
    db.commit()
    db.refresh(cfg)
    return SiteConfigResponse(
        unlock_date=cfg.unlock_date,
        server_time=datetime.now(timezone.utc),
    )
