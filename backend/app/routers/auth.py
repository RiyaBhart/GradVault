from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.database import get_db
from app.models.user import User
from app.schemas import LoginRequest, Token, UserCreate, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: UserCreate, db: Session = Depends(get_db)):
    """
    Create a new user account.
    - Username uniqueness is enforced at the DB level (unique constraint) and
      checked here first to return a friendly 409 rather than a raw DB error.
    - Password is hashed with bcrypt before storage; the plain-text value is
      discarded immediately after hashing.
    """
    existing = db.query(User).filter(User.username == payload.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken.",
        )

    user = User(
        username=payload.username,
        nickname=payload.nickname,
        avatar_sticker=payload.avatar_sticker,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """
    Verify credentials and return a short-lived JWT access token.
    We deliberately use the same 'Invalid credentials' message for both
    'user not found' and 'wrong password' to avoid username enumeration.
    """
    user = db.query(User).filter(User.username == payload.username.lower()).first()

    # Constant-time check: always call verify_password even if user is None
    # to prevent timing-based username enumeration.
    password_ok = verify_password(payload.password, user.password_hash) if user else False

    if not user or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(subject=user.username)
    return Token(access_token=token)
