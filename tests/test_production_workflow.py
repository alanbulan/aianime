from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import ValidationError


def test_production_workflow_request_rejects_removed_fields() -> None:
    from ai_anime.api.routes.production.workflow_schemas import (
        ProductionWorkflowRequest,
    )

    with pytest.raises(ValidationError):
        ProductionWorkflowRequest.model_validate({"video_backend": "old-route"})


@pytest.mark.asyncio
async def test_production_workflow_route_submits_one_parent_task(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.api.routes.production import workflow as workflow_route
    from ai_anime.api.routes.production.workflow_schemas import (
        ProductionWorkflowRequest,
    )

    context = SimpleNamespace(project_id="project-1")
    submissions = []

    async def resolve_project_scope(project, user, *, required_role):
        assert project == "project-1"
        assert user == {"id": "user-1"}
        assert required_role == "editor"
        return SimpleNamespace(ctx=context)

    class _Submissions:
        async def submit(self, ctx, submission):
            assert ctx is context
            submissions.append(submission)
            return SimpleNamespace(
                task_id="production-1",
                task_key="task:production_workflow:project:project-1:0:scope",
                backend="inline",
                queue="workflow",
            )

    monkeypatch.setattr(workflow_route, "resolve_project_scope", resolve_project_scope)
    monkeypatch.setattr(
        workflow_route,
        "project_task_submission_use_cases",
        lambda: _Submissions(),
    )

    response = await workflow_route.start_production_workflow(
        "project-1",
        ProductionWorkflowRequest(
            episodes=[2, 1, 2],
            target_beats=12,
            max_parallel=6,
        ),
        user={"id": "user-1"},
    )

    assert response["task_type"] == "production_workflow"
    assert len(submissions) == 1
    assert submissions[0].task_type == "production_workflow"
    assert submissions[0].queue_kind == "workflow"
    assert submissions[0].episode == 0
    assert submissions[0].payload["episodes"] == [2, 1]
    assert submissions[0].payload["target_beats"] == 12
    assert submissions[0].scope.startswith("production_workflow__")


@pytest.mark.asyncio
async def test_production_runner_owns_the_complete_stage_order(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.task_execution.infrastructure.runners import (
        production_workflow as runner,
    )

    calls: list[str] = []
    captured_options = []
    force_flags: dict[str, bool] = {}

    class _Reporter:
        def __init__(self, context, envelope) -> None:
            pass

        def update(self, progress, message) -> None:
            calls.append(f"progress:{message}")

    class _ScriptExecutor:
        def __init__(self, runtime) -> None:
            pass

        async def execute(self, options, *, timeout_seconds):
            captured_options.append(options)
            calls.append("script")
            return {
                "completed_nodes": ["script:ep001"],
                "batches": [["script:ep001"]],
            }

    async def load_story_state(_context):
        return [], [SimpleNamespace(number=1)]

    async def stage(name, *args, **kwargs):
        calls.append(name)

    beats = [{"beat_number": 1, "video_mode": "first", "video_prompt": "move"}]

    async def episode_beats(_context, episode):
        assert episode == 1
        return beats

    async def ensure_sketches(*args, **kwargs):
        calls.append("sketches")
        force_flags["sketches"] = kwargs.get("force", False)
        path = tmp_path / "sketches" / "ep001" / "beat_01.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"x")
        return [path]

    async def ensure_optimization(*args, **kwargs):
        calls.append("optimize")
        force_flags["optimize"] = kwargs.get("force", False)
        return beats

    async def ensure_prompts(*args, **kwargs):
        calls.append("prompts")
        force_flags["prompts"] = kwargs.get("force", False)
        return beats

    async def ensure_composed(*args, **kwargs):
        calls.append("compose")
        force_flags["compose"] = kwargs.get("force", False)
        path = tmp_path / "videos" / "episodes" / "ep001_final.mp4"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"x")
        return path

    async def forced_stage(name, *args, **kwargs):
        calls.append(name)
        force_flags[name] = kwargs.get("force", False)

    monkeypatch.setattr(runner, "_ProgressReporter", _Reporter)
    monkeypatch.setattr(
        runner, "ProjectScriptWorkflowRuntime", lambda **kwargs: object()
    )
    monkeypatch.setattr(runner, "ScriptWorkflowExecutor", _ScriptExecutor)
    monkeypatch.setattr(runner, "_load_story_state", load_story_state)
    monkeypatch.setattr(
        runner,
        "_resolve_production_image_models",
        lambda: (calls.append("models") or ("image-generation", "image-edit")),
    )
    monkeypatch.setattr(
        runner,
        "_plan_missing_props",
        lambda *args, **kwargs: stage("props"),
    )
    monkeypatch.setattr(
        runner,
        "_generate_missing_world_assets",
        lambda *args, **kwargs: stage("assets"),
    )
    monkeypatch.setattr(runner, "_episode_beats", episode_beats)
    monkeypatch.setattr(
        runner,
        "_reconcile_episode_identity_markers",
        lambda *args, **kwargs: stage("markers"),
    )
    monkeypatch.setattr(
        runner,
        "_assign_colors",
        lambda *args, **kwargs: stage("colors"),
    )
    monkeypatch.setattr(runner, "_ensure_sketches", ensure_sketches)
    monkeypatch.setattr(
        runner,
        "_ensure_detection",
        lambda *args, **kwargs: stage("detection"),
    )
    monkeypatch.setattr(runner, "_ensure_global_optimization", ensure_optimization)
    monkeypatch.setattr(
        runner,
        "_ensure_audio_prerequisites",
        lambda *args, **kwargs: forced_stage("audio_prereq", *args, **kwargs),
    )
    monkeypatch.setattr(
        runner,
        "_ensure_first_frames",
        lambda *args, **kwargs: forced_stage("frames", *args, **kwargs),
    )
    monkeypatch.setattr(runner, "_ensure_seedance_prompts", ensure_prompts)
    monkeypatch.setattr(
        runner,
        "_ensure_audio",
        lambda *args, **kwargs: forced_stage("audio", *args, **kwargs),
    )
    monkeypatch.setattr(
        runner,
        "_ensure_videos",
        lambda *args, **kwargs: forced_stage("videos", *args, **kwargs),
    )
    monkeypatch.setattr(runner, "_ensure_composed", ensure_composed)
    monkeypatch.setattr(
        runner,
        "load_project_config",
        lambda username, project: {"aspect_ratio": "2:3"},
    )

    context = SimpleNamespace(
        output_dir=tmp_path,
        owner_username="alice",
        project_name="demo",
    )
    result = await runner._run_production_workflow(
        {
            "payload": {"episodes": [1], "target_beats": 12},
            "scope": "scope",
            "__run_task_id": "parent",
        },
        context,
    )

    assert captured_options[0].target_beats == 12
    assert [call for call in calls if not call.startswith("progress:")] == [
        "script",
        "models",
        "props",
        "assets",
        "markers",
        "colors",
        "sketches",
        "detection",
        "optimize",
        "audio_prereq",
        "frames",
        "prompts",
        "audio",
        "videos",
        "compose",
    ]
    assert force_flags == {
        "sketches": True,
        "optimize": True,
        "audio_prereq": True,
        "frames": True,
        "prompts": True,
        "audio": True,
        "videos": True,
        "compose": True,
    }
    assert result["completed_episodes"] == [1]
    assert result["episodes"] == [
        {
            "episode": 1,
            "beats": 1,
            "final_video": "videos/episodes/ep001_final.mp4",
        }
    ]


def test_production_workflow_reports_missing_image_edit_model() -> None:
    from ai_anime.modules.model_usage.public import configure_model_access
    from ai_anime.modules.task_execution.infrastructure.runners import (
        production_workflow as runner,
    )

    configure_model_access(
        allows_custom_models=False,
        mode="mixed",
        model_assignments=[
            {"modelId": "generation-only", "role": "IMAGE_GENERATION"},
        ],
    )

    with pytest.raises(
        runner.ProductionWorkflowModelPrerequisitesMissing,
        match="IMAGE_EDIT",
    ) as caught:
        runner._resolve_production_image_models()

    assert caught.value.code == "model_prereq_required"
    assert caught.value.action_required is True


@pytest.mark.asyncio
async def test_production_workflow_repairs_legacy_identity_markers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.modules.task_execution.infrastructure.runners import (
        production_workflow as runner,
    )

    episode = SimpleNamespace(
        identity_ids=["林舟_日常"],
        identity_default_map={"林舟": "林舟_日常"},
        prop_menu=[],
    )
    character = SimpleNamespace(
        name="林舟",
        aliases=[],
        identities=[SimpleNamespace(identity_id="林舟_日常")],
    )
    beat = {
        "beat_number": 1,
        "visual_description": "林舟推开房门",
        "detected_identities": ["__NO_CHARACTER__"],
        "detected_props": None,
    }
    updates: list[dict[str, object]] = []

    class _Store:
        def get_episode(self, episode_num):
            assert episode_num == 1
            return episode

        def get_all_characters(self):
            return [character]

        async def get_beats_as_dicts(self, episode_num):
            assert episode_num == 1
            return [beat]

        async def close(self):
            return None

    async def update_episode_script_beat(
        store,
        *,
        episode_num,
        beat_num,
        updates: dict[str, object],
    ):
        assert isinstance(store, _Store)
        assert episode_num == beat_num == 1
        updates_copy = dict(updates)
        captured.append(updates_copy)
        return updates_copy

    captured: list[dict[str, object]] = updates

    async def make_store(context):
        return _Store()

    monkeypatch.setattr(
        runner,
        "make_sqlite_store_for_context",
        make_store,
    )
    monkeypatch.setattr(
        runner,
        "update_episode_script_beat",
        update_episode_script_beat,
    )

    changed = await runner._reconcile_episode_identity_markers(object(), 1)

    assert changed == 1
    assert updates == [
        {
            "visual_description": "{{林舟_日常}}推开房门",
            "detected_identities": ["林舟_日常"],
            "detected_props": ["__NO_PROP__"],
        }
    ]


def test_production_workflow_resolves_exact_composition_resolution() -> None:
    from ai_anime.modules.production.public import (
        resolve_episode_video_resolution,
    )

    assert resolve_episode_video_resolution("1080p", "16:9") == "1920x1080"
    assert resolve_episode_video_resolution("1920x1080", "2:3") == "1080x1920"
    assert resolve_episode_video_resolution(None, "2:3") == "720x1280"
    with pytest.raises(ValueError, match="不支持的视频分辨率"):
        resolve_episode_video_resolution("480p", "16:9")


@pytest.mark.asyncio
async def test_production_workflow_generates_missing_seedance_prompts(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.narrative_planning import public as narrative_public
    from ai_anime.modules.production import public as production_public
    from ai_anime.modules.task_execution.infrastructure.runners import (
        production_workflow as runner,
    )

    beats = [
        {
            "beat_number": 1,
            "seedance2_config_json": '{"final_prompt":"already ready"}',
        },
        {"beat_number": 2, "seedance2_config_json": "{}"},
    ]
    generated: list[int] = []

    class _Store:
        closed = False

        async def close(self):
            self.closed = True

    store = _Store()

    async def fake_generate(candidate, command):
        assert candidate is store
        generated.append(command.beat_num)
        beat = next(
            item for item in beats if item["beat_number"] == command.beat_num
        )
        beat["seedance2_config_json"] = (
            f'{{"final_prompt":"generated-{command.beat_num}"}}'
        )
        return SimpleNamespace(final_prompt=f"generated-{command.beat_num}")

    async def episode_beats(_context, episode_num):
        assert episode_num == 1
        return beats

    async def make_store(_context):
        return store

    monkeypatch.setattr(
        runner,
        "make_sqlite_store_for_context",
        make_store,
    )
    monkeypatch.setattr(runner, "_episode_beats", episode_beats)
    monkeypatch.setattr(
        narrative_public,
        "generate_seedance2_beat_prompt",
        fake_generate,
    )
    monkeypatch.setattr(
        production_public,
        "resolve_video_generation_route",
        lambda *_args: SimpleNamespace(model="seedance-2.0"),
    )
    monkeypatch.setattr(production_public, "is_seedance2_model", lambda _model: True)

    class _Reporter:
        def update(self, _progress, _message):
            return None

    context = SimpleNamespace(
        owner_username="alice",
        requester_username="alice",
        requester_user_id="user-1",
        project_id="project-1",
        project_name="demo",
        output_dir=tmp_path,
    )
    result = await runner._ensure_seedance_prompts(
        context,
        1,
        beats,
        requested_model=None,
        reporter=_Reporter(),
        progress=0.5,
    )

    assert generated == [2]
    assert store.closed is True
    assert result == beats
