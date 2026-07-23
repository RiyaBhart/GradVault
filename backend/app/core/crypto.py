from cryptography.fernet import Fernet
from app.core.config import settings

_fernet = Fernet(settings.letter_encryption_key.encode("utf-8"))

def encrypt_content(content: str | None) -> str | None:
    if not content:
        return content
    return _fernet.encrypt(content.encode("utf-8")).decode("utf-8")

def decrypt_content(encrypted_content: str | None) -> str | None:
    if not encrypted_content:
        return encrypted_content
    try:
        return _fernet.decrypt(encrypted_content.encode("utf-8")).decode("utf-8")
    except Exception:
        # Fallback to plain text if not encrypted
        return encrypted_content
