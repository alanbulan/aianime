from pathlib import Path

import pytest

from ai_anime.modules.production.application.single_video import (
    ScheduledSingleVideo,
    SingleVideoRejected,
)


@pytest.mark.asyncio
async def test_single_video_route_maps_request_to_application(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.api.routes.production import video as production_video
    from ai_anime.api.routes.production.video_schemas import SingleVideoRequest

    context = object()
    calls = []

    async def resolve(project, user, required_role="editor"):
        assert project == "demo"
        assert user == {"username": "alice"}
        assert required_role == "editor"
        return type("Resolution", (), {"ctx": context})()

    class UseCases:
        async def generate(self, target_context, command):
            calls.append((target_context, command))
            return ScheduledSingleVideo(
                task_id="task-1",
                task_key="task:single_video:project:proj-1:3:2",
                backend="celery",
                queue="node.local.video",
                episode_num=3,
                beat_num=2,
            )

    monkeypatch.setattr(production_video, "resolve_project_scope", resolve)
    monkeypatch.setattr(production_video, "single_video_use_cases", lambda: UseCases())
    request = SingleVideoRequest(
        model="seedance-2.0-fast",
        resolution="1080p",
        duration=9,
        ratio="16:9",
        generate_audio=False,
        return_last_frame=True,
        final_prompt="fresh prompt",
    )

    response = await production_video.generate_single_video(
        project="demo",
        episode_num=3,
        beat_num=2,
        body=request,
        user={"username": "alice"},
    )

    assert response == {
        "ok": True,
        "task_type": "single_video",
        "task_id": "task-1",
        "task_key": "task:single_video:project:proj-1:3:2",
        "backend": "celery",
        "queue": "node.local.video",
        "message": "第 3 集 Beat 2 视频生成已入队",
    }
    target_context, command = calls[0]
    assert target_context is context
    assert command.episode_num == 3
    assert command.beat_num == 2
    assert command.video_model == "seedance-2.0-fast"
    assert command.resolution == "1080p"
    assert command.duration == 9
    assert command.ratio == "16:9"
    assert command.generate_audio is False
    assert command.return_last_frame is True
    assert command.final_prompt == "fresh prompt"
    assert command.provided_fields == request.model_fields_set


@pytest.mark.asyncio
async def test_single_video_route_preserves_rejection_envelope(
    monkeypatch,
) -> None:
    from ai_anime.api.routes.production import video as production_video
    from ai_anime.api.routes.production.video_schemas import SingleVideoRequest

    async def resolve(*_args, **_kwargs):
        return type("Resolution", (), {"ctx": object()})()

    class UseCases:
        async def generate(self, _context, _command):
            raise SingleVideoRejected("Beat 2 not found")

    monkeypatch.setattr(production_video, "resolve_project_scope", resolve)
    monkeypatch.setattr(production_video, "single_video_use_cases", lambda: UseCases())

    response = await production_video.generate_single_video(
        project="demo",
        episode_num=3,
        beat_num=2,
        body=SingleVideoRequest(model="cloud-video-standard"),
        user={"username": "alice"},
    )

    assert response == {"ok": False, "error": "Beat 2 not found"}
