from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.asset_world.application.dto import (
    AssetTaskQueueReceipt,
    GenerateScenePanoCommand,
)
from ai_anime.modules.asset_world.application.errors import (
    SceneGenerationRejected,
    SceneNotFound,
    SceneProjectContextRequired,
)
from ai_anime.modules.asset_world.application.scene_tasks import SceneTaskUseCases
from ai_anime.modules.task_execution.public import task_config_scope


@dataclass
class _Scene:
    name: str
    scene_type: str = "interior"
    environment_prompt: str = ""
    description: str = ""


class _Repository:
    def __init__(self, scenes: list[_Scene] | None = None) -> None:
        self.scenes = {scene.name: scene for scene in scenes or []}

    async def get_scene(self, name: str) -> _Scene | None:
        return self.scenes.get(name)


class _Scheduler:
    def __init__(self) -> None:
        self.build_task = None
        self.reference_task = None
        self.stage_task = None
        self.contexts: list[object] = []

    async def enqueue_build_scenes(self, task_context, task):
        self.contexts.append(task_context)
        self.build_task = task
        return AssetTaskQueueReceipt(
            task_id="task-build-scenes",
            task_key="task:build_scenes:0",
            backend="inline",
            queue="inline",
        )

    async def enqueue_scene_reference(self, task_context, task):
        self.contexts.append(task_context)
        self.reference_task = task
        return AssetTaskQueueReceipt(
            task_id="task-scene-reference",
            task_key=f"task:scene_reference_asset:0:{task.scope}",
            backend="inline",
            queue="inline",
        )

    async def enqueue_scene_stage(self, task_context, task):
        self.contexts.append(task_context)
        self.stage_task = task
        return AssetTaskQueueReceipt(
            task_id="task-scene-stage",
            task_key=f"task:stage_asset:0:{task.scope}",
            backend="inline",
            queue="inline",
        )


class _Assets:
    def __init__(
        self,
        *,
        masters: set[str] | None = None,
        reverse_masters: set[str] | None = None,
        panos: set[str] | None = None,
        stage_available: bool = True,
    ) -> None:
        self.masters = masters or set()
        self.reverse_masters = reverse_masters or set()
        self.panos = panos or set()
        self.stage_available = stage_available

    def has_master(self, _project_dir: Path, scene_name: str) -> bool:
        return scene_name in self.masters

    def has_reverse_master(self, _project_dir: Path, scene_name: str) -> bool:
        return scene_name in self.reverse_masters

    def has_pano(self, _project_dir: Path, scene_name: str) -> bool:
        return scene_name in self.panos

    def stage_generation_capability(self, _step: str) -> tuple[bool, str]:
        return (
            (True, "")
            if self.stage_available
            else (False, "当前桌面安装包未包含本地 SHARP/3DGS 运行组件")
        )


def _context():
    return SimpleNamespace(project_id="project-1")


@pytest.mark.asyncio
async def test_schedules_scene_build_with_owned_payload(tmp_path: Path) -> None:
    scheduler = _Scheduler()
    use_cases = SceneTaskUseCases(scheduler, _Assets())

    scheduled = await use_cases.schedule_build_scenes(
        task_context=_context(),
        output_dir=tmp_path,
    )

    assert scheduler.build_task.backend_payload() == {"output_dir": str(tmp_path)}
    assert scheduled.as_dict() == {
        "task_type": "build_scenes",
        "task_id": "task-build-scenes",
        "task_key": "task:build_scenes:0",
        "backend": "inline",
        "queue": "inline",
        "message": "场景补充任务已进入队列",
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["master", "reverse_master"])
async def test_schedules_scene_reference_with_owned_scope_payload_and_response(
    kind: str,
    tmp_path: Path,
) -> None:
    scheduler = _Scheduler()
    use_cases = SceneTaskUseCases(scheduler, _Assets())

    scheduled = await use_cases.schedule_reference(
        repository=_Repository([_Scene(name="大殿")]),
        task_context=_context(),
        output_dir=tmp_path,
        scene_name="大殿",
        kind=kind,
        style="period-drama",
        model="  image-model  ",
    )

    expected_scope = task_config_scope(
        "scene_ref",
        {"scene": "大殿", "kind": kind},
    )
    assert scheduler.reference_task.scope == expected_scope
    assert scheduler.reference_task.backend_payload() == {
        "scene_name": "大殿",
        "kind": kind,
        "model": "image-model",
        "style": "period-drama",
        "output_dir": str(tmp_path),
    }
    assert scheduled.as_dict() == {
        "task_type": "scene_reference_asset",
        "scope": expected_scope,
        "task_id": "task-scene-reference",
        "task_key": f"task:scene_reference_asset:0:{expected_scope}",
        "backend": "inline",
        "queue": "inline",
        "message": f"场景「大殿」{kind} 生成任务已进入队列",
    }


