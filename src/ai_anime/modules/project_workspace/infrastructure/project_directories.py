"""Project directory initialization for local workspaces."""

from __future__ import annotations

import os

from ai_anime.shared.runtime_paths import OUTPUT_DIR


def ensure_project_dirs(project_name: str) -> dict[str, str]:
    """Ensure the legacy username/project output layout exists."""
    base_dir = os.path.abspath(os.path.join(OUTPUT_DIR, project_name))
    parts = project_name.split("/", 1)
    if len(parts) == 2:
        from ai_anime.shared.utils.project_paths import ProjectPaths

        paths = ProjectPaths(parts[0], parts[1])
        paths.ensure_dirs()
        paths.bootstrap_from_legacy_output()

    dirs = {
        "base": base_dir,
        "graph": os.path.join(base_dir, "graph"),
        "assets": os.path.join(base_dir, "assets"),
        "characters": os.path.join(base_dir, "assets", "characters"),
        "scripts": os.path.join(base_dir, "scripts"),
        "images": os.path.join(base_dir, "images"),
        "frames": os.path.join(base_dir, "frames"),
        "audio": os.path.join(base_dir, "audio"),
        "videos": os.path.join(base_dir, "videos"),
    }
    for path in dirs.values():
        os.makedirs(path, exist_ok=True)
    return dirs


def ensure_project_dirs_at_paths(
    *,
    output_dir: str | os.PathLike[str],
    state_dir: str | os.PathLike[str],
    runtime_dir: str | os.PathLike[str],
) -> dict[str, str]:
    """Ensure project directories from registry paths without legacy bootstrap."""
    base_dir = os.path.abspath(os.fspath(output_dir))
    runtime_root = os.path.abspath(os.fspath(runtime_dir))
    dirs = {
        "base": base_dir,
        "graph": os.path.join(base_dir, "graph"),
        "assets": os.path.join(base_dir, "assets"),
        "characters": os.path.join(base_dir, "assets", "characters"),
        "scripts": os.path.join(base_dir, "scripts"),
        "images": os.path.join(base_dir, "images"),
        "frames": os.path.join(base_dir, "frames"),
        "audio": os.path.join(base_dir, "audio"),
        "videos": os.path.join(base_dir, "videos"),
        "state": os.path.abspath(os.fspath(state_dir)),
        "runtime": runtime_root,
        "logs": os.path.join(runtime_root, "logs"),
        "staging": os.path.join(runtime_root, "staging"),
        "temp_sketch_panels": os.path.join(runtime_root, "temp_sketch_panels"),
    }
    for path in dirs.values():
        os.makedirs(path, exist_ok=True)
    return dirs
