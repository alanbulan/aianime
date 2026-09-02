from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from ai_anime.modules.narrative_planning.public import (
    ScriptWorkflowExecutor,
    ScriptWorkflowOptions,
    ScriptWorkflowSnapshot,
    ScriptWorkflowTicket,
    build_script_workflow_plan,
)


def _nodes(plan):
    return {node.node_id: node for node in plan.nodes}


def test_script_graph_places_identity_and_scene_planning_before_script() -> None:
    plan = build_script_workflow_plan(
        ScriptWorkflowSnapshot(
            ingested=True,
            has_characters=True,
            episode_numbers=(1, 2),
        ),
        ScriptWorkflowOptions(target="script", episodes=(1, 2)),
    )
    nodes = _nodes(plan)

    assert nodes["identities:ep001"].status == "ready"
    assert nodes["scenes:ep001"].status == "ready"
    assert nodes["script:ep001"].status == "waiting"
    assert nodes["script:ep001"].dependencies == (
        "identities:ep001",
        "scenes:ep001",
    )
    assert nodes["identities:ep002"].status == "ready"
    assert nodes["scenes:ep002"].status == "ready"


def test_single_stage_reports_missing_prerequisites_instead_of_skipping_them() -> None:
    plan = build_script_workflow_plan(
        ScriptWorkflowSnapshot(
            ingested=True,
            has_characters=True,
            episode_numbers=(1,),
        ),
        ScriptWorkflowOptions(mode="single", target="script", episodes=(1,)),
    )
    nodes = _nodes(plan)

    assert nodes["identities:ep001"].execute is False
    assert nodes["scenes:ep001"].execute is False
    assert nodes["script:ep001"].status == "blocked"
    assert "identities:ep001" in nodes["script:ep001"].blocked_reason
    assert "scenes:ep001" in nodes["script:ep001"].blocked_reason


def test_requested_episode_expands_the_episode_planning_target() -> None:
    options = ScriptWorkflowOptions(
        target="script",
        episodes=(18,),
        target_episodes=10,
    )

    assert options.episode_plan_size == 18


def test_explicit_beat_count_invalidates_a_stale_complete_script() -> None:
    from ai_anime.modules.task_execution.public import script_beats_complete

    beats = [
        {"beat_number": number, "visual_description": f"shot {number}"}
        for number in range(1, 35)
    ]

    assert script_beats_complete(beats, None) is True
    assert script_beats_complete(beats, 34) is True
    assert script_beats_complete(beats, 12) is False


@pytest.mark.asyncio
async def test_runtime_ignores_old_completed_task_when_target_count_changed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.modules.task_execution.infrastructure.runners import (
        script_workflow as runner,
    )
    from ai_anime.shared.infrastructure import project_stores

    beats = [
        {"beat_number": number, "visual_description": f"shot {number}"}
        for number in range(1, 35)
    ]

    class _Store:
        def get_all_characters(self):
            return [SimpleNamespace(name="林舟")]

        def get_all_episodes(self):
            return [
                SimpleNamespace(
                    number=1,
                    identity_ids=["林舟_日常"],
                    scene_menu=[SimpleNamespace(scene_id="客厅")],
                )
            ]

        async def list_scenes(self):
            return [SimpleNamespace(name="客厅", aliases=[])]

        async def get_beats_as_dicts(self, episode_number):
            assert episode_number == 1
            return beats

        async def close(self):
            return None

    async def make_store(context):
        return _Store()

    completed_task = SimpleNamespace(
        task_type="script_writer",
        episode=1,
        status="completed",
    )
    monkeypatch.setattr(project_stores, "make_sqlite_store_for_context", make_store)
    monkeypatch.setattr(
        runner,
        "project_task_use_cases",
        lambda: SimpleNamespace(list_for_project=lambda context: [completed_task]),
    )
    monkeypatch.setattr(
        runner,
        "effective_task_status",
        lambda task: task.status,
    )

    runtime = runner.ProjectScriptWorkflowRuntime(
        context=object(),
        envelope={},
    )
    snapshot = await runtime.snapshot(
        ScriptWorkflowOptions(target="script", episodes=(1,), target_beats=12)
    )

    assert snapshot.script_episodes == frozenset()
    assert "script:ep001" not in snapshot.task_statuses


