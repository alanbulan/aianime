from __future__ import annotations

from types import SimpleNamespace

import pytest

from ai_anime.modules.asset_world.application.dto import (
    BatchPropReferenceGenerationTask,
    BuildCharactersTask,
    BuildScenesTask,
    CharacterImageGenerationTask,
    CharacterVoiceDesignTask,
    PropReferenceGenerationTask,
    SceneReferenceGenerationTask,
    SceneStageGenerationTask,
    StylePreviewGenerationTask,
)
from ai_anime.modules.asset_world.infrastructure.task_scheduler import (
    TaskExecutionAssetTaskScheduler,
)


class _Submissions:
    def __init__(self) -> None:
        self.calls: list[tuple[object, object]] = []

    async def submit(self, context, submission):
        self.calls.append((context, submission))
        call_number = len(self.calls)
        return SimpleNamespace(
            task_id=f"task-{call_number}",
            task_key=f"task-key-{call_number}",
            backend="inline",
            queue="inline",
        )


@pytest.mark.asyncio
async def test_scheduler_maps_all_asset_tasks_to_task_execution() -> None:
    context = SimpleNamespace(project_id="project-1")
    submissions = _Submissions()
    scheduler = TaskExecutionAssetTaskScheduler(submissions)

    receipts = [
        await scheduler.enqueue_build_characters(
            context,
            BuildCharactersTask(output_dir="output"),
        ),
        await scheduler.enqueue_character_image(
            context,
            CharacterImageGenerationTask(
                mode="identity",
                task_type="character_identity_image",
                character_name="秦",
                style="period-drama",
                model="cloud-image-standard",
                scope="character-scope",
                output_dir="output",
                identity_id="young",
                identity_name="少年",
            ),
        ),
        await scheduler.enqueue_character_voice_design(
            context,
            CharacterVoiceDesignTask(
                character_names=("秦", "楚"),
                replace_existing=True,
            ),
        ),
        await scheduler.enqueue_build_scenes(
            context,
            BuildScenesTask(output_dir="output"),
        ),
        await scheduler.enqueue_scene_reference(
            context,
            SceneReferenceGenerationTask(
                scene_name="大殿",
                kind="master",
                style="period-drama",
                model="cloud-image-standard",
                output_dir="output",
                scope="scene-scope",
            ),
        ),
        await scheduler.enqueue_scene_stage(
            context,
            SceneStageGenerationTask(
                scene_name="大殿",
                step="pano_sharp",
                params={"source": "pano"},
                project_dir="project",
                scope="stage-scope",
            ),
        ),
        await scheduler.enqueue_prop_reference(
            context,
            PropReferenceGenerationTask(
                prop_name="玉佩",
                style="period-drama",
                model="cloud-image-standard",
                output_dir="output",
                scope="prop-scope",
            ),
        ),
        await scheduler.enqueue_batch_prop_references(
            context,
            BatchPropReferenceGenerationTask(
                style="period-drama",
                model="cloud-image-standard",
                output_dir="output",
            ),
        ),
        await scheduler.enqueue_style_preview(
            context,
            StylePreviewGenerationTask(
                style_id="custom_style",
                prompt="日系二次元校园",
                scope="style-preview-scope",
            ),
        ),
    ]

    assert all(call[0] is context for call in submissions.calls)
    requests = [call[1] for call in submissions.calls]
    assert [request.task_type for request in requests] == [
        "build_characters",
        "character_identity_image",
        "character_voice_design",
        "build_scenes",
        "scene_reference_asset",
        "stage_asset",
        "prop_reference_asset",
        "batch_prop_ref",
        "style_preview",
    ]
    assert [request.queue_kind for request in requests] == [
        "default",
        "default",
        "default",
        "default",
        "default",
        "world",
        "default",
        "default",
        "default",
    ]
    assert [request.episode for request in requests] == [0] * 9
    assert [request.scope for request in requests] == [
        None,
        "character-scope",
        "character_voice_design",
        None,
        "scene-scope",
        "stage-scope",
        "prop-scope",
        None,
        "style-preview-scope",
    ]
    assert requests[0].payload == {"output_dir": "output"}
    assert requests[1].payload == {
        "mode": "identity",
        "task_type": "character_identity_image",
        "character_name": "秦",
        "identity_id": "young",
        "identity_name": "少年",
        "style": "period-drama",
        "model": "cloud-image-standard",
        "model_selector": "",
        "scope": "character-scope",
        "output_dir": "output",
    }
    assert requests[2].payload == {
        "character_names": ["秦", "楚"],
        "replace_existing": True,
        "display_name": "批量设计角色声线",
    }
    assert requests[5].payload == {
        "scene_name": "大殿",
        "step": "pano_sharp",
        "params": {"source": "pano"},
        "project_dir": "project",
    }
    assert [receipt.task_id for receipt in receipts] == [
        "task-1",
        "task-2",
        "task-3",
        "task-4",
        "task-5",
        "task-6",
        "task-7",
        "task-8",
        "task-9",
    ]
    assert receipts[5].task_key == "task-key-6"
    assert receipts[7].queue == "inline"
    assert requests[8].payload == {
        "style_id": "custom_style",
        "prompt": "日系二次元校园",
    }
