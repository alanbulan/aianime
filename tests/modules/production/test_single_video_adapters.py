from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.production.application.single_video import (
    GenerateSingleVideoCommand,
    SingleVideoRejected,
    SingleVideoTask,
)
from ai_anime.modules.production.infrastructure.single_video import (
    LocalSingleVideoPreparer,
    MediaIoBeatAudioDurationSource,
    TaskExecutionSingleVideoScheduler,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import ProjectTaskSubmissionUseCases
from ai_anime.modules.production.application.seedance2_config import (
    Seedance2I2VMode,
    parse_seedance2_config,
)


class _Store:
    def __init__(self, beats: list[dict]) -> None:
        self.beats = beats
        self.updated: list[dict] = []
        self.close_calls = 0

    async def get_beats_as_dicts(self, episode_num: int) -> list[dict]:
        assert episode_num == 3
        return self.beats

    async def update_beat_asset(self, **kwargs):
        self.updated.append(kwargs)
        return True

    async def close(self) -> None:
        self.close_calls += 1


class _EpisodeSource:
    def episode_or_none(self, _store, episode_num: int):
        assert episode_num == 3
        return "episode"


class _PropMenuSource:
    def __init__(self) -> None:
        self.calls = []

    async def for_episode(self, store, episode, beats):
        self.calls.append((store, episode, beats))
        return [{"prop_id": "prop-1"}]


class _AudioDurations:
    def __init__(self, duration: float | None) -> None:
        self.duration = duration
        self.calls = []

    async def for_beat(self, context, episode_num: int, beat_num: int):
        self.calls.append((context, episode_num, beat_num))
        return self.duration


def _context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="proj-1",
        project_name="demo",
        owner_type="user",
        owner_id="user-alice",
        owner_username="alice",
        requester_user_id="user-alice",
        requester_username="alice",
        requester_principals=(("user", "user-alice"),),
        effective_role="editor",
        home_node_id="local",
        output_dir=tmp_path,
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
        is_home_node=True,
    )


def _command(**overrides) -> GenerateSingleVideoCommand:
    values = {
        "episode_num": 3,
        "beat_num": 2,
        "video_model": "seedance-1.0-pro-fast",
        "resolution": "720x1280",
    }
    values.update(overrides)
    return GenerateSingleVideoCommand(**values)


def _frame(tmp_path: Path, beat_num: int = 2) -> Path:
    path = tmp_path / "frames" / "ep003" / f"beat_{beat_num:02d}.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"frame")
    return path


def _preparer(monkeypatch, store: _Store, audio_duration: float | None = None):
    from ai_anime.modules.production.infrastructure import single_video

    async def make_store(_context):
        return store

    monkeypatch.setattr(
        single_video.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )
    props = _PropMenuSource()
    durations = _AudioDurations(audio_duration)
    return (
        LocalSingleVideoPreparer(_EpisodeSource(), props, durations),
        props,
        durations,
    )


