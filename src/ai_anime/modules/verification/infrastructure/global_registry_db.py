"""User-level shared `verification.db` — canonical source for failure defs.

Lives at `state/<user>/_shared/verification.db`. Holds only the
`sketch_failure_mode_defs` table — the knowledge layer of the director
OS. Project-local `data.db` stores only per-project hits and
convergence_rounds; mixing the two is forbidden by design (see
`plans/frolicking-hopping-karp.md` for the rationale).

`ensure_defs_seeded` refreshes the canonical rows from
`failure_registry._SEED_FAILURE_MODES` with UPSERT semantics so seed
edits ship with the next app start. Project-local historical rows are
not consulted from here; the one-shot `seed_mirror_once` CLI handles
that migration path separately.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import aiosqlite

from ai_anime.migrations.sqlite import ensure_sqlite_schema
from ai_anime.migrations.verification import (
    REGISTRY_MIGRATION_VERSION,
    run_verification_registry_migrations_sync,
)
from ai_anime.migrations.verification.versions.v20260823_000_initial_registry import (
    SCHEMA_SQL as _DEFS_SCHEMA_SQL,
)
from ai_anime.shared.infrastructure.sqlite_pragmas import (
    configure_sqlite_connection_async,
)

DEFS_SCHEMA_SQL = _DEFS_SCHEMA_SQL


def _ensure_defs_schema(db_path: Path) -> None:
    ensure_sqlite_schema(
        db_path,
        component="verification_registry",
        version=REGISTRY_MIGRATION_VERSION,
        initialize=run_verification_registry_migrations_sync,
    )


async def open_defs_db(db_path: Path) -> aiosqlite.Connection:
    """Open (or create) the shared verification DB.

    Ensures the parent directory exists and the schema is present.
    Callers are responsible for closing the connection.
    """
    db_path = Path(db_path).expanduser()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    await asyncio.to_thread(_ensure_defs_schema, db_path)
    db = await aiosqlite.connect(str(db_path), timeout=10)
    db.row_factory = aiosqlite.Row
    await configure_sqlite_connection_async(db, set_journal_mode=False)
    return db


async def ensure_defs_seeded(
    db: aiosqlite.Connection,
    seeds: list[dict[str, Any]],
) -> None:
    """Idempotently UPSERT the seed list into the defs table.

    Canonical descriptive columns (layer / detection / prevention_rule /
    correction_template / negative_prompt_clause / gate_enabled) always
    refresh from the seed so editing the seed list in code ships on
    next start. Timestamps bump; fixture_path is not touched once
    stored (fixtures are tracked separately).
    """
    for entry in seeds:
        await db.execute(
            """
            INSERT INTO sketch_failure_mode_defs (
                code, layer, detection, prevention_rule,
                correction_template, negative_prompt_clause,
                gate_enabled, fixture_path,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, '', datetime('now'), datetime('now'))
            ON CONFLICT(code) DO UPDATE SET
                layer = excluded.layer,
                detection = excluded.detection,
                prevention_rule = excluded.prevention_rule,
                correction_template = excluded.correction_template,
                negative_prompt_clause = excluded.negative_prompt_clause,
                gate_enabled = excluded.gate_enabled,
                updated_at = datetime('now')
            """,
            (
                entry["code"],
                entry["layer"],
                entry["detection"],
                entry.get("prevention_rule", ""),
                entry.get("correction_template", ""),
                entry.get("negative_prompt_clause", ""),
                int(entry.get("gate_enabled", 0)),
            ),
        )
    await db.commit()