@pytest.mark.asyncio
async def test_scene_reference_rejects_missing_scene(tmp_path: Path) -> None:
    use_cases = SceneTaskUseCases(_Scheduler(), _Assets())

    with pytest.raises(SceneNotFound, match="Scene '不存在' not found"):
        await use_cases.schedule_reference(
            repository=_Repository(),
            task_context=_context(),
            output_dir=tmp_path,
            scene_name="不存在",
            kind="master",
            style="",
            model=None,
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("operation", "message"),
    [
        ("build", "场景补充需要 project context"),
        ("reference", "场景参考图生成需要 project context"),
    ],
)
async def test_scene_tasks_require_project_context(
    operation: str,
    message: str,
    tmp_path: Path,
) -> None:
    use_cases = SceneTaskUseCases(
        _Scheduler(),
        _Assets(masters={"大殿"}, reverse_masters={"大殿"}, panos={"大殿"}),
    )

    with pytest.raises(SceneProjectContextRequired, match=message):
        if operation == "build":
            await use_cases.schedule_build_scenes(
                task_context=None,
                output_dir=tmp_path,
            )
        else:
            await use_cases.schedule_reference(
                repository=_Repository([_Scene(name="大殿")]),
                task_context=None,
                output_dir=tmp_path,
                scene_name="大殿",
                kind="master",
                style="",
                model="cloud-image-standard",
            )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("source", "asset_kwargs"),
    [
        ("master", {"masters": {"大殿"}}),
        ("reverse", {"reverse_masters": {"大殿"}}),
    ],
)
async def test_schedules_single_face_3gs_with_exact_stage_payload(
    source: str,
    asset_kwargs: dict,
    tmp_path: Path,
) -> None:
    scheduler = _Scheduler()
    use_cases = SceneTaskUseCases(scheduler, _Assets(**asset_kwargs))

    scheduled = await use_cases.schedule_single_face_3gs(
        repository=_Repository([_Scene(name="大殿")]),
        task_context=_context(),
        project_dir=tmp_path,
        scene_name="大殿",
        source_kind=source,
    )

    expected_scope = task_config_scope(
        "stage_asset",
        {"scene": "大殿", "step": "single_face_sharp"},
    )
    assert scheduler.stage_task.backend_payload() == {
        "scene_name": "大殿",
        "step": "single_face_sharp",
        "params": {
            "source_kind": source,
            "face_name": "front",
            "depth_meters": 8.0,
            "device": "auto",
            "face_size": 768,
            "internal_size": 1536,
            "max_gaussians_per_face": 1_000_000,
            "timeout_seconds": 1800,
        },
        "project_dir": str(tmp_path),
    }
    assert scheduled.as_dict() == {
        "task_type": "stage_asset",
        "scope": expected_scope,
        "source": source,
        "task_id": "task-scene-stage",
        "task_key": f"task:stage_asset:0:{expected_scope}",
        "backend": "inline",
        "queue": "inline",
        "message": f"场景「大殿」{source} → SOG 任务已启动",
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("source", "message"),
    [
        ("master", "缺少 master.png，请先上传或生成场景源图"),
        ("reverse", "缺少 reverse_master.png，请先生成 reverse master"),
    ],
)
async def test_single_face_3gs_requires_source_asset(
    source: str,
    message: str,
    tmp_path: Path,
) -> None:
    use_cases = SceneTaskUseCases(_Scheduler(), _Assets())

    with pytest.raises(SceneGenerationRejected, match=message):
        await use_cases.schedule_single_face_3gs(
            repository=_Repository([_Scene(name="大殿")]),
            task_context=_context(),
            project_dir=tmp_path,
            scene_name="大殿",
            source_kind=source,
        )


@pytest.mark.asyncio
async def test_schedules_pano_3gs_with_exact_stage_payload(tmp_path: Path) -> None:
    scheduler = _Scheduler()
    use_cases = SceneTaskUseCases(scheduler, _Assets(panos={"大殿"}))

    scheduled = await use_cases.schedule_pano_3gs(
        repository=_Repository([_Scene(name="大殿")]),
        task_context=_context(),
        project_dir=tmp_path,
        scene_name="大殿",
    )

    assert scheduler.stage_task.backend_payload() == {
        "scene_name": "大殿",
        "step": "pano_sharp",
        "params": {
            "geometry_mode": "pano-depth",
            "depth_source": "da2",
            "depth_device": "auto",
            "device": "auto",
            "pano_depth_width": 2048,
            "pano_depth_point_scale": 0.72,
            "pano_depth_min_scale": 0.0008,
            "pano_depth_max_scale": 0.045,
            "pano_depth_opacity": 0.96,
            "pano_depth_radius_scale": 1.0,
            "face_size": 768,
            "internal_size": 1536,
            "max_gaussians_per_face": 1_000_000,
            "timeout_seconds": 1800,
        },
        "project_dir": str(tmp_path),
    }
    assert scheduled.as_dict()["source"] == "pano"
    assert scheduled.as_dict()["message"] == "场景「大殿」360 → SOG 任务已启动"


