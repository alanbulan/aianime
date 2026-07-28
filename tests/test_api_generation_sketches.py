import pytest

from ai_anime.modules.production.application.sketch_generation import (
    ScheduledSketchGeneration,
    SketchGenerationRejected,
    SketchGenerationTaskReceipt,
)


@pytest.mark.asyncio
async def test_generate_sketches_route_maps_request_to_application(
    monkeypatch,
) -> None:
    from ai_anime.api.production_sketch_schemas import SketchGenerateRequest
    from ai_anime.api.routes import production_sketch

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
            return ScheduledSketchGeneration(
                episode_num=2,
                requested_grid_index=-1,
                grid_plan=((1, 1), (1, 1)),
                receipts=(
                    SketchGenerationTaskReceipt(
                        grid_index=0,
                        scope="grid_0",
                        task_id="task-0",
                        task_key=(
                            "task:sketch_generation:project:proj-1:2:grid_0"
                        ),
                        backend="celery",
                        queue="default",
                    ),
                    SketchGenerationTaskReceipt(
                        grid_index=1,
                        scope="grid_1",
                        task_id="task-1",
                        task_key=(
                            "task:sketch_generation:project:proj-1:2:grid_1"
                        ),
                        backend="celery",
                        queue="default",
                    ),
                ),
            )

    monkeypatch.setattr(production_sketch, "resolve_project_scope", resolve)
    monkeypatch.setattr(
        production_sketch,
        "sketch_generation_use_cases",
        lambda: UseCases(),
    )
    request = SketchGenerateRequest(
        style="ink",
        model="nanobanana",
        grid_index=-1,
        sketch_scene_grouping=True,
        aspect_ratio="16:9",
        image_generation_selection="openrouter_nanobanana2",
    )

    response = await production_sketch.generate_sketches(
        project="demo",
        episode_num=2,
        body=request,
        user={"username": "alice"},
    )

    assert response == {
        "ok": True,
        "task_type": "sketch_generation",
        "backend": "celery",
        "data": {
            "dispatched": 2,
            "tasks": [
                {
                    "grid_index": 0,
                    "scope": "grid_0",
                    "task_id": "task-0",
                    "task_key": (
                        "task:sketch_generation:project:proj-1:2:grid_0"
                    ),
                    "backend": "celery",
                    "queue": "default",
                },
                {
                    "grid_index": 1,
                    "scope": "grid_1",
                    "task_id": "task-1",
                    "task_key": (
                        "task:sketch_generation:project:proj-1:2:grid_1"
                    ),
                    "backend": "celery",
                    "queue": "default",
                },
            ],
            "scopes": ["grid_0", "grid_1"],
        },
        "message": "第 2 集全集草图生成已进入队列 (1x1 + 1x1)",
    }
    target_context, command = calls[0]
    assert target_context is context
    assert command.episode_num == 2
    assert command.grid_index == -1
    assert command.style == "ink"
    assert command.model == "nanobanana"
    assert command.sketch_scene_grouping is True
    assert command.aspect_ratio == "16:9"
    assert command.image_generation_selection == "openrouter_nanobanana2"


@pytest.mark.asyncio
async def test_generate_sketches_route_preserves_rejection_envelope(
    monkeypatch,
) -> None:
    from ai_anime.api.production_sketch_schemas import SketchGenerateRequest
    from ai_anime.api.routes import production_sketch

    async def resolve(*_args, **_kwargs):
        return type("Resolution", (), {"ctx": object()})()

    class UseCases:
        async def generate(self, _context, _command):
            raise SketchGenerationRejected("No beats found for episode 2")

    monkeypatch.setattr(production_sketch, "resolve_project_scope", resolve)
    monkeypatch.setattr(
        production_sketch,
        "sketch_generation_use_cases",
        lambda: UseCases(),
    )

    response = await production_sketch.generate_sketches(
        project="demo",
        episode_num=2,
        body=SketchGenerateRequest(),
        user={"username": "alice"},
    )

    assert response == {
        "ok": False,
        "error": "No beats found for episode 2",
    }