@pytest.mark.asyncio
async def test_missing_beat_rejects_and_closes_store(
    monkeypatch,
    tmp_path: Path,
) -> None:
    store = _Store([])
    preparer, _props, _durations = _preparer(monkeypatch, store)

    with pytest.raises(SingleVideoRejected, match="Beat 2 not found"):
        await preparer.prepare(_context(tmp_path), _command())

    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_missing_first_frame_rejects_and_closes_store(
    monkeypatch,
    tmp_path: Path,
) -> None:
    store = _Store([{"beat_number": 2, "audio_type": "dialogue"}])
    preparer, _props, _durations = _preparer(monkeypatch, store)

    with pytest.raises(SingleVideoRejected, match="Beat 2 首帧不存在，请先生成预览"):
        await preparer.prepare(_context(tmp_path), _command())

    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_standard_video_preserves_duration_resolution_and_task_payload(
    monkeypatch,
    tmp_path: Path,
) -> None:
    frame = _frame(tmp_path)
    beat = {
        "beat_number": 2,
        "audio_type": "dialogue",
        "video_mode": "first_frame",
        "video_prompt": "video prompt",
    }
    store = _Store([beat])
    preparer, _props, durations = _preparer(monkeypatch, store, 6.4)
    context = _context(tmp_path)

    task = await preparer.prepare(
        context,
        _command(
            duration=5,
            resolution="720p",
            provided_fields=frozenset({"duration", "resolution"}),
        ),
    )

    assert task.config["frame_path"] == str(frame)
    assert task.config["prompt"] == "video prompt"
    assert task.config["video_duration"] == 7.0
    assert task.config["resolution"] == "720p"
    assert task.config["cognee_store_project"] == "alice/demo"
    assert durations.calls == [(context, 3, 2)]
    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_standard_catalog_video_preserves_declared_size_and_ratio(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import single_video

    frame = _frame(tmp_path)
    beat = {
        "beat_number": 2,
        "audio_type": "dialogue",
        "video_mode": "first_frame",
        "video_prompt": "video prompt",
    }
    store = _Store([beat])
    preparer, _props, _durations = _preparer(monkeypatch, store)
    monkeypatch.setattr(
        single_video,
        "runtime_model_capability",
        lambda _model: SimpleNamespace(
            video_profile=None,
            video_resolution_options=(),
            video_size_options=("1344x768", "768x1344", "1024x1024"),
            video_generation_min_seconds=1,
            video_generation_max_seconds=15,
        ),
    )

    task = await preparer.prepare(
        _context(tmp_path),
        _command(
            video_model="MINIMAX_H3",
            duration=4,
            resolution="768x1344",
            ratio="9:16",
            provided_fields=frozenset({"duration", "resolution", "ratio"}),
        ),
    )

    assert task.config["frame_path"] == str(frame)
    assert task.config["video_duration"] == 4.0
    assert task.config["resolution"] == "768x1344"
    assert task.config["ratio"] == "9:16"
    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_keyframe_video_uses_next_storyboard_beat_instead_of_numeric_neighbor(
    monkeypatch,
    tmp_path: Path,
) -> None:
    current_frame = _frame(tmp_path, 41)
    next_frame = _frame(tmp_path, 2)
    beats = [
        {"beat_number": 1, "video_mode": "first_frame"},
        {
            "beat_number": 41,
            "audio_type": "dialogue",
            "video_mode": "keyframe",
            "keyframe_prompt": "continue into the next shot",
            "video_prompt": "fallback prompt",
        },
        {"beat_number": 2, "video_mode": "first_frame"},
    ]
    store = _Store(beats)
    preparer, _props, _durations = _preparer(monkeypatch, store)

    task = await preparer.prepare(
        _context(tmp_path),
        _command(beat_num=41),
    )

    assert task.config["frame_path"] == str(current_frame)
    assert task.config["last_frame_path"] == str(next_frame)
    assert task.config["video_mode"] == "keyframe"


@pytest.mark.parametrize(
    ("beat", "next_frame"),
    [
        (
            {
                "beat_number": 2,
                "audio_type": "dialogue",
                "video_mode": "first_frame",
                "video_prompt": "",
            },
            False,
        ),
        (
            {
                "beat_number": 2,
                "audio_type": "dialogue",
                "video_mode": "keyframe",
                "video_prompt": "unused",
                "keyframe_prompt": "",
            },
            True,
        ),
    ],
)
@pytest.mark.asyncio
async def test_standard_video_rejects_missing_mode_prompt(
    monkeypatch,
    tmp_path: Path,
    beat: dict,
    next_frame: bool,
) -> None:
    _frame(tmp_path)
    if next_frame:
        _frame(tmp_path, 3)
    store = _Store(
        [beat, {"beat_number": 3, "video_mode": "first_frame"}]
        if next_frame
        else [beat]
    )
    preparer, _props, _durations = _preparer(monkeypatch, store)

    with pytest.raises(
        SingleVideoRejected,
        match="Beat 2 缺少视频提示词",
    ):
        await preparer.prepare(_context(tmp_path), _command())

    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_seedance2_uses_prepared_config_and_audio_duration(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import single_video

    frame = _frame(tmp_path)
    beat = {
        "beat_number": 2,
        "video_mode": "first_frame",
        "video_prompt": "old prompt",
        "seedance2_config_json": (
            '{"duration": 11, "final_prompt": "configured prompt"}'
        ),
    }
    store = _Store([beat])
    preparer, _props, _durations = _preparer(monkeypatch, store, 6.4)
    calls = []

    async def prepare_inputs(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(
            prompt="configured prompt",
            seedance2_config_json=beat["seedance2_config_json"],
            duration=11,
            mode=Seedance2I2VMode.FIRST_FRAME,
            image_path=str(frame),
            last_frame_path=None,
            references=[],
        )

    monkeypatch.setattr(
        single_video,
        "prepare_seedance2_generation_inputs",
        prepare_inputs,
    )

    task = await preparer.prepare(
        _context(tmp_path),
        _command(video_model="seedance-2.0-fast"),
    )

    assert calls[0]["duration"] == 6.4
    assert task.config["prompt"] == "configured prompt"
    assert task.config["video_duration"] == 11
    assert task.config["seedance2_config"] == beat["seedance2_config_json"]
    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_cloud_seedance_profile_clamps_short_dialogue_to_model_minimum(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import single_video

    frame = _frame(tmp_path)
    beat = {
        "beat_number": 2,
        "audio_type": "dialogue",
        "video_mode": "first_frame",
        "video_prompt": "old prompt",
        "seedance2_config_json": (
            '{"duration": 1, "final_prompt": "configured prompt"}'
        ),
    }
    store = _Store([beat])
    preparer, _props, _durations = _preparer(monkeypatch, store, 0.768)
    calls = []
    monkeypatch.setattr(
        single_video,
        "runtime_model_capability",
        lambda _model: SimpleNamespace(
            video_profile="seedance2",
            video_resolution_options=("480p", "720p", "1080p"),
            video_generation_min_seconds=4,
            video_generation_max_seconds=15,
        ),
    )

    async def prepare_inputs(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(
            prompt="configured prompt",
            seedance2_config_json=beat["seedance2_config_json"],
            duration=1,
            mode=Seedance2I2VMode.FIRST_FRAME,
            image_path=str(frame),
            last_frame_path=None,
            references=[],
        )

    monkeypatch.setattr(
        single_video,
        "prepare_seedance2_generation_inputs",
        prepare_inputs,
    )

    task = await preparer.prepare(
        _context(tmp_path),
        _command(
            video_model="opaque-cloud-video-42",
            resolution="1080p",
            provided_fields=frozenset({"resolution"}),
        ),
    )

    assert calls[0]["duration"] == pytest.approx(0.768)
    assert calls[0]["resolution"] == "1080p"
    assert task.config["video_duration"] == 4.0
    assert task.config["model_role"] == "VIDEO_IMAGE_TO_VIDEO"
    assert task.config["seedance2_config"] == beat["seedance2_config_json"]
    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_seedance2_merges_inline_controls_before_preparation(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import single_video

    frame = _frame(tmp_path)
    beat = {
        "beat_number": 2,
        "video_mode": "first_frame",
        "video_prompt": "old prompt",
        "seedance2_config_json": (
            '{"duration": 4, "final_prompt": "old prompt", '
            '"return_last_frame": false, "generate_audio": true, '
            '"human_review": true}'
        ),
    }
    store = _Store([beat])
    preparer, _props, _durations = _preparer(monkeypatch, store)
    calls = []

    async def prepare_inputs(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(
            prompt="fresh prompt",
            seedance2_config_json=kwargs["beat"]["seedance2_config_json"],
            duration=9,
            mode=Seedance2I2VMode.MULTIMODAL_REFERENCE,
            image_path=str(frame),
            last_frame_path=None,
            references=[],
        )

    monkeypatch.setattr(
        single_video,
        "prepare_seedance2_generation_inputs",
        prepare_inputs,
    )
    command = _command(
        video_model="seedance-2.0-fast",
        mode="multimodal_reference",
        duration=9,
        ratio="16:9",
        generate_audio=False,
        return_last_frame=True,
        human_review=False,
        final_prompt="fresh prompt",
        prompt_guidance="keep motion minimal",
        provided_fields=frozenset(
            {
                "mode",
                "duration",
                "ratio",
                "generate_audio",
                "return_last_frame",
                "human_review",
                "final_prompt",
                "prompt_guidance",
            }
        ),
    )

    task = await preparer.prepare(_context(tmp_path), command)

    merged = parse_seedance2_config(calls[0]["beat"]["seedance2_config_json"])
    assert merged.mode == Seedance2I2VMode.MULTIMODAL_REFERENCE
    assert merged.duration == 9
    assert merged.ratio == "16:9"
    assert merged.generate_audio is False
    assert merged.generate_audio_user_set is True
    assert merged.return_last_frame is True
    assert merged.human_review is False
    assert merged.human_review_user_set is True
    assert merged.final_prompt == "fresh prompt"
    assert merged.prompt_guidance == "keep motion minimal"
    assert task.config["seedance2_config"] == beat["seedance2_config_json"]
    assert store.updated[-1]["seedance2_config_json"] == (
        beat["seedance2_config_json"]
    )
    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_seedance2_rejects_empty_prepared_prompt_and_closes_store(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import single_video

    _frame(tmp_path)
    store = _Store(
        [
            {
                "beat_number": 2,
                "video_mode": "first_frame",
                "video_prompt": "",
                "seedance2_config_json": "{}",
            }
        ]
    )
    preparer, _props, _durations = _preparer(monkeypatch, store)

    async def prepare_inputs(**_kwargs):
        return SimpleNamespace(
            prompt="",
            seedance2_config_json="{}",
            duration=5,
            mode=Seedance2I2VMode.FIRST_FRAME,
            image_path=None,
            last_frame_path=None,
            references=[],
        )

    monkeypatch.setattr(
        single_video,
        "prepare_seedance2_generation_inputs",
        prepare_inputs,
    )

    with pytest.raises(SingleVideoRejected, match="Seedance 2.0 最终提示词为空"):
        await preparer.prepare(
            _context(tmp_path),
            _command(video_model="seedance-2.0-fast"),
        )

    assert store.close_calls == 1


@pytest.mark.parametrize(
    (
        "model",
        "reference_limit",
        "expected_resolution",
        "audio_setting",
        "duration",
        "catalog_limit",
    ),
    [
        ("happyhorse-1.0", 9, "1080p", "origin", 6, None),
        ("grok-video-channel", 7, "720p", None, 7, None),
        ("happyhorse-1.0", 2, "1080p", "origin", 6, 2),
    ],
)
@pytest.mark.asyncio
async def test_reference_video_models_prepare_bounded_references(
    monkeypatch,
    tmp_path: Path,
    model: str,
    reference_limit: int,
    expected_resolution: str,
    audio_setting: str | None,
    duration: int,
    catalog_limit: int | None,
) -> None:
    from ai_anime.modules.production.infrastructure import single_video

    _frame(tmp_path)
    beat = {
        "beat_number": 2,
        "video_mode": "first_frame",
        "video_prompt": "old prompt",
        "seedance2_config_json": "{}",
    }
    store = _Store([beat])
    preparer, props, _durations = _preparer(monkeypatch, store)
    if catalog_limit is not None:
        monkeypatch.setattr(
            single_video,
            "runtime_model_capability",
            lambda _model: SimpleNamespace(max_reference_images=catalog_limit),
        )
    image_paths = [f"reference-{index}.png" for index in range(1, 11)]
    monkeypatch.setattr(
        single_video,
        "build_seedance2_project_assets",
        lambda **_kwargs: [],
    )
    monkeypatch.setattr(
        single_video,
        "append_seedance2_user_reference_assets",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        single_video,
        "selected_reference_paths",
        lambda *_args, **_kwargs: image_paths,
    )
    provided_fields = {
        "mode",
        "duration",
        "resolution",
        "ratio",
        "final_prompt",
    }

    task = await preparer.prepare(
        _context(tmp_path),
        _command(
            video_model=model,
            mode="multimodal_reference",
            duration=duration,
            resolution="1080p",
            ratio="1:1",
            final_prompt="reference prompt",
            audio_setting=audio_setting,
            provided_fields=frozenset(provided_fields),
        ),
    )

    assert task.config["frame_path"] is None
    assert task.config["prompt"] == "reference prompt"
    assert task.config["video_duration"] == float(duration)
    assert task.config["resolution"] == expected_resolution
    assert task.config["ratio"] == "1:1"
    assert len(task.config["references"]) == reference_limit
    assert task.config["references"][0] == {
        "type": "image",
        "path": "reference-1.png",
        "role": "图片1",
        "field": "reference_images",
    }
    if audio_setting is not None:
        assert task.config["audio_setting"] == audio_setting
    else:
        assert "audio_setting" not in task.config
    assert props.calls == [(store, "episode", [beat])]
    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_media_duration_source_reads_existing_audio(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import single_video

    context = _context(tmp_path)
    audio = tmp_path / "audio" / "ep003" / "beat_02.mp3"
    audio.parent.mkdir(parents=True)
    audio.write_bytes(b"audio")
    calls = []

    async def duration(path: str):
        calls.append(path)
        return 4.5

    monkeypatch.setattr(single_video, "get_audio_duration_async", duration)

    result = await MediaIoBeatAudioDurationSource().for_beat(context, 3, 2)

    assert result == 4.5
    assert calls == [str(audio)]


@pytest.mark.asyncio
async def test_task_execution_scheduler_preserves_single_video_contract(
    tmp_path: Path,
) -> None:
    calls = []

    class Backend:
        async def enqueue_project_task(self, context, **kwargs):
            calls.append((context, kwargs))
            return SimpleNamespace(
                task_state=SimpleNamespace(task_id="task-1"),
                backend="celery",
                queue="node.local.video",
            )

    context = _context(tmp_path)
    task = SingleVideoTask(
        episode_num=3,
        beat_num=2,
        config={"prompt": "video prompt"},
        output_dir=tmp_path,
    )

    receipt = await TaskExecutionSingleVideoScheduler(
        ProjectTaskSubmissionUseCases(lambda: Backend())
    ).enqueue(context, task)

    assert calls == [
        (
            context,
            {
                "task_type": "single_video",
                "queue_kind": "video",
                "episode": 3,
                "beat_num": 2,
                "payload": task.backend_payload(),
            },
        )
    ]
    assert receipt.task_id == "task-1"
    assert receipt.task_key == "task:single_video:project:proj-1:3:2"
    assert receipt.backend == "celery"
    assert receipt.queue == "node.local.video"
