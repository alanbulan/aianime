from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image

from ai_anime.modules.production.infrastructure.media_generation import nanobanana_grid
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.infrastructure.runners import render as render_runner


pytestmark = pytest.mark.m09


def _beats(count: int) -> list[dict]:
    return [
        {
            "episode_number": 1,
            "beat_number": index,
            "visual_description": f"Beat {index}",
        }
        for index in range(1, count + 1)
    ]


def _project_context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="project-1",
        project_name="demo",
        owner_type="user",
        owner_id="owner-1",
        owner_username="admin",
        requester_user_id="owner-1",
        requester_username="admin",
        requester_principals=(("user", "owner-1"),),
        effective_role="editor",
        home_node_id="node-1",
        output_dir=tmp_path / "output",
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
        is_home_node=True,
    )


@pytest.mark.asyncio
async def test_selected_regeneration_limits_concurrency_reports_progress_and_resumes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeGridGenerator:
        def __init__(self) -> None:
            self.active = 0
            self.max_active = 0
            self.calls = 0

        async def generate_grid(self, **kwargs):
            self.calls += 1
            self.active += 1
            self.max_active = max(self.max_active, self.active)
            try:
                await asyncio.sleep(0.01)
                output_path = Path(kwargs["output_path"])
                output_path.parent.mkdir(parents=True, exist_ok=True)
                Image.new("RGB", (16, 16), "blue").save(output_path)
                return nanobanana_grid.GridGenerationResult(
                    success=True,
                    grid_image_path=str(output_path),
                    generation_time=0.01,
                )
            finally:
                self.active -= 1

    generator = FakeGridGenerator()
    monkeypatch.setattr(
        nanobanana_grid,
        "create_grid_generator",
        lambda *_args, **_kwargs: generator,
    )
    progress_events: list[dict] = []

    results = await nanobanana_grid.regenerate_selected_beats(
        selected_beats=_beats(5),
        mode_key="1x1_2-3",
        character_map={},
        style="anime",
        output_dir=str(tmp_path / "render"),
        is_sketch=True,
        max_concurrency=2,
        heartbeat_interval_seconds=0,
        resume_token="task-run-1",
        progress_callback=progress_events.append,
    )

    assert generator.calls == 5
    assert generator.max_active == 2
    assert [result.beat_start_index for result in results] == [0, 1, 2, 3, 4]
    assert progress_events[-1]["event"] == "finished"
    assert progress_events[-1]["completed"] == 5
    assert max(event["active"] for event in progress_events) == 2

    class UnexpectedGenerator:
        async def generate_grid(self, **_kwargs):
            raise AssertionError("checkpointed grids must not be generated again")

    monkeypatch.setattr(
        nanobanana_grid,
        "create_grid_generator",
        lambda *_args, **_kwargs: UnexpectedGenerator(),
    )
    resumed_events: list[dict] = []
    resumed = await nanobanana_grid.regenerate_selected_beats(
        selected_beats=_beats(5),
        mode_key="1x1_2-3",
        character_map={},
        style="anime",
        output_dir=str(tmp_path / "render"),
        is_sketch=True,
        max_concurrency=2,
        heartbeat_interval_seconds=0,
        resume_token="task-run-1",
        progress_callback=resumed_events.append,
    )

    assert len(resumed) == 5
    assert resumed_events[0]["event"] == "resumed"
    assert resumed_events[0]["reused"] == 5
    assert resumed_events[-1]["completed"] == 5


