import sqlite3
from pathlib import Path

from ai_anime.modules.model_usage.infrastructure import (
    audio_request_usage,
    image_request_usage,
    video_request_usage,
)
from ai_anime.shared.utils import project_paths
from ai_anime.shared.utils.project_paths import ProjectPaths


def test_image_and_video_usage_share_project_database_path(
    monkeypatch,
    tmp_path: Path,
) -> None:
    output_root = tmp_path / "output"
    state_root = tmp_path / "state"
    nested_output = output_root / "alice" / "demo" / "videos" / "ep001"
    nested_output.mkdir(parents=True)
    monkeypatch.setattr(project_paths, "OUTPUT_DIR", output_root)
    monkeypatch.setattr(project_paths, "STATE_DIR", state_root)
    monkeypatch.setattr(
        ProjectPaths,
        "bootstrap_from_legacy_output",
        lambda _self: False,
    )

    expected = (state_root / "alice" / "demo" / "data.db").resolve()
    assert image_request_usage.get_image_request_usage_db_path(nested_output) == expected
    assert video_request_usage.get_video_request_usage_db_path(nested_output) == expected
    assert audio_request_usage.get_audio_request_usage_db_path(nested_output) == expected


def test_audio_usage_path_bootstraps_legacy_project_database(
    monkeypatch,
    tmp_path: Path,
) -> None:
    output_root = tmp_path / "output"
    state_root = tmp_path / "state"
    runtime_root = tmp_path / "runtime"
    project_output = output_root / "alice" / "legacy-demo"
    legacy_db = project_output / "data.db"
    legacy_db.parent.mkdir(parents=True)
    with sqlite3.connect(legacy_db) as connection:
        connection.execute("CREATE TABLE legacy_facts (value TEXT NOT NULL)")
        connection.execute("INSERT INTO legacy_facts VALUES ('preserved')")

    monkeypatch.setattr(project_paths, "OUTPUT_DIR", output_root)
    monkeypatch.setattr(project_paths, "STATE_DIR", state_root)
    monkeypatch.setattr(project_paths, "RUNTIME_DIR", runtime_root)

    resolved = audio_request_usage.get_audio_request_usage_db_path(project_output)

    assert resolved == (state_root / "alice" / "legacy-demo" / "data.db").resolve()
    with sqlite3.connect(resolved) as connection:
        assert connection.execute("SELECT value FROM legacy_facts").fetchone() == (
            "preserved",
        )
    assert (resolved.parent / ".migrated").is_file()
