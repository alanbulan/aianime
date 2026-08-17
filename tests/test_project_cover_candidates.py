import os
from types import SimpleNamespace

import ai_anime.api.routes.project_workspace.projects as project_routes
from ai_anime.api.routes.project_workspace.projects import (
    _project_cover_candidates,
)


def test_project_cover_candidates_are_paginated_and_keep_all_pages(tmp_path):
    project_dir = tmp_path / "project"
    frames = project_dir / "frames"
    frames.mkdir(parents=True)
    for index in range(7):
        path = frames / f"frame-{index}.png"
        path.write_bytes(b"image")
        os.utime(path, (index + 1, index + 1))

    cover = project_dir / "assets" / "project" / "cover.webp"
    cover.parent.mkdir(parents=True)
    cover.write_bytes(b"cover")

    context = SimpleNamespace(output_dir=project_dir, project_id="project-1")
    first = _project_cover_candidates(context, page=1, page_size=3)
    second = _project_cover_candidates(context, page=2, page_size=3)
    third = _project_cover_candidates(context, page=3, page_size=3)

    assert first["total"] == 7
    assert first["total_pages"] == 3
    assert first["has_more"] is True
    assert [item["name"] for item in first["items"]] == [
        "frame-6.png",
        "frame-5.png",
        "frame-4.png",
    ]
    assert [item["name"] for item in second["items"]] == [
        "frame-3.png",
        "frame-2.png",
        "frame-1.png",
    ]
    assert [item["name"] for item in third["items"]] == ["frame-0.png"]
    assert third["has_more"] is False
    assert all(item["name"] != "cover.webp" for item in first["items"])


def test_project_cover_candidate_pages_reuse_the_short_lived_scan_cache(
    monkeypatch,
    tmp_path,
):
    project_dir = tmp_path / "project"
    frames = project_dir / "frames"
    frames.mkdir(parents=True)
    (frames / "frame.png").write_bytes(b"image")
    context = SimpleNamespace(output_dir=project_dir, project_id="project-1")
    scans = 0
    original_scan = project_routes._scan_project_cover_images

    def recording_scan(path):
        nonlocal scans
        scans += 1
        return original_scan(path)

    project_routes._project_cover_cache.clear()
    monkeypatch.setattr(project_routes, "_scan_project_cover_images", recording_scan)

    _project_cover_candidates(context, page=1, page_size=1)
    _project_cover_candidates(context, page=2, page_size=1)

    assert scans == 1
