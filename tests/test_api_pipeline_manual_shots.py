from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest


@pytest.fixture
def audio_plan(monkeypatch):
    from ai_anime.api.routes.task_execution import pipeline

    planner = AsyncMock(return_value=SimpleNamespace(errors=[], beat_numbers=[]))
    monkeypatch.setattr(pipeline, "build_episode_audio_generation_plan", planner)
    return planner


class _FakePipelineStore:
    def __init__(self, *, is_main: bool = True):
        self.is_main = is_main

    def get_all_characters(self):
        return [
            SimpleNamespace(
                name="Hero",
                is_main=self.is_main,
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
async def test_pipeline_status_uses_sparse_beat_numbers_for_media(monkeypatch, tmp_path, audio_plan):
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
    monkeypatch.setattr(pipeline, "_advanced_video_prompts_required", lambda *_: False)
    monkeypatch.setattr(
        pipeline,
        "compute_portrait_path",
        lambda project_dir, character_name: tmp_path / "portrait.png",
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


@pytest.mark.asyncio
async def test_pipeline_does_not_use_narrative_anchor_as_portrait_gate(
    monkeypatch, tmp_path, audio_plan
):
    from ai_anime.api.deps import ProjectResolution
    from ai_anime.api.routes.task_execution import pipeline

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
    monkeypatch.setattr(pipeline, "_user_has_configured", lambda *_: True)
    monkeypatch.setattr(pipeline, "_advanced_video_prompts_required", lambda *_: False)
    monkeypatch.setattr(pipeline, "compute_portrait_path", lambda *_: "")

    response = await pipeline.pipeline_status(
        project="demo",
        episode=1,
        user={"username": "alice"},
        store=_FakePipelineStore(is_main=False),
    )

    assert response["data"]["global"]["portraits_done"] is False
    assert response["data"]["current_episode"] == 1
    assert response["data"]["next_step"] != "portraits"


def test_pipeline_script_status_accepts_current_sqlite_beat_fields():
    from ai_anime.modules.task_execution.public import beat_has_script_content

    assert beat_has_script_content({"narration": "旁白", "visual_description": ""}) is True
    assert beat_has_script_content({"narration": "", "visual_description": "黑屏标题"}) is True
    assert beat_has_script_content({"narration_segment": "旧字段"}) is True
    assert beat_has_script_content({"narration": "", "visual_description": ""}) is False


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


def test_pipeline_rejects_first_frames_older_than_current_sketches(tmp_path):
    import os

    from ai_anime.api.routes.task_execution.pipeline import (
        _beat_file_series_current,
    )

    frames = tmp_path / "frames"
    sketches = tmp_path / "sketches"
    frames.mkdir()
    sketches.mkdir()
    frame = frames / "beat_01.png"
    sketch = sketches / "beat_01.png"
    frame.write_bytes(b"old-frame")
    sketch.write_bytes(b"new-sketch")
    newer_time = frame.stat().st_mtime_ns + 1_000_000
    os.utime(sketch, ns=(newer_time, newer_time))

    assert (
        _beat_file_series_current(
            frames,
            "png",
            [{"beat_number": 1}],
            ((sketches, "png"),),
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


@pytest.fixture
def ready_pipeline(monkeypatch, tmp_path, audio_plan):
    from ai_anime.api.deps import ProjectResolution
    from ai_anime.api.routes.task_execution import pipeline
    from ai_anime.modules.production import public as production_public

    async def resolve_scope(*_args, **_kwargs):
        return ProjectResolution(
            ctx=None, username="alice", project_name="demo", project_dir=tmp_path,
            output_dir=str(tmp_path), state_dir=str(tmp_path / "state"),
            runtime_dir=str(tmp_path / "runtime"),
        )

    monkeypatch.setattr(pipeline, "resolve_project_scope", resolve_scope)
    monkeypatch.setattr(pipeline, "_user_has_configured", lambda *_: True)
    monkeypatch.setattr(pipeline, "_advanced_video_prompts_required", lambda *_: False)
    monkeypatch.setattr(pipeline, "compute_portrait_path", lambda *_: "portrait.png")
    monkeypatch.setattr(
        pipeline, "inspect_episode_visual_assets",
        lambda **_kwargs: SimpleNamespace(
            identity_plan_complete=True, scene_plan_complete=True,
            prop_plan_complete=True, identity_images_complete=True,
            scene_images_complete=True, prop_images_complete=True,
            ready_for_sketches=True, issues=(),
        ),
    )
    monkeypatch.setattr(pipeline, "stale_canonical_sketch_numbers", lambda *_args, **_kwargs: [1])
    monkeypatch.setattr(
        production_public, "provision_voice_design_requirements",
        AsyncMock(side_effect=AssertionError("status GET must not generate voices")),
    )
    store = _FakePipelineStore()

    async def status():
        return (await pipeline.pipeline_status(
            project="demo", episode=1, user={"username": "alice"}, store=store,
        ))["data"]

    return status, store


@pytest.mark.asyncio
@pytest.mark.parametrize("error", ["角色声线缺失：Hero", "项目解说人声线未配置"])
async def test_pipeline_requires_episode_voices_before_sketches(ready_pipeline, audio_plan, error):
    status, store = ready_pipeline
    audio_plan.return_value = SimpleNamespace(errors=[error], beat_numbers=[])

    data = await status()

    assert data["episode_status"]["voice_assets"] is False
    assert data["episode_status"]["tts"] is False
    assert data["voice_asset_issues"] == [error]
    assert data["next_step"] == "voice_assets"
    assert data["next_step_name"] == "本集声线准备"
    audio_plan.assert_awaited_once_with(
        store=store, username="alice", project="demo", episode=1,
        beat_numbers=None, mode="sync_changed",
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("pending_audio", [[], [1, 5]])
async def test_pipeline_separates_ready_voices_from_generated_audio(
    ready_pipeline, audio_plan, pending_audio,
):
    status, _store = ready_pipeline
    audio_plan.return_value = SimpleNamespace(errors=[], beat_numbers=pending_audio)

    data = await status()

    assert data["episode_status"]["voice_assets"] is True
    assert data["voice_asset_issues"] == []
    assert data["next_step"] == "sketch_generation"
    assert data["episode_status"]["tts"] is (not pending_audio)


@pytest.mark.asyncio
async def test_pipeline_checks_video_voice_requirements_without_requiring_frames(
    ready_pipeline, monkeypatch,
):
    from ai_anime.api.routes.task_execution import pipeline
    from ai_anime.modules.production.public import VideoReferencePrereqError

    status, _store = ready_pipeline
    monkeypatch.setattr(pipeline, "_advanced_video_prompts_required", lambda *_: True)
    monkeypatch.setattr(
        pipeline, "collect_video_reference_prereq_errors",
        lambda **_kwargs: [
            VideoReferencePrereqError(1, "first_frame", "首帧", "image", "", "missing"),
            VideoReferencePrereqError(1, "voice:Hero", "Hero 声线", "audio", "", "too_short"),
        ],
    )

    data = await status()

    assert data["next_step"] == "voice_assets"
    assert data["voice_asset_issues"] == ["Beat 1 Hero 声线：too_short"]


@pytest.mark.asyncio
async def test_pipeline_recommends_first_frames_before_global_optimization(
    ready_pipeline, monkeypatch,
):
    from ai_anime.api.routes.task_execution import pipeline

    status, store = ready_pipeline
    beats = await store.get_beats_as_dicts(1)
    for beat in beats:
        beat["detected_props"] = []
        beat["video_mode"] = ""
        beat["video_prompt"] = ""
    monkeypatch.setattr(store, "get_beats_as_dicts", AsyncMock(return_value=beats))
    monkeypatch.setattr(pipeline, "stale_canonical_sketch_numbers", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(pipeline, "_task_completed_after_files", lambda *_: True)

    data = await status()

    assert data["episode_status"]["first_frames"] is False
    assert data["episode_status"]["global_optimize"] is False
    assert data["next_step"] == "selected_regen"


@pytest.mark.asyncio
@pytest.mark.parametrize("has_script", [True, False])
async def test_pipeline_skips_unneeded_voice_and_audio_slots(
    ready_pipeline, monkeypatch, audio_plan, has_script,
):
    from ai_anime.modules.production.public import build_episode_audio_generation_plan

    status, store = ready_pipeline
    beats = [{
        "beat_number": 1, "audio_type": "silence", "speaker": "Hero",
        "visual_description": "空镜，无对白" if has_script else "",
    }]
    monkeypatch.setattr(store, "get_beats_as_dicts", AsyncMock(return_value=beats))
    audio_plan.side_effect = build_episode_audio_generation_plan

    data = await status()

    assert data["episode_status"]["voice_assets"] is has_script
    assert data["episode_status"]["tts"] is has_script
    assert data["voice_asset_issues"] == []
    assert audio_plan.await_count == int(has_script)


@pytest.mark.asyncio
@pytest.mark.parametrize("voice_ready", [False, True])
async def test_pipeline_reads_actual_used_voice_and_accepts_inherited_sample(
    ready_pipeline, monkeypatch, audio_plan, tmp_path, voice_ready,
):
    import wave

    from ai_anime.modules.asset_world.public import CharacterIdentity, NovelCharacter
    from ai_anime.modules.production.public import build_episode_audio_generation_plan

    status, store = ready_pipeline
    hero = NovelCharacter(name="Hero")
    hero.identities = [CharacterIdentity(
        character_name="Hero", identity_name="Main", identity_id="Hero_main",
    )]
    unused = NovelCharacter(name="Unused")
    if voice_ready:
        with wave.open(str(tmp_path / "voice.wav"), "wb") as sample:
            sample.setnchannels(1)
            sample.setsampwidth(2)
            sample.setframerate(16000)
            sample.writeframes(b"\0\0" * 32000)
        hero.reference_audio_path = "voice.wav"
    characters = [hero, unused]
    monkeypatch.setattr(store, "get_all_characters", lambda: characters)
    monkeypatch.setattr(store, "list_characters", AsyncMock(return_value=characters), raising=False)
    monkeypatch.setattr(store, "project_dir", str(tmp_path), raising=False)
    monkeypatch.setattr(store, "db_path", str(tmp_path / "data.db"), raising=False)
    monkeypatch.setattr(store, "get_beats_as_dicts", AsyncMock(return_value=[{
        "beat_number": 1, "speaker": "Hero_main", "audio_type": "dialogue",
        "narration_segment": "我们回去吧。", "visual_description": "Hero 走出房间。",
    }]))
    audio_plan.side_effect = build_episode_audio_generation_plan

    data = await status()

    assert data["episode_status"]["voice_assets"] is voice_ready
    assert data["episode_status"]["tts"] is False
    assert data["next_step"] == ("sketch_generation" if voice_ready else "voice_assets")
    assert not any("Unused" in issue for issue in data["voice_asset_issues"])
    if not voice_ready:
        assert data["voice_asset_issues"] == ["Beat 01 角色声线缺失：Hero_main"]
