from app.models.user import User  # noqa: F401 — import all models so Alembic can see them
from app.models.thread import Thread, ThreadMember, ThreadInvite  # noqa: F401
from app.models.entry import Entry  # noqa: F401
from app.models.lock import SiteConfig, EntryLock, EntryUnlock  # noqa: F401
from app.models.entry_song import EntrySong  # noqa: F401
