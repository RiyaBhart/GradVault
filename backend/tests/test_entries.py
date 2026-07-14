from datetime import datetime, timezone, timedelta
import bcrypt
from app.models.entry import Entry
from app.models.lock import SiteConfig, EntryLock, EntryUnlock

def test_global_gate_blocks_future(client, db_session, test_user, test_thread, auth_headers):
    # Set site unlock date to tomorrow
    cfg = db_session.query(SiteConfig).first()
    cfg.unlock_date = datetime.now(timezone.utc) + timedelta(days=1)
    db_session.commit()

    # Create an entry
    entry = Entry(
        thread_id=test_thread.id,
        author_id=test_user.id,
        entry_type="letter",
        text_content="Hello future!",
        theme="classic"
    )
    db_session.add(entry)
    db_session.commit()
    
    # Automatically add unlock so it would pass per-user lock if not for global gate
    db_session.add(EntryUnlock(entry_id=entry.id, user_id=test_user.id))
    db_session.commit()

    response = client.get(f"/entries/{entry.id}/content", headers=auth_headers)
    assert response.status_code == 403
    assert response.json()["detail"] == "This content is not yet available."

def test_global_gate_passes_past(client, db_session, test_user, test_thread, auth_headers):
    # Site unlock date is yesterday (from conftest)
    
    entry = Entry(
        thread_id=test_thread.id,
        author_id=test_user.id,
        entry_type="letter",
        text_content="Hello past!",
        theme="classic"
    )
    db_session.add(entry)
    db_session.commit()

    # Automatically add unlock for per-user
    db_session.add(EntryUnlock(entry_id=entry.id, user_id=test_user.id))
    db_session.commit()

    response = client.get(f"/entries/{entry.id}/content", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["text_content"] == "Hello past!"

def test_per_user_lock_blocks(client, db_session, test_user, test_thread, auth_headers):
    entry = Entry(
        thread_id=test_thread.id,
        author_id=test_user.id,
        entry_type="letter",
        text_content="Secret message",
        theme="classic"
    )
    db_session.add(entry)
    db_session.commit()
    
    # Add passcode lock
    lock = EntryLock(
        entry_id=entry.id,
        lock_type="passcode",
        passcode_hash=bcrypt.hashpw(b"1234", bcrypt.gensalt()).decode()
    )
    db_session.add(lock)
    db_session.commit()

    # Try to access without unlocking
    response = client.get(f"/entries/{entry.id}/content", headers=auth_headers)
    assert response.status_code == 403
    assert response.json()["detail"] == "Entry not unlocked."

def test_per_user_lock_unlocks_with_passcode(client, db_session, test_user, test_thread, auth_headers):
    entry = Entry(
        thread_id=test_thread.id,
        author_id=test_user.id,
        entry_type="letter",
        text_content="Secret message",
        theme="classic"
    )
    db_session.add(entry)
    db_session.commit()
    
    # Add passcode lock
    lock = EntryLock(
        entry_id=entry.id,
        lock_type="passcode",
        passcode_hash=bcrypt.hashpw(b"1234", bcrypt.gensalt()).decode()
    )
    db_session.add(lock)
    db_session.commit()

    # Try to unlock with wrong passcode
    response = client.post(
        f"/entries/{entry.id}/unlock", 
        json={"guess": "0000"},
        headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["success"] == False
    
    # Try to unlock with correct passcode
    response = client.post(
        f"/entries/{entry.id}/unlock", 
        json={"guess": "1234"},
        headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["success"] == True

    # Now we should be able to access the content
    response = client.get(f"/entries/{entry.id}/content", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["text_content"] == "Secret message"

def test_per_user_lock_unlocks_with_riddle(client, db_session, test_user, test_thread, auth_headers):
    entry = Entry(
        thread_id=test_thread.id,
        author_id=test_user.id,
        entry_type="letter",
        text_content="Secret message",
        theme="classic"
    )
    db_session.add(entry)
    db_session.commit()
    
    # Add riddle lock
    lock = EntryLock(
        entry_id=entry.id,
        lock_type="riddle",
        riddle_question="What goes up but never comes down?",
        riddle_answer_hash="plain:age" # backend logic normalizes to lower and strips spaces
    )
    db_session.add(lock)
    db_session.commit()

    # Try to unlock with correct riddle (fuzzy match check)
    response = client.post(
        f"/entries/{entry.id}/unlock", 
        json={"guess": "Age!"},
        headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["success"] == True

    # Access content
    response = client.get(f"/entries/{entry.id}/content", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["text_content"] == "Secret message"
