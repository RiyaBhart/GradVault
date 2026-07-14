"""add notes column and video entry type support

Revision ID: a1b2c3d4e5f6
Revises: 03095ba431a8
Create Date: 2026-07-14

Adds:
  - entries.notes  — nullable TEXT, max 500 chars enforced at app layer
    Used as an optional caption on photo and video entries.
    Deliberately placed in the same security zone as text_content / media_key:
    it must NEVER appear in EntryMetadata or any list endpoint — only returned
    by GET /entries/{id}/content after both gates pass.

entry_type is already varchar(10) and 'video' fits within that length,
so no DDL change is needed for the type column itself.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "82fdce55bdb3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "entries",
        sa.Column("notes", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("entries", "notes")
