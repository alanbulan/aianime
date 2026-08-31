import hashlib
import sqlite3


def test_generic_voice_migration_discards_provider_specific_records(tmp_path):
    from ai_anime.modules.production.infrastructure.video_voice_records import (
        get_video_voice_audio_record,
    )

    db_path = tmp_path / "state" / "data.db"
    db_path.parent.mkdir(parents=True)
    with sqlite3.connect(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE seedance2_voice_audio_records (
                episode_number INTEGER NOT NULL,
                beat_number INTEGER NOT NULL,
                speaker TEXT NOT NULL,
                audio_path TEXT NOT NULL,
                voice_sha256 TEXT NOT NULL,
                text_sha256 TEXT NOT NULL DEFAULT '',
                mode TEXT NOT NULL,
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                generated_at TEXT NOT NULL,
                status TEXT NOT NULL,
                error TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (episode_number, beat_number, speaker)
            );
            CREATE TABLE schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE ai_anime_schema_components (
                component TEXT PRIMARY KEY,
                version INTEGER NOT NULL
            );
            INSERT INTO ai_anime_schema_components VALUES ('production', 2);
            INSERT INTO schema_migrations(version)
            VALUES ('20260823_000_initial_seedance_voice_records');
            INSERT INTO schema_migrations(version)
            VALUES ('20260823_001_seedance_voice_text_hash');
            INSERT INTO seedance2_voice_audio_records VALUES (
                1, 1, 'narrator', 'old.mp3', 'voice', 'text', 'old',
                'provider-a', 'speech-model-a', '2026-08-31', 'completed', ''
            );
            """
        )

    assert get_video_voice_audio_record(
        db_path=db_path,
        episode_number=1,
        beat_number=1,
        speaker="narrator",
    ) is None
    with sqlite3.connect(db_path) as conn:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
    assert "video_voice_audio_records" in tables
    assert "seedance2_voice_audio_records" not in tables


def test_voice_audio_record_upsert_and_lookup(tmp_path):
    from ai_anime.modules.production.infrastructure.video_voice_records import (
        get_video_voice_audio_record,
        upsert_video_voice_audio_record,
    )

    db_path = tmp_path / "state" / "data.db"
    audio_path = tmp_path / "project" / "audio" / "ep001" / "beat_03.mp3"
    audio_path.parent.mkdir(parents=True)
    audio_path.write_bytes(b"audio")

    upsert_video_voice_audio_record(
        db_path=db_path,
        episode_number=1,
        beat_number=3,
        speaker="谢铮_幼年时期",
        audio_path=audio_path,
        voice_sha256="abc123",
        mode="missing_only",
        provider="provider-a",
        model="speech-model-a",
        status="completed",
        error="",
    )

    record = get_video_voice_audio_record(
        db_path=db_path,
        episode_number=1,
        beat_number=3,
        speaker="谢铮_幼年时期",
    )

    assert record is not None
    assert record.voice_sha256 == "abc123"
    assert record.mode == "missing_only"
    assert record.status == "completed"


def test_classify_video_voice_audio_states(tmp_path):
    from ai_anime.modules.production.infrastructure.video_voice_records import (
        classify_video_voice_audio,
        upsert_video_voice_audio_record,
    )

    db_path = tmp_path / "state" / "data.db"
    project_dir = tmp_path / "project"
    missing_path = project_dir / "audio" / "ep001" / "beat_01.mp3"
    unknown_path = project_dir / "audio" / "ep001" / "beat_02.mp3"
    stale_path = project_dir / "audio" / "ep001" / "beat_03.mp3"
    current_path = project_dir / "audio" / "ep001" / "beat_04.mp3"
    for path in [unknown_path, stale_path, current_path]:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"audio")

    upsert_video_voice_audio_record(
        db_path=db_path,
        episode_number=1,
        beat_number=3,
        speaker="谢铮_幼年时期",
        audio_path=stale_path,
        voice_sha256="old",
        mode="redo_all",
        provider="provider-a",
        model="speech-model-a",
        status="completed",
        error="",
    )
    upsert_video_voice_audio_record(
        db_path=db_path,
        episode_number=1,
        beat_number=4,
        speaker="谢铮_幼年时期",
        audio_path=current_path,
        voice_sha256="new",
        mode="redo_all",
        provider="provider-a",
        model="speech-model-a",
        status="completed",
        error="",
    )

    assert classify_video_voice_audio(
        db_path=db_path,
        episode_number=1,
        beat_number=1,
        speaker="谢铮_幼年时期",
        audio_path=missing_path,
        current_voice_sha256="new",
    ).state == "missing"
    assert classify_video_voice_audio(
        db_path=db_path,
        episode_number=1,
        beat_number=2,
        speaker="谢铮_幼年时期",
        audio_path=unknown_path,
        current_voice_sha256="new",
    ).state == "unknown"
    assert classify_video_voice_audio(
        db_path=db_path,
        episode_number=1,
        beat_number=3,
        speaker="谢铮_幼年时期",
        audio_path=stale_path,
        current_voice_sha256="new",
    ).state == "stale"
    assert classify_video_voice_audio(
        db_path=db_path,
        episode_number=1,
        beat_number=4,
        speaker="谢铮_幼年时期",
        audio_path=current_path,
        current_voice_sha256="new",
    ).state == "current"


def test_classify_video_voice_audio_marks_text_hash_changes_stale(tmp_path):
    from ai_anime.modules.production.infrastructure.video_voice_records import (
        classify_video_voice_audio,
        upsert_video_voice_audio_record,
    )

    db_path = tmp_path / "state" / "data.db"
    audio_path = tmp_path / "project" / "audio" / "ep001" / "beat_05.mp3"
    audio_path.parent.mkdir(parents=True)
    audio_path.write_bytes(b"audio")
    old_text_hash = hashlib.sha256("旧台词".encode("utf-8")).hexdigest()
    new_text_hash = hashlib.sha256("新台词".encode("utf-8")).hexdigest()

    upsert_video_voice_audio_record(
        db_path=db_path,
        episode_number=1,
        beat_number=5,
        speaker="谢铮_幼年时期",
        audio_path=audio_path,
        voice_sha256="voice",
        text_sha256=old_text_hash,
        mode="sync_changed",
        provider="provider-a",
        model="speech-model-a",
        status="completed",
        error="",
    )

    assert classify_video_voice_audio(
        db_path=db_path,
        episode_number=1,
        beat_number=5,
        speaker="谢铮_幼年时期",
        audio_path=audio_path,
        current_voice_sha256="voice",
        current_text_sha256=old_text_hash,
    ).state == "current"
    assert classify_video_voice_audio(
        db_path=db_path,
        episode_number=1,
        beat_number=5,
        speaker="谢铮_幼年时期",
        audio_path=audio_path,
        current_voice_sha256="voice",
        current_text_sha256=new_text_hash,
    ).state == "stale"


def test_audio_scope_attempt_count_tracks_task_starts(tmp_path):
    from ai_anime.modules.model_usage.public import (
        count_audio_scope_attempts,
        record_audio_generation_attempt,
        update_audio_generation_attempt,
    )

    project_output_dir = tmp_path / "output" / "admin" / "demo"

    assert count_audio_scope_attempts(
        project_output_dir=project_output_dir,
        task_type="video_reference_voice_audio",
        scope="ep001:谢铮_幼年时期",
        episode=1,
    ) == 0

    record_audio_generation_attempt(
        project_output_dir=project_output_dir,
        request_id="attempt-1",
        provider="provider-a",
        model_name="speech-model-a",
        task_type="video_reference_voice_audio",
        scope="ep001:谢铮_幼年时期",
        episode=1,
        speaker="谢铮_幼年时期",
    )
    update_audio_generation_attempt(
        project_output_dir=project_output_dir,
        request_id="attempt-1",
        status="completed",
    )

    assert count_audio_scope_attempts(
        project_output_dir=project_output_dir,
        task_type="video_reference_voice_audio",
        scope="ep001:谢铮_幼年时期",
        episode=1,
    ) == 1
