"""Cross-platform file-lock regression tests."""

from __future__ import annotations

from ai_anime.modules.project_workspace.infrastructure import project_config
from ai_anime.shared.utils import state_index_files


def test_state_index_lock_always_uses_portalocker(monkeypatch, tmp_path):
    calls: list[tuple[str, object]] = []
    monkeypatch.setattr(
        state_index_files.portalocker,
        "lock",
        lambda _file, mode: calls.append(("lock", mode)),
    )
    monkeypatch.setattr(
        state_index_files.portalocker,
        "unlock",
        lambda _file: calls.append(("unlock", None)),
    )

    with state_index_files.index_file_lock(tmp_path / "pool.json"):
        calls.append(("body", None))

    assert calls == [
        ("lock", state_index_files.portalocker.LOCK_EX),
        ("body", None),
        ("unlock", None),
    ]


def test_project_config_lock_always_uses_portalocker(monkeypatch, tmp_path):
    calls: list[tuple[str, object]] = []
    monkeypatch.setattr(
        project_config.portalocker,
        "lock",
        lambda _file, mode: calls.append(("lock", mode)),
    )
    monkeypatch.setattr(
        project_config.portalocker,
        "unlock",
        lambda _file: calls.append(("unlock", None)),
    )

    with project_config._project_config_lock(tmp_path / "project_config.json"):
        calls.append(("body", None))

    assert calls == [
        ("lock", project_config.portalocker.LOCK_EX),
        ("body", None),
        ("unlock", None),
    ]
