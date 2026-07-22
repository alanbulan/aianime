from __future__ import annotations

from pathlib import Path


def test_non_ui_code_does_not_import_character_map_from_nicegui() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    checked_roots = [
        repo_root / "src" / "ai_anime" / "agents",
        repo_root / "src" / "ai_anime" / "api",
        repo_root / "src" / "ai_anime" / "director_world",
        repo_root / "src" / "ai_anime" / "freezone",
    ]
    forbidden = (
        "ai_anime.ui.nicegui_pages.video_studio.generation "
        "import build_character_map_for_grid"
    )

    offenders: list[str] = []
    for root in checked_roots:
        for path in root.rglob("*.py"):
            if forbidden in path.read_text(encoding="utf-8"):
                offenders.append(str(path.relative_to(repo_root)))

    assert offenders == []


def test_non_ui_code_does_not_import_nicegui_pages() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    checked_roots = [
        repo_root / "src" / "ai_anime" / "agents",
        repo_root / "src" / "ai_anime" / "api",
        repo_root / "src" / "ai_anime" / "director_world",
        repo_root / "src" / "ai_anime" / "freezone",
        repo_root / "src" / "ai_anime" / "generators",
    ]
    forbidden = "ai_anime.ui.nicegui_pages"

    offenders: list[str] = []
    for root in checked_roots:
        for path in root.rglob("*.py"):
            if forbidden in path.read_text(encoding="utf-8"):
                offenders.append(str(path.relative_to(repo_root)))

    assert offenders == []


def test_backend_code_does_not_import_ui_package() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    checked_paths = [
        repo_root / "src" / "ai_anime" / "agents",
        repo_root / "src" / "ai_anime" / "api",
        repo_root / "src" / "ai_anime" / "chat",
        repo_root / "src" / "ai_anime" / "director_world",
        repo_root / "src" / "ai_anime" / "freezone",
        repo_root / "src" / "ai_anime" / "generators",
        repo_root / "src" / "ai_anime" / "services",
        repo_root / "src" / "ai_anime" / "ray_tasks.py",
    ]
    forbidden = "ai_anime.ui"

    offenders: list[str] = []
    for checked_path in checked_paths:
        paths = [checked_path] if checked_path.is_file() else checked_path.rglob("*.py")
        for path in paths:
            if forbidden in path.read_text(encoding="utf-8"):
                offenders.append(str(path.relative_to(repo_root)))

    assert offenders == []


def test_nicegui_is_not_in_main_package_or_dependencies() -> None:
    repo_root = Path(__file__).resolve().parents[1]

    assert not (repo_root / "src" / "ai_anime" / "ui" / "nicegui_pages").exists()
    ui_files = [
        path.relative_to(repo_root / "src" / "ai_anime" / "ui").as_posix()
        for path in (repo_root / "src" / "ai_anime" / "ui").rglob("*.py")
    ]
    assert ui_files == ["__init__.py"]

    pyproject = (repo_root / "pyproject.toml").read_text(encoding="utf-8")
    assert '"nicegui' not in pyproject

