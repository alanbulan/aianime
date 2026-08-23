"""Compatibility export for the project schema owned by migrations."""

from ai_anime.migrations.project.versions.v00000000_000_initial_schema import (
    SCHEMA_SQL,
)

SQLITE_SCHEMA_SQL = SCHEMA_SQL

__all__ = ["SQLITE_SCHEMA_SQL"]
