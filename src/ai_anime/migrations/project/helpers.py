"""Helpers shared by project SQLite migration scripts."""

from __future__ import annotations

import logging
import sqlite3

import aiosqlite

logger = logging.getLogger(__name__)


async def table_columns(
    db: aiosqlite.Connection,
    table: str,
) -> set[str]:
    async with db.execute(f"PRAGMA table_info({table})") as cursor:
        rows = await cursor.fetchall()
    return {str(row["name"]) for row in rows}


async def add_column_if_missing(
    db: aiosqlite.Connection,
    table: str,
    name: str,
    definition: str,
) -> None:
    if name in await table_columns(db, table):
        return
    try:
        await db.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")
    except sqlite3.OperationalError as exc:
        if "duplicate column name" not in str(exc).lower():
            raise
        if name not in await table_columns(db, table):
            raise
        logger.debug("SQLite column already added concurrently: %s.%s", table, name)


__all__ = ["add_column_if_missing", "table_columns"]
