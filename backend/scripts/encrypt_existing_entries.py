from app.database import SessionLocal
from app.models.entry import Entry
from app.core.crypto import encrypt_content
from app.core.config import settings

def main():
    if not settings.letter_encryption_key or settings.letter_encryption_key == "YOUR_FERNET_KEY_HERE":
        print("ERROR: Invalid or missing LETTER_ENCRYPTION_KEY in environment variables.")
        return

    db = SessionLocal()
    try:
        entries = db.query(Entry).all()
        if not entries:
            print("No entries to encrypt.")
            return

        print(f"Found {len(entries)} entries. Starting encryption...")
        encrypted_count = 0
        for entry in entries:
            if entry.text_content and not entry.text_content.startswith('gAAAAA'):
                entry.text_content = encrypt_content(entry.text_content)
                encrypted_count += 1
            if entry.notes and not entry.notes.startswith('gAAAAA'):
                entry.notes = encrypt_content(entry.notes)
                encrypted_count += 1
        
        if encrypted_count > 0:
            db.commit()
            print(f"Successfully encrypted {encrypted_count} fields.")
        else:
            print("All fields seem to be encrypted already (or are empty).")

    finally:
        db.close()

if __name__ == "__main__":
    main()
