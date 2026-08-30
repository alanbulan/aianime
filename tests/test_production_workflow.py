from __future__ import annotations

import os
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
async def test_production_failure_cancels_only_owned_active_descendants(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.modules.task_execution.infrastructure.runners import (
        production_workflow,
    )

    context = SimpleNamespace(project_id="project-1")

    def task(
        task_id: str,
        task_type: str,
        status: str,
        parent_task_id: str = "",
    ) -> SimpleNamespace:
        metadata = {"parent_task_id": parent_task_id} if parent_task_id else {}
        return SimpleNamespace(
            task_id=task_id,
            task_type=task_type,
            episode=1,
            beat_num=None,
            scope=None,
            status=status,
            progress=0.0,
            current_task="",
            error=None,
            result=None,
            metadata=metadata,
        )

    tasks = [
        task("child-1", "owned_child", "running", "parent-1"),
        task("grandchild-1", "owned_grandchild", "queued", "child-1"),
        task("completed-child", "owned_completed", "completed", "parent-1"),
        task("shared-1", "shared_child", "running"),
    ]
    cancelled = []

    class _Tasks:
        def list_for_project(self, _context):
            return tasks

        async def cancel(self, _context, reference):
            cancelled.append(reference)
            return True

    async def fail_workflow(_envelope, _context):
        raise RuntimeError("parent failed")

    use_cases = _Tasks()
    monkeypatch.setattr(
        production_workflow,
        "project_task_use_cases",
        lambda: use_cases,
    )
    monkeypatch.setattr(
        production_workflow,
        "_run_production_workflow_steps",
        fail_workflow,
    )

    with pytest.raises(RuntimeError, match="parent failed"):
        await production_workflow._run_production_workflow(
            {"__run_task_id": "parent-1"},
            context,
        )

    assert [reference.task_type for reference in cancelled] == [
        "owned_grandchild",
        "owned_child",
    ]


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
            spine_template="drama",
            visual_style="anime",
            ethnicity="Japanese",
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
    assert submissions[0].payload["spine_template"] == "drama"
    assert submissions[0].payload["visual_style"] == "anime"
    assert submissions[0].payload["ethnicity"] == "Japanese"
    assert submissions[0].payload["video_routing_policy"] == "project_selection"
    assert submissions[0].scope.startswith("production_workflow__")


@pytest.mark.asyncio
async def test_ensure_sketches_resumes_from_existing_beat_assets(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production import public as production_public
    from ai_anime.modules.task_execution.infrastructure.runners import (
        production_workflow as runner,
    )

    beats = [
        {
            "beat_number": number,
            "scene_ref": {"scene_id": "scene-1"},
        }
        for number in range(1, 9)
    ]
    sketches_dir = tmp_path / "sketches" / "ep001"
    sketches_dir.mkdir(parents=True)
    for number in range(1, 6):
        (sketches_dir / f"beat_{number:02d}.png").write_bytes(
            f"existing-{number}".encode()
        )

    selected_commands = []
    waited_tickets = []
    progress_messages = []

    class _SelectedRegeneration:
        async def regenerate(self, context, command):
            assert context.output_dir == tmp_path
            selected_commands.append(command)
            for number in command.beat_indices:
                (sketches_dir / f"beat_{number:02d}.png").write_bytes(
                    f"generated-{number}".encode()
                )
            return {
                "task_type": "sketch_regen",
                "task_id": "missing-sketches-1",
                "scope": "missing-sketches",
            }

    class _FullGeneration:
        async def generate(self, _context, _command):
            raise AssertionError("断点续跑不应触发整集草图生成")

    async def wait_ticket(_context, ticket, *, timeout_seconds):
        assert timeout_seconds == 60
        waited_tickets.append(ticket)
        return {"updated_beats": [6, 7, 8]}

    monkeypatch.setattr(
        production_public,
        "selected_regeneration_use_cases",
        lambda: _SelectedRegeneration(),
    )
    monkeypatch.setattr(
        production_public,
        "sketch_generation_use_cases",
        lambda: _FullGeneration(),
    )
    monkeypatch.setattr(runner, "_wait_ticket", wait_ticket)

    paths = await runner._ensure_sketches(
        SimpleNamespace(output_dir=tmp_path),
        1,
        beats,
        image_edit_model="image-edit",
        aspect_ratio="2:3",
        timeout_seconds=60,
        reporter=SimpleNamespace(
            update=lambda _progress, message: progress_messages.append(message)
        ),
        progress=0.5,
        force=False,
    )

    assert [path.name for path in paths] == [
        f"beat_{number:02d}.png" for number in range(1, 9)
    ]
    assert [command.beat_indices for command in selected_commands] == [
        (6,),
        (7,),
        (8,),
    ]
    assert all(
        command.image_generation_selection == "image-edit"
        for command in selected_commands
    )
    assert [ticket.task_type for ticket in waited_tickets] == [
        "sketch_regen",
        "sketch_regen",
        "sketch_regen",
    ]
    assert progress_messages == ["第 1 集补齐 3 个缺失草图"]
    for number in range(1, 6):
        assert (sketches_dir / f"beat_{number:02d}.png").read_bytes() == (
            f"existing-{number}".encode()
        )


@pytest.mark.asyncio
async def test_global_optimization_accepts_prompt_for_the_selected_video_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.modules.production import public as production_public
    from ai_anime.modules.task_execution.infrastructure.runners import (
        production_workflow as runner,
    )

    beats = [
        {
            "beat_number": 1,
            "video_mode": "keyframe",
            "video_prompt": "",
            "keyframe_prompt": "自然过渡到下一首帧",
        },
        {
            "beat_number": 2,
            "video_mode": "first_frame",
            "video_prompt": "从当前首帧开始运动",
            "keyframe_prompt": "",
        },
    ]

    async def episode_beats(_context, _episode):
        return beats

    class UnexpectedSchedule:
        async def schedule(self, *_args, **_kwargs):
            raise AssertionError("已有当前模式提示词时不应重新调度")

    monkeypatch.setattr(runner, "_episode_beats", episode_beats)
    monkeypatch.setattr(
        production_public,
        "global_video_optimization_use_cases",
        lambda: UnexpectedSchedule(),
    )

    result = await runner._ensure_global_optimization(
        object(),
        1,
        timeout_seconds=60,
        reporter=SimpleNamespace(update=lambda *_args: None),
        progress=0.5,
        force=False,
    )

    assert result == beats


@pytest.mark.asyncio
async def test_ensure_composed_rebuilds_final_older_than_source_media(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.task_execution.infrastructure.runners import (
        production_workflow as runner,
    )
    from ai_anime.shared.utils.path_resolver import PathResolver

    paths = PathResolver(tmp_path, 1)
    final_path = paths.final_video()
    final_path.parent.mkdir(parents=True, exist_ok=True)
    final_path.write_bytes(b"existing-final")
    video_path = paths.video(1)
    video_path.parent.mkdir(parents=True, exist_ok=True)
    video_path.write_bytes(b"newer-video")
    newer_time = final_path.stat().st_mtime_ns + 1_000_000
    os.utime(video_path, ns=(newer_time, newer_time))
    compose_calls = []

    class VideoUseCases:
        async def compose(self, _context, command):
            compose_calls.append(command)
            final_path.write_bytes(b"recomposed-final")
            return {"task_type": "compose_episode", "task_id": "compose-1"}

    from ai_anime.modules.production import public as production_public

    monkeypatch.setattr(
        production_public,
        "episode_video_use_cases",
        lambda: VideoUseCases(),
    )

    async def wait_ticket(*_args, **_kwargs):
        return {}

    monkeypatch.setattr(runner, "_wait_ticket", wait_ticket)

    result = await runner._ensure_composed(
        SimpleNamespace(output_dir=tmp_path),
        1,
        [{"beat_number": 1}],
        resolution="1280x720",
        add_subtitles=True,
        add_bgm=True,
        timeout_seconds=10,
        reporter=SimpleNamespace(update=lambda *_args: None),
        progress=0.9,
        force=False,
    )

    assert result == final_path
    assert final_path.read_bytes() == b"recomposed-final"
    assert len(compose_calls) == 1


@pytest.mark.asyncio
async def test_ensure_composed_preserves_current_final_without_rebuild(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.task_execution.infrastructure.runners import (
        production_workflow as runner,
    )
    from ai_anime.modules.production import public as production_public
    from ai_anime.shared.utils.path_resolver import PathResolver

    paths = PathResolver(tmp_path, 1)
    video_path = paths.video(1)
    video_path.parent.mkdir(parents=True, exist_ok=True)
    video_path.write_bytes(b"source-video")
    final_path = paths.final_video()
    final_path.parent.mkdir(parents=True, exist_ok=True)
    final_path.write_bytes(b"current-final")
    newer_time = video_path.stat().st_mtime_ns + 1_000_000
    os.utime(final_path, ns=(newer_time, newer_time))
    monkeypatch.setattr(
        production_public,
        "episode_video_use_cases",
        lambda: pytest.fail("current final must not be recomposed"),
    )

    result = await runner._ensure_composed(
        SimpleNamespace(output_dir=tmp_path),
        1,
        [{"beat_number": 1}],
        resolution="1280x720",
        add_subtitles=True,
        add_bgm=True,
        timeout_seconds=10,
        reporter=SimpleNamespace(update=lambda *_args: None),
        progress=0.9,
        force=False,
    )

    assert result == final_path
    assert final_path.read_bytes() == b"current-final"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    (
        "rebuild",
        "script_regenerated",
        "markers_changed",
        "expected_visual_force",
        "expected_audio_force",
    ),
    [
        (False, False, False, False, False),
        (False, True, False, False, False),
        (False, False, True, False, False),
        (True, False, False, True, True),
    ],
)
async def test_production_runner_owns_the_complete_stage_order(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    rebuild: bool,
    script_regenerated: bool,
    markers_changed: bool,
    expected_visual_force: bool,
    expected_audio_force: bool,
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
                "batches": [["script:ep001"]] if script_regenerated else [],
            }

    async def load_story_state(_context):
        return [], [SimpleNamespace(number=1)]

    async def stage(name, *args, **kwargs):
        calls.append(name)

    async def reconcile_markers(*args, **kwargs):
        calls.append("markers")
        return 15 if markers_changed else 0

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
        lambda: calls.append("models") or ("image-generation", "image-edit"),
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
        reconcile_markers,
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
        "_ensure_seedance_voice_prerequisites",
        lambda *args, **kwargs: forced_stage("seedance_voice", *args, **kwargs),
    )
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
            "payload": {
                "episodes": [1],
                "target_beats": 12,
                "rebuild": rebuild,
            },
            "scope": "scope",
            "__run_task_id": "parent",
        },
        context,
    )

    assert captured_options[0].target_beats == 12
    assert captured_options[0].rebuild is rebuild
    assert [call for call in calls if not call.startswith("progress:")] == [
        "script",
        "models",
        "props",
        "assets",
        "markers",
        "colors",
        "sketches",
        "detection",
        "frames",
        "optimize",
        "audio_prereq",
        "seedance_voice",
        "prompts",
        "audio",
        "videos",
        "compose",
    ]
    assert force_flags == {
        "sketches": expected_visual_force,
        "optimize": expected_visual_force,
        "audio_prereq": expected_audio_force,
        "frames": expected_visual_force,
        "prompts": expected_visual_force,
        "seedance_voice": expected_visual_force,
        "audio": expected_audio_force,
        "videos": expected_visual_force,
        "compose": expected_visual_force,
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
async def test_production_workflow_designs_and_rechecks_missing_voices(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production import public as production_public
    from ai_anime.modules.production.public import VoiceDesignRequirement
    from ai_anime.modules.task_execution.infrastructure.runners import (
        production_workflow as runner,
    )

    requirement = VoiceDesignRequirement(
        key="character:白石夏音:slot:youth",
        target="character_slot",
        label="白石夏音·学生时期",
        voice_prompt="清澈自然的青年女声",
        preview_text="我们回去吧。",
        character_name="白石夏音",
        identity_id="白石夏音_学生时期",
        slot="youth",
    )
    plans = [
        SimpleNamespace(
            errors=("Beat 06 角色声线缺失：白石夏音_学生时期",),
            voice_requirements=(requirement,),
        ),
        SimpleNamespace(errors=(), voice_requirements=()),
    ]
    plan_commands = []
    provisioned = []
    progress_messages: list[str] = []

    class _AudioUseCases:
        async def plan(self, context, command):
            plan_commands.append((context, command))
            return plans.pop(0)

    async def provision(context, requirements):
        provisioned.append((context, tuple(requirements)))
        return ("白石夏音·学生时期",)

    class _Reporter:
        def update(self, _progress, message):
            progress_messages.append(message)

    monkeypatch.setattr(
        production_public,
        "episode_audio_use_cases",
        lambda: _AudioUseCases(),
    )
    monkeypatch.setattr(
        production_public,
        "provision_voice_design_requirements",
        provision,
    )
    context = SimpleNamespace(output_dir=tmp_path)

    await runner._ensure_audio_prerequisites(
        context,
        1,
        [{"beat_number": 6}],
        reporter=_Reporter(),
        progress=0.5,
        force=True,
    )

    assert len(plan_commands) == 2
    assert plan_commands[0][1] is plan_commands[1][1]
    assert plan_commands[0][1].beat_numbers == [6]
    assert plan_commands[0][1].mode == "redo_all"
    assert provisioned == [(context, (requirement,))]
    assert progress_messages == [
        "第 1 集检查配音声线前置",
        "第 1 集自动设计 1 条缺失声线",
        "第 1 集重新检查配音声线前置",
    ]


@pytest.mark.asyncio
async def test_production_workflow_repairs_short_seedance_voice_before_video(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production import public as production_public
    from ai_anime.modules.task_execution.infrastructure.runners import (
        production_workflow as runner,
    )

    identity = SimpleNamespace(
        identity_id="白石夏音_学生时期",
        identity_name="学生时期",
        age_group="youth",
        reference_audio_path="",
    )
    character = SimpleNamespace(
        name="白石夏音",
        aliases=[],
        gender="女",
        age_group="youth",
        role="主角",
        description="性格克制",
        identities=[identity],
    )
    collect_calls = 0
    provisioned = []
    progress_messages: list[str] = []

    class _Store:
        def get_all_characters(self):
            return [character]

        async def close(self):
            return None

    async def make_store(_context):
        return _Store()

    def collect(**_kwargs):
        nonlocal collect_calls
        collect_calls += 1
        if collect_calls > 1:
            return []
        return [
            SimpleNamespace(
                beat_number=6,
                key="voice:白石夏音_学生时期",
                label="白石夏音 · 学生时期声线",
                media_type="audio",
                path="voice_youth.wav",
                reason="参考声线只有 1.04 秒，Seedance2 要求至少 1.8 秒。",
                identity_id="白石夏音_学生时期",
            )
        ]

    async def provision(context, requirements):
        provisioned.append((context, tuple(requirements)))
        return ("白石夏音·学生时期",)

    class _Reporter:
        def update(self, _progress, message):
            progress_messages.append(message)

    monkeypatch.setattr(runner, "make_sqlite_store_for_context", make_store)
    monkeypatch.setattr(
        production_public,
        "resolve_video_generation_route",
        lambda *_args, **_kwargs: SimpleNamespace(model="doubao-seedance-2.0"),
    )
    monkeypatch.setattr(
        production_public,
        "is_seedance2_model",
        lambda _model: True,
    )
    monkeypatch.setattr(
        production_public,
        "collect_seedance2_video_prereq_errors",
        collect,
    )
    monkeypatch.setattr(
        production_public,
        "provision_voice_design_requirements",
        provision,
    )
    context = SimpleNamespace(
        output_dir=tmp_path,
        owner_username="alice",
        project_name="demo",
    )

    await runner._ensure_seedance_voice_prerequisites(
        context,
        1,
        [
            {
                "beat_number": 6,
                "speaker": "白石夏音_学生时期",
                "dialogue": "你怎么在这里？",
            }
        ],
        requested_model=None,
        reporter=_Reporter(),
        progress=0.6,
    )

    assert collect_calls == 2
    assert len(provisioned) == 1
    requirement = provisioned[0][1][0]
    assert requirement.key == "character:白石夏音:slot:youth"
    assert requirement.preview_text == "你怎么在这里？"
    assert progress_messages == ["第 1 集重建 1 条不合规参考声线"]


@pytest.mark.asyncio
async def test_production_workflow_syncs_changed_audio_instead_of_only_missing(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production import public as production_public
    from ai_anime.modules.production.public import EpisodeAudioGenerationNotRequired
    from ai_anime.modules.task_execution.infrastructure.runners import (
        production_workflow as runner,
    )

    commands = []
    messages: list[str] = []

    class _AudioUseCases:
        async def generate(self, _context, command):
            commands.append(command)
            raise EpisodeAudioGenerationNotRequired()

    monkeypatch.setattr(
        production_public,
        "episode_audio_use_cases",
        lambda: _AudioUseCases(),
    )

    await runner._ensure_audio(
        SimpleNamespace(output_dir=tmp_path),
        1,
        [{"beat_number": 6}],
        timeout_seconds=10,
        reporter=SimpleNamespace(
            update=lambda _progress, message: messages.append(message)
        ),
        progress=0.6,
        force=False,
    )

    assert commands[0].mode == "sync_changed"
    assert commands[0].beat_numbers == [6]
    assert messages == ["第 1 集补齐或更新分镜配音"]


@pytest.mark.asyncio
async def test_production_workflow_generates_only_missing_beat_videos(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production import public as production_public
    from ai_anime.modules.task_execution.infrastructure.runners import (
        production_workflow as runner,
    )
    from ai_anime.shared.utils.path_resolver import PathResolver

    paths = PathResolver(tmp_path, 1)
    for beat_num in range(1, 6):
        path = paths.video(beat_num)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(f"existing-{beat_num}".encode())
    before = {number: paths.video(number).read_bytes() for number in range(1, 6)}
    commands = []

    class _SingleVideoUseCases:
        async def generate(self, _context, command):
            commands.append(command)
            output = paths.video(command.beat_num)
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(f"generated-{command.beat_num}".encode())
            return {
                "task_type": "single_video",
                "task_id": f"video-{command.beat_num}",
            }

    monkeypatch.setattr(
        production_public,
        "single_video_use_cases",
        lambda: _SingleVideoUseCases(),
    )

    def resolve_video_route(*_args, **kwargs):
        assert kwargs == {"routing_policy": "role_priority"}
        return SimpleNamespace(
            model="video-seeddance-4wlmqpxwma4r65j3",
            selector="",
        )

    monkeypatch.setattr(
        production_public,
        "resolve_video_generation_route",
        resolve_video_route,
    )

    async def wait_ticket(*_args, **_kwargs):
        return {}

    monkeypatch.setattr(runner, "_wait_ticket", wait_ticket)
    context = SimpleNamespace(
        output_dir=tmp_path,
        owner_username="alice",
        project_name="demo",
    )

    await runner._ensure_videos(
        context,
        1,
        [{"beat_number": number} for number in range(1, 8)],
        requested_model="cloud:stale-project-selection",
        video_routing_policy="role_priority",
        resolution="720x1280",
        aspect_ratio="2:3",
        use_director_render=False,
        timeout_seconds=10,
        reporter=SimpleNamespace(update=lambda *_args: None),
        progress=0.8,
        force=False,
    )

    assert [command.beat_num for command in commands] == [6, 7]
    assert all(
        command.provided_fields == frozenset({"resolution", "ratio"})
        and command.ratio == "2:3"
        and command.video_model == "video-seeddance-4wlmqpxwma4r65j3"
        and command.model_selector is None
        for command in commands
    )
    assert {number: paths.video(number).read_bytes() for number in range(1, 6)} == before


@pytest.mark.asyncio
async def test_production_workflow_reports_missing_voice_design_model(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production import public as production_public
    from ai_anime.modules.production.public import VoiceDesignRequirement
    from ai_anime.modules.task_execution.infrastructure.runners import (
        production_workflow as runner,
    )

    requirement = VoiceDesignRequirement(
        key="project:narrator",
        target="project_narrator",
        label="项目解说人",
        voice_prompt="沉稳的旁白声线",
        preview_text="故事从这里开始。",
    )

    class _AudioUseCases:
        async def plan(self, _context, _command):
            return SimpleNamespace(
                errors=("missing narrator",),
                voice_requirements=(requirement,),
            )

    async def provision(_context, _requirements):
        raise production_public.VoiceDesignModelUnavailable(
            "missing AUDIO_VOICE_DESIGN"
        )

    monkeypatch.setattr(
        production_public,
        "episode_audio_use_cases",
        lambda: _AudioUseCases(),
    )
    monkeypatch.setattr(
        production_public,
        "provision_voice_design_requirements",
        provision,
    )

    with pytest.raises(
        runner.ProductionWorkflowModelPrerequisitesMissing,
        match="AUDIO_VOICE_DESIGN",
    ):
        await runner._ensure_audio_prerequisites(
            SimpleNamespace(output_dir=tmp_path),
            1,
            [{"beat_number": 1}],
            reporter=SimpleNamespace(update=lambda *_args: None),
            progress=0.5,
            force=True,
        )


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
    assert resolve_episode_video_resolution("1920x1080", "2:3") == "1280x1920"
    assert resolve_episode_video_resolution(None, "2:3") == "854x1280"
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
        beat = next(item for item in beats if item["beat_number"] == command.beat_num)
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
        lambda *_args, **_kwargs: SimpleNamespace(model="seedance-2.0"),
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
