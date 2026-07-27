from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from ai_anime.modules.creative_canvas.application.job_results import (
    CreativeCanvasJobResultQueries,
    GetCreativeCanvasJobResultQuery,
    public_creative_canvas_video_story_result,
)
from ai_anime.modules.creative_canvas.infrastructure.job_results import (
    LocalCreativeCanvasJobResultReader,
)
from ai_anime.modules.project_workspace.public import ProjectContext


class _Reader:
    def __init__(self) -> None:
        self.queries: list[GetCreativeCanvasJobResultQuery] = []

    def read(self, query: GetCreativeCanvasJobResultQuery) -> dict:
        self.queries.append(query)
        return {"ok": True, "data": {"url": "/media/result.png"}}


class _TaskManager:
    def __init__(self, task=None) -> None:
        self.task = task

    def get_task_for_project(self, _context, _task_type, _episode, *, scope):
        assert scope
        return self.task


def _context(project_dir: Path) -> ProjectContext:
    return ProjectContext(
        project_id="project-1",
        project_name="demo",
        owner_type="user",
        owner_id="owner-1",
        owner_username="owner",
        requester_user_id="owner-1",
        requester_username="owner",
        requester_principals=(("user", "owner-1"),),
        effective_role="owner",
        home_node_id="local",
        output_dir=project_dir,
        state_dir=project_dir / ".state",
        runtime_dir=project_dir / ".runtime",
        is_home_node=True,
    )


def _local_queries(project_dir: Path, task=None) -> CreativeCanvasJobResultQueries:
    return CreativeCanvasJobResultQueries(
        LocalCreativeCanvasJobResultReader(
            task_manager_factory=lambda: _TaskManager(task),
            static_url_builder=lambda _ctx, relative, _local=None: f"/media/{relative}",
        )
    )


def test_job_result_queries_delegate_to_reader(tmp_path: Path) -> None:
    reader = _Reader()
    queries = CreativeCanvasJobResultQueries(reader)
    query = GetCreativeCanvasJobResultQuery(
        context=SimpleNamespace(),
        project_dir=tmp_path,
        task_type="freezone_gen",
        job_id="job-1",
    )

    result = queries.get_result(query)

    assert result == {"ok": True, "data": {"url": "/media/result.png"}}
    assert reader.queries == [query]


def test_public_video_story_result_removes_private_paths() -> None:
    result = public_creative_canvas_video_story_result(
        {
            "output_path": "C:/private/story.json",
            "frame_paths": ["C:/private/frame.png"],
            "output_url": "/media/story.json",
            "frame_urls": ["/media/frame.png"],
        }
    )

    assert result == {
        "output_url": "/media/story.json",
        "frame_urls": ["/media/frame.png"],
    }


def test_image_to_three_gs_result_falls_back_to_disk_artifact(tmp_path: Path) -> None:
    artifact = (
        tmp_path
        / "freezone"
        / "_outputs"
        / "freezone_image_to_3gs"
        / "job-3gs"
        / "scene.sog"
    )
    artifact.parent.mkdir(parents=True)
    artifact.write_bytes(b"sog-data")

    result = _local_queries(tmp_path).get_result(
        GetCreativeCanvasJobResultQuery(
            context=_context(tmp_path),
            project_dir=tmp_path,
            task_type="freezone_image_to_3gs",
            job_id="job-3gs",
        )
    )

    assert result["ok"] is True
    assert result["data"]["splat_format"] == "sog"
    assert result["data"]["splat_url"].endswith("/scene.sog")
    assert result["data"]["size"] == len(b"sog-data")


def test_audio_separation_result_projects_both_outputs_and_push_metadata(
    tmp_path: Path,
) -> None:
    output_dir = tmp_path / "freezone" / "_outputs" / "freezone_audio_separate"
    output_dir.mkdir(parents=True)
    (output_dir / "job-audio.m4a").write_bytes(b"audio")
    (output_dir / "job-audio_mute.mp4").write_bytes(b"video")
    task = SimpleNamespace(
        status="completed",
        result={
            "pushable": True,
            "slot_target": {"kind": "beat_audio", "episode": 1, "beat": 2},
        },
    )

    result = _local_queries(tmp_path, task).get_result(
        GetCreativeCanvasJobResultQuery(
            context=_context(tmp_path),
            project_dir=tmp_path,
            task_type="freezone_audio_separate",
            job_id="job-audio",
        )
    )

    assert result == {
        "ok": True,
        "data": {
            "audio_url": (
                "/media/freezone/_outputs/freezone_audio_separate/job-audio.m4a"
            ),
            "audio_size": len(b"audio"),
            "mute_video_url": (
                "/media/freezone/_outputs/freezone_audio_separate/job-audio_mute.mp4"
            ),
            "mute_video_size": len(b"video"),
            "pushable": True,
            "slot_target": {"kind": "beat_audio", "episode": 1, "beat": 2},
        },
    }
