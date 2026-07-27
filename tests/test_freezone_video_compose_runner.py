from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.project_workspace.public import ProjectContext


def _ctx(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="proj_compose_123",
        project_name="demo",
        owner_type="user",
        owner_id="user_owner",
        owner_username="alice",
        requester_user_id="user_editor",
        requester_username="bob",
        requester_principals=(("user", "user_editor"),),
        effective_role="editor",
        home_node_id="node_a",
        output_dir=tmp_path / "output" / "alice" / "demo",
        state_dir=tmp_path / "state" / "alice" / "demo",
        runtime_dir=tmp_path / "runtime" / "alice" / "demo",
        is_home_node=True,
    )


@pytest.mark.asyncio
async def test_video_compose_runner_preserves_payload_and_public_result(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.task_backend.runners import freezone as freezone_runner

    ctx = _ctx(tmp_path)
    project_dir = Path(ctx.output_dir)
    output_path = (
        project_dir
        / "freezone"
        / "_outputs"
        / "freezone_video_compose"
        / "job.mp4"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(b"video")
    captured: dict[str, object] = {}

    class FakeTaskManager:
        def update_progress_for_project(self, *_args, **_kwargs):
            pass

    async def fake_run_freezone_video_compose(**kwargs):
        captured.update(kwargs)
        return output_path

    tracks = [
        {
            "track_id": "video-track",
            "kind": "video",
            "items": [{"item_id": "clip-1", "source_path": "clip.mp4"}],
        }
    ]
    monkeypatch.setattr(freezone_runner, "get_task_manager", lambda: FakeTaskManager())
    monkeypatch.setattr(
        "ai_anime.freezone.jobs.run_freezone_video_compose",
        fake_run_freezone_video_compose,
    )

    result = await freezone_runner._run_freezone_video_compose_async(
        {
            "task_type": "freezone_video_compose",
            "payload": {
                "job_id": "job",
                "project_dir": str(project_dir),
                "title": "Final cut",
                "canvas_id": "canvas-1",
                "resolution": "720p",
                "fps": 24,
                "background_color": "#101010",
                "keep_original_audio": False,
                "tracks": tracks,
            },
        },
        ctx,
    )

    assert captured == {
        "project_dir": project_dir,
        "job_id": "job",
        "title": "Final cut",
        "canvas_id": "canvas-1",
        "resolution": "720p",
        "fps": 24,
        "background_color": "#101010",
        "keep_original_audio": False,
        "tracks": tracks,
    }
    assert result["job_id"] == "job"
    assert result["output_format"] == "mp4"
    assert result["output_path"] == str(output_path)
    assert result["output_url"].startswith("/static/projects/proj_compose_123/")
    assert "/alice/demo/" not in result["output_url"]
