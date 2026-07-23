import os
from typing import Optional

from app.core.config import settings

# Attempt to initialize Supabase client if credentials are environment configured
_supabase_client = None

if settings.supabase_url and settings.supabase_service_role_key:
    try:
        from supabase import create_client
        _supabase_client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key
        )
    except Exception as e:
        print(f"[Storage] Warning: Failed to initialize Supabase client: {e}")


def get_bucket_name() -> str:
    return settings.supabase_bucket or "gradvault-media"


def upload_media(path: str, content: bytes, content_type: str) -> str:
    """
    Upload media bytes to Supabase Storage bucket (or local disk fallback).
    
    :param path: Namespaced storage path, e.g. '1/42/ab12cd34.jpg'
    :param content: Raw file bytes
    :param content_type: MIME type string, e.g. 'image/jpeg' or 'video/mp4'
    :return: The media_key string (storage object path)
    """
    bucket_name = get_bucket_name()

    if _supabase_client:
        # Upload to Supabase Storage bucket (upsert=True allows overwrite if path exists)
        _supabase_client.storage.from_(bucket_name).upload(
            path=path,
            file=content,
            file_options={"content-type": content_type, "upsert": "true"}
        )
        return path
    else:
        # Fallback to local disk storage for dev/testing when Supabase creds are absent
        base_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..", "storage")
        )
        file_path = os.path.join(base_dir, path)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "wb") as f:
            f.write(content)
        return path


def download_media(path: str) -> bytes:
    """
    Fetch file bytes from Supabase Storage (or local disk fallback).
    
    :param path: The media_key storage object path
    :return: Raw file bytes
    """
    bucket_name = get_bucket_name()

    if _supabase_client:
        res = _supabase_client.storage.from_(bucket_name).download(path)
        return res
    else:
        # Fallback to local disk storage
        base_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..", "storage")
        )
        file_path = os.path.join(base_dir, path)
        # Also check photos/videos subfolders for legacy paths
        if not os.path.isfile(file_path):
            legacy_photo = os.path.join(base_dir, "photos", path)
            legacy_video = os.path.join(base_dir, "videos", path)
            if os.path.isfile(legacy_photo):
                file_path = legacy_photo
            elif os.path.isfile(legacy_video):
                file_path = legacy_video

        if not os.path.isfile(file_path):
            raise FileNotFoundError(f"Media file not found at path: {path}")

        with open(file_path, "rb") as f:
            return f.read()


def delete_media(path: str) -> bool:
    """
    Remove object from Supabase Storage (or local disk fallback).
    
    :param path: The media_key storage object path
    :return: True if deleted successfully
    """
    bucket_name = get_bucket_name()

    if _supabase_client:
        try:
            _supabase_client.storage.from_(bucket_name).remove([path])
            return True
        except Exception as e:
            print(f"[Storage] Warning: Failed to delete object '{path}' from Supabase: {e}")
            return False
    else:
        # Fallback to local disk deletion
        base_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..", "storage")
        )
        file_path = os.path.join(base_dir, path)
        if os.path.isfile(file_path):
            try:
                os.remove(file_path)
                return True
            except OSError:
                return False
        return True
