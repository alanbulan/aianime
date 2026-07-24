from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.api.schemas import VideoComposeRequest
from ai_anime.modules.production.public import (
    ComposeEpisodeVideoCommand,
    EpisodeBeatsMissing,
    FinalEpisodeVideoStatus,
)


@pytest.mark.asyncio
async def test_compose_video_maps_request_and_scheduled_task(monkeypatch) -> None:
    from ai_anime.api.routes import generation

    context = SimpleNamespace(output_dir=Path("project"), project_id="proj-1")
    commands: list[tuple[object, ComposeEpisodeVideoCommand]] = []

    async def resolve_project(project: str, user: dict, required_role: str):
        assert (project, user, required_role) == (
            "demo",
            {"username": "alice"},
            "editor",
        )
        return SimpleNamespace(ctx=context)

    class _UseCases:
        async def compose(self, candidate, command):
            commands.append((candidate, command))
            return SimpleNamespace(
                as_dict=lambda: {
                    "task_type": "compose_episode",
                    "task_id": "task-1",
                    "task_key": "task:compose_episode:project:proj-1:2",
                    "backend": "inline",
                    "queue": "inline",
                    "message": "第 2 集成片合成已进入队列",
                }
            )

    monkeypatch.setattr(generation, "_resolve_generation_project", resolve_project)
    monkeypatch.setattr(generation, "episode_video_use_cases", _UseCases)

    response = await generation.compose_video(
        project="demo",
        episode_num=2,
        body=VideoComposeRequest(
            add_subtitles=False,
            add_bgm=True,
            resolution="1080x1920",
        ),
        user={"username": "alice"},
    )

    assert response == {
        "ok": True,
        "task_type": "compose_episode",
        "task_id": "task-1",
        "task_key": "task:compose_episode:project:proj-1:2",
        "backend": "inline",
        "queue": "inline",
        "message": "第 2 集成片合成已进入队列",
    }
    assert commands == [
        (
            context,
            ComposeEpisodeVideoCommand(
                episode_num=2,
                add_subtitles=False,
                add_bgm=True,
                resolution="1080x1920",
            ),
        )
    ]


@pytest.mark.asyncio
async def test_compose_video_keeps_no_beats_error_envelope(monkeypatch) -> None:
    from ai_anime.api.routes import generation

    async def resolve_project(*_args, **_kwargs):
        return SimpleNamespace(ctx=object())

    class _UseCases:
        async def compose(self, _context, command):
            raise EpisodeBeatsMissing(command.episode_num)

    monkeypatch.setattr(generation, "_resolve_generation_project", resolve_project)
    monkeypatch.setattr(generation, "episode_video_use_cases", _UseCases)

    response = await generation.compose_video(
        project="demo",
        episode_num=2,
        body=VideoComposeRequest(),
        user={"username": "alice"},
    )

    assert response == {"ok": False, "error": "No beats found for episode 2"}


@pytest.mark.asyncio
async def test_final_video_maps_application_status(monkeypatch) -> None:
    from ai_anime.api.routes import generation

    context = object()

    async def resolve_project(project: str, user: dict, required_role: str):
        assert (project, user, required_role) == (
            "demo",
            {"username": "alice"},
            "viewer",
        )
        return SimpleNamespace(ctx=context)

    class _UseCases:
        def final_status(self, candidate, episode_num: int):
            assert (candidate, episode_num) == (context, 2)
            return FinalEpisodeVideoStatus(
                exists=True,
                filename="ep002_final.mp4",
                video_url="/static/projects/proj-1/videos/episodes/ep002_final.mp4",
            )

    monkeypatch.setattr(generation, "_resolve_generation_project", resolve_project)
    monkeypatch.setattr(generation, "episode_video_use_cases", _UseCases)

    response = await generation.get_final_video(
        project="demo",
        episode_num=2,
        user={"username": "alice"},
    )

    assert response == {
        "ok": True,
        "data": {
            "exists": True,
            "filename": "ep002_final.mp4",
            "video_url": "/static/projects/proj-1/videos/episodes/ep002_final.mp4",
        },
    }