@pytest.mark.asyncio
async def test_selected_regeneration_exposes_completed_grid_before_batch_finishes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    release_second = asyncio.Event()
    first_grid_promoted = asyncio.Event()
    completed_grids: list[int] = []

    class StaggeredGridGenerator:
        async def generate_grid(self, **kwargs):
            output_path = Path(kwargs["output_path"])
            if output_path.stem.endswith("g02"):
                await release_second.wait()
            output_path.parent.mkdir(parents=True, exist_ok=True)
            Image.new("RGB", (16, 16), "blue").save(output_path)
            return nanobanana_grid.GridGenerationResult(
                success=True,
                grid_image_path=str(output_path),
            )

    def on_grid_completed(event: dict) -> None:
        completed_grids.append(int(event["grid_index"]))
        if int(event["grid_index"]) == 1:
            first_grid_promoted.set()

    monkeypatch.setattr(
        nanobanana_grid,
        "create_grid_generator",
        lambda *_args, **_kwargs: StaggeredGridGenerator(),
    )

    task = asyncio.create_task(
        nanobanana_grid.regenerate_selected_beats(
            selected_beats=_beats(2),
            mode_key="1x1_2-3",
            character_map={},
            style="anime",
            output_dir=str(tmp_path / "render"),
            is_sketch=True,
            max_concurrency=2,
            heartbeat_interval_seconds=0,
            grid_completed_callback=on_grid_completed,
        )
    )

    await asyncio.wait_for(first_grid_promoted.wait(), timeout=1.0)
    assert completed_grids == [1]
    assert task.done() is False

    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task


