from types import SimpleNamespace

import pytest


class _FakePipelineStore:
    def get_all_characters(self):
        return [
            SimpleNamespace(
                name="Hero",
                is_main=True,
                identities=[
                    SimpleNamespace(identity_id="hero_main", identity_name="Hero Main")
                ],
            )
        ]

    def get_all_episodes(self):
        return [SimpleNamespace(number=1)]

    def get_episode(self, episode: int):
        assert episode == 1
        return SimpleNamespace(number=1, identity_ids=["hero_main"])

    def get_sketch_colors(self, episode: int):
        assert episode == 1
        return {"hero_main": "#ff0000 red"}

    async def get_beats_as_dicts(self, episode: int):
        assert episode == 1
        return [
            {
                "beat_number": 1,
                "narration_segment": "one",
                "detected_identities": [],
                "video_mode": "first_frame",
                "video_prompt": "one",
            },
            {
                "beat_number": 2,
                "narration_segment": "two",
                "detected_identities": [],
                "video_mode": "first_frame",
                "video_prompt": "two",
            },
            {
                "beat_number": 5,
                "narration_segment": "five",
                "detected_identities": [],
                "video_mode": "first_frame",
                "video_prompt": "five",
                "is_manual_shot": True,
            },
        ]


@pytest.mark.asyncio
async def test_pipeline_status_uses_sparse_beat_numbers_for_media(monkeypatch, tmp_path):
    from ai_anime.api.routes.task_execution import pipeline
    from ai_anime.api.deps import ProjectResolution

    async def fake_resolve_project_scope(project, user, *, required_role="viewer"):
        return ProjectResolution(
            ctx=None,
            username="alice",
            project_name="demo",
            project_dir=tmp_path,
            output_dir=str(tmp_path),
            state_dir=str(tmp_path / "state"),
            runtime_dir=str(tmp_path / "runtime"),
        )

    monkeypatch.setattr(pipeline, "resolve_project_scope", fake_resolve_project_scope)

    ep_tag = "ep001"
    for folder, suffix in (
        ("frames", "png"),
        ("audio", "mp3"),
        ("videos/beats", "mp4"),
    ):
        target_dir = tmp_path / folder / ep_tag
        target_dir.mkdir(parents=True)
        for beat_num in (1, 2, 5):
            (target_dir / f"beat_{beat_num:02d}.{suffix}").write_bytes(b"x")
    (tmp_path / "grids" / ep_tag).mkdir(parents=True)
    (tmp_path / "grids" / ep_tag / "grid.png").write_bytes(b"x")

    monkeypatch.setattr(pipeline, "_user_has_configured", lambda username, project: True)
    monkeypatch.setattr(
        pipeline,
        "compute_portrait_path",
        lambda project_dir, character_name: tmp_path / "portrait.png",
    )
    monkeypatch.setattr(
        pipeline,
        "compute_identity_path",
        lambda project_dir, character_name, identity_name: tmp_path / "identity.png",
    )

    response = await pipeline.pipeline_status(
        project="demo",
        episode=1,
        user={"username": "alice"},
        store=_FakePipelineStore(),
    )

    assert response["data"]["episode_status"]["first_frames"] is True
    assert response["data"]["episode_status"]["tts"] is True
    assert response["data"]["episode_status"]["video"] is True


def test_pipeline_script_status_accepts_current_sqlite_beat_fields():
    from ai_anime.api.routes.task_execution.pipeline import _beat_has_script_content

    assert _beat_has_script_content({"narration": "旁白", "visual_description": ""}) is True
    assert _beat_has_script_content({"narration": "", "visual_description": "黑屏标题"}) is True
    assert _beat_has_script_content({"narration_segment": "旧字段"}) is True
    assert _beat_has_script_content({"narration": "", "visual_description": ""}) is False


def test_pipeline_requires_every_beat_sketch(tmp_path):
    from ai_anime.api.routes.task_execution.pipeline import (
        _beat_file_series_complete,
    )

    (tmp_path / "beat_01.png").write_bytes(b"x")

    assert (
        _beat_file_series_complete(
            tmp_path,
            "png",
            [{"beat_number": 1}, {"beat_number": 2}],
        )
        is False
    )


def test_pipeline_requires_identity_detection_newer_than_sketches(tmp_path):
    from ai_anime.api.routes.task_execution.pipeline import (
        _task_completed_after_files,
    )
    from ai_anime.modules.task_execution.public import ProjectTask

    sketch = tmp_path / "beat_01.png"
    sketch.write_bytes(b"x")
    stale_task = ProjectTask(
        task_id="old",
        task_type="ai_identity_detection",
        status="completed",
        completed_at="2000-01-01T00:00:00+00:00",
    )
    fresh_task = ProjectTask(
        task_id="new",
        task_type="ai_identity_detection",
        status="completed",
        completed_at="2100-01-01T00:00:00+00:00",
    )

    assert _task_completed_after_files(stale_task, [sketch]) is False
    assert _task_completed_after_files(fresh_task, [sketch]) is True