@pytest.mark.asyncio
async def test_runtime_rejects_partial_scene_menu_and_newer_scene_plan_invalidates_script(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.modules.task_execution.infrastructure.runners import (
        script_workflow as runner,
    )
    from ai_anime.shared.infrastructure import project_stores

    episode = SimpleNamespace(
        number=1,
        identity_ids=["陈默_日常"],
        scene_menu=[SimpleNamespace(scene_id="公司一楼大厅", base_scene_id="")],
        beat_source_text="""
## 1-1 场景：【内 公司办公区 夜】
陈默：服务器停了。
## 1-2 场景：【内 公司机房 夜】
△所有指示灯熄灭。
""",
        adapted_content="",
        raw_content="",
    )

    class _Store:
        def get_all_characters(self):
            return [SimpleNamespace(name="陈默")]

        def get_all_episodes(self):
            return [episode]

        async def list_scenes(self):
            return [SimpleNamespace(name="公司一楼大厅", aliases=["大厅"])]

        async def get_beats_as_dicts(self, episode_number):
            assert episode_number == 1
            return [{"beat_number": 1, "visual_description": "陈默站在大厅"}]

        async def close(self):
            return None

    async def make_store(context):
        return _Store()

    tasks = [
        SimpleNamespace(
            task_type="episode_scene_planner",
            episode=1,
            status="completed",
            completed_at="2026-09-02T12:00:00+08:00",
        ),
        SimpleNamespace(
            task_type="script_writer",
            episode=1,
            status="completed",
            completed_at="2026-09-02T11:00:00+08:00",
        ),
    ]
    monkeypatch.setattr(project_stores, "make_sqlite_store_for_context", make_store)
    monkeypatch.setattr(
        runner,
        "project_task_use_cases",
        lambda: SimpleNamespace(list_for_project=lambda context: tasks),
    )

    snapshot = await runner.ProjectScriptWorkflowRuntime(
        context=object(),
        envelope={},
    ).snapshot(ScriptWorkflowOptions(target="script", episodes=(1,)))

    assert snapshot.scene_episodes == frozenset()
    assert snapshot.script_episodes == frozenset()
    plan = build_script_workflow_plan(
        snapshot,
        ScriptWorkflowOptions(target="script", episodes=(1,)),
    )
    assert _nodes(plan)["scenes:ep001"].status == "ready"
    assert _nodes(plan)["script:ep001"].status == "waiting"


def test_missing_episode_is_a_visible_block_after_episode_planning() -> None:
    plan = build_script_workflow_plan(
        ScriptWorkflowSnapshot(
            ingested=True,
            has_characters=True,
            episode_numbers=(1, 2),
        ),
        ScriptWorkflowOptions(target="script", episodes=(3,)),
    )

    assert _nodes(plan)["identities:ep003"].status == "blocked"
    assert "仍不存在第 3 集" in _nodes(plan)["identities:ep003"].blocked_reason


def test_completed_character_task_without_output_is_ready_to_retry() -> None:
    plan = build_script_workflow_plan(
        ScriptWorkflowSnapshot(
            ingested=True,
            has_characters=False,
            task_statuses={"characters": "completed"},
        ),
        ScriptWorkflowOptions(mode="through", target="characters"),
    )

    characters = _nodes(plan)["characters"]
    assert characters.execute is True
    assert characters.status == "ready"
    assert characters.blocked_reason == ""


class _ConcurrentRuntime:
    def __init__(self) -> None:
        self.identities: set[int] = set()
        self.scenes: set[int] = set()
        self.scripts: set[int] = set()
        self.active = 0
        self.max_active = 0
        self.started: list[str] = []

    async def snapshot(self, _options):
        return ScriptWorkflowSnapshot(
            ingested=True,
            has_characters=True,
            episode_numbers=(1, 2),
            identity_episodes=frozenset(self.identities),
            scene_episodes=frozenset(self.scenes),
            script_episodes=frozenset(self.scripts),
        )

    async def start(self, node, _options):
        if node.stage == "script":
            assert node.episode in self.identities
            assert node.episode in self.scenes
        self.started.append(node.node_id)
        return ScriptWorkflowTicket(
            node_id=node.node_id,
            task_type=node.stage,
            task_id=node.node_id,
            task_key=node.node_id,
            episode=int(node.episode or 0),
        )

    async def wait(self, ticket, *, timeout_seconds):
        assert timeout_seconds == 30
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        await asyncio.sleep(0.01)
        stage, _, episode_text = ticket.node_id.partition(":ep")
        episode = int(episode_text) if episode_text else 0
        if stage == "identities":
            self.identities.add(episode)
        elif stage == "scenes":
            self.scenes.add(episode)
        elif stage == "script":
            self.scripts.add(episode)
        self.active -= 1
        return {"ok": True}

    def report(self, _plan, *, batches, current_batch=None):
        return None


@pytest.mark.asyncio
async def test_executor_runs_independent_nodes_concurrently_and_respects_dependencies() -> (
    None
):
    runtime = _ConcurrentRuntime()
    result = await ScriptWorkflowExecutor(runtime).execute(
        ScriptWorkflowOptions(
            target="script",
            episodes=(1, 2),
            max_parallel=4,
        ),
        timeout_seconds=30,
    )

    assert runtime.max_active == 4
    assert set(result["batches"][0]) == {
        "identities:ep001",
        "scenes:ep001",
        "identities:ep002",
        "scenes:ep002",
    }
    assert set(result["batches"][1]) == {"script:ep001", "script:ep002"}
    assert runtime.scripts == {1, 2}


@pytest.mark.asyncio
async def test_executor_preserves_empty_start_error_type() -> None:
    class _FailingRuntime:
        async def snapshot(self, _options):
            return ScriptWorkflowSnapshot()

        async def start(self, _node, _options):
            raise ValueError

        async def wait(self, _ticket, *, timeout_seconds):
            raise AssertionError("start failure must not create a ticket")

        def report(self, _plan, *, batches, current_batch=None):
            return None

    with pytest.raises(RuntimeError, match="ValueError"):
        await ScriptWorkflowExecutor(_FailingRuntime()).execute(
            ScriptWorkflowOptions(
                mode="single",
                target="ingest",
                filename="novel.md",
            ),
            timeout_seconds=30,
        )


@pytest.mark.asyncio
async def test_workflow_route_submits_one_parent_task_with_complete_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.api.routes.narrative_planning import workflow as workflow_route
    from ai_anime.api.routes.narrative_planning.workflow_schemas import (
        ScriptWorkflowRequest,
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
                task_id="workflow-1",
                task_key="task:script_workflow:project:project-1:0:scope",
                backend="inline",
                queue=None,
            )

    monkeypatch.setattr(workflow_route, "resolve_project_scope", resolve_project_scope)
    monkeypatch.setattr(
        workflow_route,
        "project_task_submission_use_cases",
        lambda: _Submissions(),
    )

    response = await workflow_route.start_script_workflow(
        "project-1",
        ScriptWorkflowRequest(
            episodes=[2, 1, 2],
            max_parallel=6,
            filename="novel.txt",
            target_beats=12,
            spine_template="drama",
            visual_style="anime",
            ethnicity="Japanese",
        ),
        user={"id": "user-1"},
    )

    assert response["task_type"] == "script_workflow"
    assert len(submissions) == 1
    assert submissions[0].task_type == "script_workflow"
    assert submissions[0].queue_kind == "workflow"
    assert submissions[0].episode == 0
    assert submissions[0].payload["episodes"] == [2, 1]
    assert submissions[0].payload["max_parallel"] == 6
    assert submissions[0].payload["target_beats"] == 12
    assert submissions[0].payload["spine_template"] == "drama"
    assert submissions[0].payload["visual_style"] == "anime"
    assert submissions[0].payload["ethnicity"] == "Japanese"
    assert submissions[0].scope.startswith("script_workflow__")