@pytest.mark.asyncio
async def test_selected_regeneration_retries_only_transient_failures(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class RetryGenerator:
        def __init__(self) -> None:
            self.calls = 0

        async def generate_grid(self, **kwargs):
            self.calls += 1
            if self.calls == 1:
                return nanobanana_grid.GridGenerationResult(
                    success=False,
                    error="云端图片生成服务请求超时（HTTP 504）",
                )
            output_path = Path(kwargs["output_path"])
            output_path.parent.mkdir(parents=True, exist_ok=True)
            Image.new("RGB", (16, 16), "green").save(output_path)
            return nanobanana_grid.GridGenerationResult(
                success=True,
                grid_image_path=str(output_path),
            )

    async def no_delay(_seconds: float) -> None:
        return None

    generator = RetryGenerator()
    monkeypatch.setattr(
        nanobanana_grid,
        "create_grid_generator",
        lambda *_args, **_kwargs: generator,
    )
    monkeypatch.setattr(nanobanana_grid.asyncio, "sleep", no_delay)
    progress_events: list[dict] = []

    results = await nanobanana_grid.regenerate_selected_beats(
        selected_beats=_beats(1),
        mode_key="1x1_2-3",
        character_map={},
        style="anime",
        output_dir=str(tmp_path / "render"),
        is_sketch=True,
        max_concurrency=1,
        max_attempts=2,
        heartbeat_interval_seconds=0,
        progress_callback=progress_events.append,
    )

    assert generator.calls == 2
    assert results[0].success is True
    retry_event = next(event for event in progress_events if event["event"] == "retry")
    assert retry_event["attempt"] == 2
    assert retry_event["max_attempts"] == 2


@pytest.mark.asyncio
async def test_selected_regeneration_emits_heartbeat_while_provider_is_pending(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    release = asyncio.Event()
    progress_events: list[dict] = []

    class PendingGenerator:
        async def generate_grid(self, **kwargs):
            await release.wait()
            output_path = Path(kwargs["output_path"])
            output_path.parent.mkdir(parents=True, exist_ok=True)
            Image.new("RGB", (16, 16), "yellow").save(output_path)
            return nanobanana_grid.GridGenerationResult(
                success=True,
                grid_image_path=str(output_path),
            )

    def capture_progress(event: dict) -> None:
        progress_events.append(event)
        if event["event"] == "heartbeat":
            release.set()

    monkeypatch.setattr(
        nanobanana_grid,
        "create_grid_generator",
        lambda *_args, **_kwargs: PendingGenerator(),
    )

    await asyncio.wait_for(
        nanobanana_grid.regenerate_selected_beats(
            selected_beats=_beats(1),
            mode_key="1x1_2-3",
            character_map={},
            style="anime",
            output_dir=str(tmp_path / "render"),
            is_sketch=True,
            heartbeat_interval_seconds=0.1,
            progress_callback=capture_progress,
        ),
        timeout=1.0,
    )

    heartbeat_event = next(
        event for event in progress_events if event["event"] == "heartbeat"
    )
    assert heartbeat_event["completed"] == 0
    assert heartbeat_event["active"] == 1


@pytest.mark.asyncio
async def test_selected_regeneration_runner_updates_real_progress_and_rejects_partial_success(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _project_context(tmp_path)
    output_path = context.output_dir / "grids" / "ep001" / "sketch" / "grid_01.png"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (16, 16), "red").save(output_path)
    log_calls: list[dict] = []
    save_calls: list[dict] = []

    async def fake_scene_refs(**_kwargs):
        return {
            "requested": 0,
            "generated": 0,
            "skipped": 0,
            "missing": 0,
            "director_refs": 0,
        }

    async def fake_regenerate_selected_beats(**kwargs):
        callback = kwargs["progress_callback"]
        completed_result = SimpleNamespace(
            success=True,
            grid_image_path=str(output_path),
            error=None,
            beat_count=1,
            grid_rows=1,
            grid_cols=1,
        )
        callback(
            {
                "event": "started",
                "completed": 0,
                "total": 2,
                "active": 2,
                "reused": 0,
                "grid_index": 1,
            }
        )
        callback(
            {
                "event": "completed",
                "completed": 1,
                "total": 2,
                "active": 1,
                "reused": 0,
                "grid_index": 1,
                "success": True,
            }
        )
        kwargs["grid_completed_callback"](
            {
                "grid_index": 1,
                "result": completed_result,
                "beats": [{**_beats(1)[0], "scene_ref": {"scene_id": "S"}}],
                "beat_numbers": [1],
                "rows": 1,
                "cols": 1,
                "reused": False,
            }
        )
        return [
            completed_result,
            SimpleNamespace(
                success=False,
                grid_image_path=None,
                error="HTTP 503",
                beat_count=1,
                grid_rows=1,
                grid_cols=1,
            ),
        ]

    def fake_save_grid_and_split(**kwargs):
        save_calls.append(kwargs)
        return {
            "grid_path": str(output_path),
            "cell_paths": [Path("beat_01.png")],
            "added": 1,
            "skipped": 0,
        }

    def fake_log(_manager, _ctx, _task_type, _episode, message, **kwargs):
        log_calls.append({"message": message, **kwargs})

    monkeypatch.setattr(render_runner, "_ensure_scene_refs_for_beats", fake_scene_refs)
    monkeypatch.setattr(render_runner, "_log", fake_log)
    monkeypatch.setattr(
        "ai_anime.modules.production.public.regenerate_selected_beats",
        fake_regenerate_selected_beats,
    )
    monkeypatch.setattr(
        "ai_anime.modules.production.public.save_grid_and_split",
        fake_save_grid_and_split,
    )

    with pytest.raises(RuntimeError, match="有 1 个网格生成失败"):
        await render_runner._run_selected_regen_async(
            {
                "__run_task_id": "task-run-1",
                "task_type": "sketch_regen",
                "episode": 1,
                "scope": "1x1_2-3__beats",
                "payload": {
                    "output_dir": str(context.output_dir),
                    "mode_key": "1x1_2-3",
                    "config": {
                        "model": "test-image-model",
                        "mode_key": "1x1_2-3",
                        "selected_beat_numbers": [1, 2],
                        "beats": [
                            {**beat, "scene_ref": {"scene_id": "S"}}
                            for beat in _beats(2)
                        ],
                        "character_map": {},
                    },
                },
            },
            context,
            is_sketch=True,
        )

    completed_log = next(
        call for call in log_calls if "网格 1/2 生成完成；已处理 1/2" in call["message"]
    )
    assert completed_log["progress"] == pytest.approx(0.44)
    assert completed_log["expected_task_id"] == "task-run-1"
    assert len(save_calls) == 1
    assert save_calls[0]["beat_nums"] == [1]