@pytest.mark.asyncio
async def test_pano_3gs_requires_pano_asset(tmp_path: Path) -> None:
    use_cases = SceneTaskUseCases(_Scheduler(), _Assets())

    with pytest.raises(
        SceneGenerationRejected,
        match="缺少 pano_360.png，请先上传或生成 360 全景",
    ):
        await use_cases.schedule_pano_3gs(
            repository=_Repository([_Scene(name="大殿")]),
            task_context=_context(),
            project_dir=tmp_path,
            scene_name="大殿",
        )


@pytest.mark.asyncio
async def test_3gs_rejects_before_queue_when_runtime_is_not_packaged(
    tmp_path: Path,
) -> None:
    scheduler = _Scheduler()
    use_cases = SceneTaskUseCases(
        scheduler,
        _Assets(masters={"大殿"}, stage_available=False),
    )

    with pytest.raises(
        SceneGenerationRejected,
        match="未包含本地 SHARP/3DGS 运行组件",
    ):
        await use_cases.schedule_single_face_3gs(
            repository=_Repository([_Scene(name="大殿")]),
            task_context=_context(),
            project_dir=tmp_path,
            scene_name="大殿",
            source_kind="master",
        )
    assert scheduler.stage_task is None


@pytest.mark.asyncio
async def test_pano_generation_falls_back_to_text_and_builds_spatial_description(
    tmp_path: Path,
) -> None:
    scheduler = _Scheduler()
    use_cases = SceneTaskUseCases(scheduler, _Assets())
    scene = _Scene(name="大殿", environment_prompt="纵深开阔的宫殿")

    scheduled = await use_cases.schedule_pano_generation(
        repository=_Repository([scene]),
        task_context=_context(),
        project_dir=tmp_path,
        scene_name="大殿",
        command=GenerateScenePanoCommand(
            source="master",
            model="cloud-image-standard",
        ),
        project_style="period-drama",
    )

    payload = scheduler.stage_task.backend_payload()
    assert payload["step"] == "pano_from_text"
    assert payload["params"] == {
        "description": (
            "场景名称：大殿\n"
            "场景类型：interior\n"
            "环境描述是完整场景空间合同：应说明正面、背面、左侧、右侧、天花/天空、地面和固定物件关系。\n"
            "master 图代表正面半区：正面中心 + 左侧一半 + 右侧一半，并提供视觉风格锚点。\n"
            "reverse 图应代表背面半区：背面中心 + 左侧另一半 + 右侧另一半。\n"
            "360 需要把 environment_prompt 的四向空间合同展开成完整连续空间。\n"
            "如果某些方向没有明确写出，请基于场景类型和 master 视觉风格合理补全，但不要把正面物件机械复制到每个方向。\n"
            "环境描述：\n"
            "纵深开阔的宫殿"
        ),
        "model": "cloud-image-standard",
        "style": "period-drama",
        "timeout_seconds": 1800,
    }
    assert scheduled.as_dict()["source"] == "text"
    assert scheduled.as_dict()["message"] == "场景「大殿」360 全景生成任务已启动"


@pytest.mark.asyncio
async def test_pano_generation_keeps_master_and_optional_model_parameters(
    tmp_path: Path,
) -> None:
    scheduler = _Scheduler()
    use_cases = SceneTaskUseCases(scheduler, _Assets(masters={"大殿"}))
    scene = _Scene(name="大殿", description="宫殿")

    scheduled = await use_cases.schedule_pano_generation(
        repository=_Repository([scene]),
        task_context=_context(),
        project_dir=tmp_path,
        scene_name="大殿",
        command=GenerateScenePanoCommand(
            source="master",
            style="ink",
            model="image-model",
            image_size="2K",
            quality="high",
            timeout_seconds=900,
        ),
        project_style="period-drama",
    )

    payload = scheduler.stage_task.backend_payload()
    assert payload["step"] == "pano_from_master"
    assert payload["params"]["style"] == "ink"
    assert payload["params"]["model"] == "image-model"
    assert payload["params"]["image_size"] == "2K"
    assert payload["params"]["quality"] == "high"
    assert payload["params"]["timeout_seconds"] == 900
    assert scheduled.as_dict()["source"] == "master"
