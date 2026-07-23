"""remove_theme

Revision ID: f61e66d8d4a3
Revises: a1b2c3d4e5f6
Create Date: 2026-07-21 02:02:04.813963

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f61e66d8d4a3'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('entries', 'theme')


def downgrade() -> None:
    op.add_column('entries', sa.Column('theme', sa.String(), nullable=True))
