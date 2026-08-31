"""Project media schema bootstrap tests."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest


def _columns(db_path: str | Path, table: str) -> set[str]:
    with sqlite3.connect(str(db_path)) as conn:
        return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


def _tables(db_path: str | Path) -> set[str]:
    with sqlite3.connect(str(db_path)) as conn:
        return {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }


@pytest.fixture
async def initialized_store(tmp_path):
    from ai_anime.sqlite_store import SQLiteStore

    output_dir = tmp_path / "output"
    state_dir = tmp_path / "state"
    output_dir.mkdir()
    state_dir.mkdir()
    store = SQLiteStore(
        "testuser/testproj_speech_synthesis",
        output_dir=str(output_dir),
        state_dir=str(state_dir),
    )
    await store.initialize()
    try:
        yield store
    finally:
        await store.close()


@pytest.mark.asyncio
async def test_video_voice_audio_records_table_created(initialized_store):
    from ai_anime.modules.production.infrastructure.video_voice_records import (
        get_video_voice_audio_record,
    )

    assert get_video_voice_audio_record(
        db_path=initialized_store.db_path,
        episode_number=1,
        beat_number=1,
        speaker="narrator",
    ) is None
    cols = _columns(initialized_store.db_path, "video_voice_audio_records")
    assert {
        "episode_number",
        "beat_number",
        "speaker",
        "audio_path",
        "voice_sha256",
        "text_sha256",
        "mode",
        "provider",
        "model",
        "generated_at",
        "status",
        "error",
    } <= cols


@pytest.mark.asyncio
async def test_beats_video_config_column_added(initialized_store):
    cols = _columns(initialized_store.db_path, "beats")
    assert "video_config_json" in cols


@pytest.mark.asyncio
async def test_audio_type_migration_rewrites_noncanonical_values(tmp_path):
    import aiosqlite

    from ai_anime.migrations.project.versions.v20260831_001_canonical_audio_types import (
        apply,
    )

    db = await aiosqlite.connect(tmp_path / "chat.db")
    try:
        await db.execute(
            "CREATE TABLE beats (beat_number INTEGER, audio_type TEXT)"
        )
        await db.executemany(
            "INSERT INTO beats VALUES (?, ?)",
            [
                (1, "action"),
                (2, ""),
                (3, " DIALOGUE "),
                (4, "narration"),
            ],
        )

        await apply(db, tmp_path)
        async with db.execute(
            "SELECT beat_number, audio_type FROM beats ORDER BY beat_number"
        ) as cursor:
            rows = await cursor.fetchall()
    finally:
        await db.close()

    assert rows == [
        (1, "silence"),
        (2, "silence"),
        (3, "dialogue"),
        (4, "narration"),
    ]


@pytest.mark.asyncio
async def test_characters_voice_columns_added(initialized_store):
    cols = _columns(initialized_store.db_path, "characters")
    assert "fish_voice_id" not in cols
    assert "reference_audio_path" in cols
    assert "reference_audio_sha256" in cols
    assert "voice_samples_by_age_group_json" in cols


@pytest.mark.asyncio
async def test_provider_specific_voice_state_is_deleted(tmp_path):
    import aiosqlite

    from ai_anime.migrations.project.versions.v20260831_002_remove_provider_voice_state import (
        apply,
    )

    db = await aiosqlite.connect(tmp_path / "chat.db")
    try:
        await db.execute(
            """
            CREATE TABLE characters (
                name TEXT PRIMARY KEY,
                fish_voice_id TEXT DEFAULT '',
                identities_json TEXT DEFAULT '[]'
            )
            """
        )
        await db.execute(
            "INSERT INTO characters VALUES (?, ?, ?)",
            (
                "测试角色",
                "obsolete-provider-voice",
                '[{"identity_id":"测试角色_青年","fish_voice_id":"obsolete"}]',
            ),
        )

        await apply(db, tmp_path)

        async with db.execute("PRAGMA table_info(characters)") as cursor:
            columns = {str(row[1]) for row in await cursor.fetchall()}
        async with db.execute(
            "SELECT identities_json FROM characters WHERE name = ?",
            ("测试角色",),
        ) as cursor:
            row = await cursor.fetchone()
    finally:
        await db.close()

    assert "fish_voice_id" not in columns
    assert row is not None
    assert row[0] == "[]"


@pytest.mark.asyncio
async def test_idempotent_reinit_does_not_error(tmp_path):
    """Re-initializing on an existing DB must not raise (additive ALTER guard)."""
    from ai_anime.modules.production.infrastructure.video_voice_records import (
        get_video_voice_audio_record,
    )
    from ai_anime.sqlite_store import SQLiteStore

    output_dir = tmp_path / "output"
    state_dir = tmp_path / "state"
    output_dir.mkdir()
    state_dir.mkdir()

    store1 = SQLiteStore(
        "testuser/idempotent",
        output_dir=str(output_dir),
        state_dir=str(state_dir),
    )
    await store1.initialize()
    db_path = store1.db_path
    get_video_voice_audio_record(
        db_path=db_path,
        episode_number=1,
        beat_number=1,
        speaker="narrator",
    )
    await store1.close()

    store2 = SQLiteStore(
        "testuser/idempotent",
        output_dir=str(output_dir),
        state_dir=str(state_dir),
    )
    await store2.initialize()
    try:
        assert "video_voice_audio_records" in _tables(db_path)
    finally:
        await store2.close()


@pytest.mark.asyncio
async def test_add_column_if_missing_ignores_duplicate_column_race():
    """A concurrent store init can add a column after our table_info read."""
    from ai_anime.sqlite_store import _add_column_if_missing

    class FakeCursor:
        def __init__(self, rows):
            self._rows = rows

        async def fetchall(self):
            return self._rows

    class FakeExecuteContext:
        def __init__(self, cursor):
            self._cursor = cursor

        async def __aenter__(self):
            return self._cursor

        async def __aexit__(self, exc_type, exc, tb):
            return False

    class FakeDb:
        def __init__(self):
            self.table_info_calls = 0
            self.alter_calls = 0

        def execute(self, sql):
            if sql.startswith("PRAGMA table_info(characters)"):
                self.table_info_calls += 1
                rows = [{"name": "id"}]
                if self.table_info_calls > 1:
                    rows.append({"name": "voice_samples_by_age_group_json"})
                return FakeExecuteContext(FakeCursor(rows))

            if sql.startswith("ALTER TABLE characters ADD COLUMN"):
                self.alter_calls += 1
                raise sqlite3.OperationalError(
                    "duplicate column name: voice_samples_by_age_group_json"
                )

            raise AssertionError(f"unexpected SQL: {sql}")

    db = FakeDb()

    await _add_column_if_missing(
        db,
        "characters",
        "voice_samples_by_age_group_json",
        "TEXT DEFAULT '{}'",
    )

    assert db.alter_calls == 1


def test_character_voice_field_defaults_match_pydantic():
    """NovelCharacter / CharacterIdentity expose the canonical voice fields."""
    from ai_anime.modules.asset_world.public import CharacterIdentity, NovelCharacter

    char = NovelCharacter(name="测试角色")
    assert char.reference_audio_path == ""
    assert char.reference_audio_sha256 == ""
    assert char.voice_samples_by_age_group_json == "{}"
    assert char.voice_samples_by_age_group == {}

    char.voice_samples_by_age_group = {
        "youth": {"path": "x.mp3", "sha256": "abc", "updated_at": "now"},
    }
    assert "x.mp3" in char.voice_samples_by_age_group_json
    assert char.voice_samples_by_age_group["youth"]["sha256"] == "abc"

    identity = CharacterIdentity(
        identity_id="测试_皇帝",
        character_name="测试",
        identity_name="皇帝",
    )
    assert identity.reference_audio_path == ""
    assert identity.reference_audio_sha256 == ""


def test_novel_visual_beat_video_config_default():
    from ai_anime.modules.narrative_planning.public import NovelVisualBeat

    beat = NovelVisualBeat(beat_number=1, episode_number=1, narration="x", visual_description="y")
    assert beat.video_config_json == "{}"
