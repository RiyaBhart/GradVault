import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, StaticPool
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timezone, timedelta
import bcrypt

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.main import app
from app.database import Base, get_db
from app.models.user import User
from app.models.thread import Thread, ThreadMember
from app.models.entry import Entry
from app.models.lock import SiteConfig, EntryLock, EntryUnlock
from app.core.security import create_access_token

# Use in-memory SQLite for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(scope="session")
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def db_session(setup_db):
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    
    # Setup base test data
    cfg = SiteConfig(id=1, unlock_date=datetime.now(timezone.utc) - timedelta(days=1))
    session.add(cfg)
    
    # Setup test user
    user = User(
        username="testuser",
        nickname="Test User",
        password_hash=bcrypt.hashpw(b"password", bcrypt.gensalt()).decode()
    )
    session.add(user)
    session.commit()
    
    # Setup thread
    thread = Thread(type="personal", title="Test Thread", created_by=user.id)
    session.add(thread)
    session.commit()
    
    # Add member
    member = ThreadMember(thread_id=thread.id, user_id=user.id)
    session.add(member)
    session.commit()

    yield session

    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def test_user(db_session):
    return db_session.query(User).filter(User.username == "testuser").first()

@pytest.fixture
def test_thread(db_session):
    return db_session.query(Thread).filter(Thread.title == "Test Thread").first()

@pytest.fixture
def auth_headers(test_user):
    token = create_access_token(subject=test_user.username)
    return {"Authorization": f"Bearer {token}"}
