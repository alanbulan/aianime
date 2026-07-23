from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.asset_world.application.character_tasks import (
    CharacterTaskUseCases,
)
from ai_anime.modules.asset_world.application.dto import AssetTaskQueueReceipt
from ai_anime.modules.asset_world.application.errors import (
    CharacterIdentityNotFound,
    CharacterNotFound,
    CharacterProjectContextRequired,
)


@dataclass
class _Identity:
    identity_id: str
    identity_name: str


@dataclass
class _Character:
    name: str
    identities: list[_Identity] = field(default_factory=list)


class _Repository:
    def __init__(self, characters: list[_Character] | None = None) -> None:
        self.characters = {
            character.name: character for character in characters or []
        }

    def get_character(self, name: str) -> _Character | None:
        return self.characters.get(name)


class _Scheduler:
    def __init__(self) -> None:
        self.build_task = None
        self.image_task = None
        self.contexts: list[object] = []

    async def enqueue_build_characters(self, task_context, task):
        self.contexts.append(task_context)
        self.build_task = task
        return AssetTaskQueueReceipt(
            task_id="task-build",
            task_key="task:build_characters:0",
            backend="inline",
            queue="inline",
        )

    async def enqueue_character_image(self, task_context, task):
        self.contexts.append(task_context)
        self.image_task = task
        return AssetTaskQueueReceipt(
            task_id="task-image",
            task_key=f"task:{task.task_type}:0:{task.scope}",
            backend="inline",
            queue="inline",
        )


def _context():
    return SimpleNamespace(project_id="project-1")


def _repository() -> _Repository:
    return _Repository(
        [
            _Character(
                name="秦",
                identities=[_Identity(identity_id="秦_少年", identity_name="少年")],
            )
        ]
    )


@pytest.mark.asyncio
async def test_schedules_character_build_with_owned_payload(tmp_path: Path) -> None:
    scheduler = _Scheduler()
    use_cases = CharacterTaskUseCases(scheduler)

    scheduled = await use_cases.schedule_build_characters(
        task_context=_context(),
        output_dir=tmp_path,
    )

    assert scheduler.build_task.backend_payload() == {"output_dir": str(tmp_path)}
    assert scheduled.as_dict() == {
        "task_type": "build_characters",
        "task_id": "task-build",
        "task_key": "task:build_characters:0",
        "backend": "inline",
        "queue": "inline",
        "message": "角色补充任务已进入队列",
    }


@pytest.mark.asyncio
async def test_schedules_character_portrait_with_scope_and_backend_payload(
    tmp_path: Path,
) -> None:
    scheduler = _Scheduler()
    use_cases = CharacterTaskUseCases(scheduler)

    scheduled = await use_cases.schedule_character_portrait(
        task_context=_context(),
        project_dir=tmp_path,
        character_name="秦",
        style="period-drama",
        model="image-model",
    )

    assert scheduler.image_task.backend_payload() == {
        "mode": "portrait",
        "task_type": "character_portrait",
        "character_name": "秦",
        "style": "period-drama",
        "model": "image-model",
        "scope": "character:秦:portrait",
        "output_dir": str(tmp_path),
    }
    assert scheduled.as_dict() == {
        "task_type": "character_portrait",
        "scope": "character:秦:portrait",
        "task_id": "task-image",
        "task_key": "task:character_portrait:0:character:秦:portrait",
        "backend": "inline",
        "queue": "inline",
        "message": "肖像生成任务已进入队列: 秦",
    }


@pytest.mark.asyncio
async def test_schedules_identity_portrait_from_repository_identity(
    tmp_path: Path,
) -> None:
    scheduler = _Scheduler()
    use_cases = CharacterTaskUseCases(scheduler)

    scheduled = await use_cases.schedule_identity_portrait(
        repository=_repository(),
        task_context=_context(),
        project_dir=tmp_path,
        character_name="秦",
        identity_id="秦_少年",
        style="period-drama",
        model="image-model",
    )

    assert scheduler.image_task.backend_payload() == {
        "mode": "identity_portrait",
        "task_type": "character_portrait",
        "character_name": "秦",
        "identity_id": "秦_少年",
        "identity_name": "少年",
        "style": "period-drama",
        "model": "image-model",
        "scope": "character:秦:identity_portrait:少年",
        "output_dir": str(tmp_path),
    }
    assert scheduled.as_dict()["message"] == "身份 Portrait 生成任务已进入队列: 少年"


@pytest.mark.asyncio
async def test_schedules_identity_image_with_distinct_task_type(tmp_path: Path) -> None:
    scheduler = _Scheduler()
    use_cases = CharacterTaskUseCases(scheduler)

    scheduled = await use_cases.schedule_identity_image(
        repository=_repository(),
        task_context=_context(),
        project_dir=tmp_path,
        character_name="秦",
        identity_id="秦_少年",
        style="period-drama",
        model="image-model",
    )

    assert scheduler.image_task.backend_payload() == {
        "mode": "identity_image",
        "task_type": "identity_image",
        "character_name": "秦",
        "identity_id": "秦_少年",
        "identity_name": "少年",
        "style": "period-drama",
        "model": "image-model",
        "scope": "character:秦:identity:少年",
        "output_dir": str(tmp_path),
    }
    assert scheduled.as_dict()["task_type"] == "identity_image"
    assert scheduled.as_dict()["message"] == "身份图生成任务已进入队列: 少年"


@pytest.mark.asyncio
async def test_identity_tasks_reject_missing_character_and_identity(
    tmp_path: Path,
) -> None:
    use_cases = CharacterTaskUseCases(_Scheduler())

    with pytest.raises(CharacterNotFound, match="Character '不存在' not found"):
        await use_cases.schedule_identity_image(
            repository=_Repository(),
            task_context=_context(),
            project_dir=tmp_path,
            character_name="不存在",
            identity_id="不存在_少年",
            style="",
            model="",
        )
    with pytest.raises(CharacterIdentityNotFound, match="Identity '秦_不存在' not found"):
        await use_cases.schedule_identity_portrait(
            repository=_Repository([_Character(name="秦")]),
            task_context=_context(),
            project_dir=tmp_path,
            character_name="秦",
            identity_id="秦_不存在",
            style="",
            model="",
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("operation", "message"),
    [
        ("build", "角色补充需要 project context"),
        ("portrait", "肖像生成需要 project context"),
        ("identity_portrait", "身份 Portrait 生成需要 project context"),
        ("identity_image", "身份图生成需要 project context"),
    ],
)
async def test_character_tasks_require_project_context(
    operation: str,
    message: str,
    tmp_path: Path,
) -> None:
    use_cases = CharacterTaskUseCases(_Scheduler())

    with pytest.raises(CharacterProjectContextRequired, match=message):
        if operation == "build":
            await use_cases.schedule_build_characters(
                task_context=None,
                output_dir=tmp_path,
            )
        elif operation == "portrait":
            await use_cases.schedule_character_portrait(
                task_context=None,
                project_dir=tmp_path,
                character_name="秦",
                style="",
                model="",
            )
        elif operation == "identity_portrait":
            await use_cases.schedule_identity_portrait(
                repository=_repository(),
                task_context=None,
                project_dir=tmp_path,
                character_name="秦",
                identity_id="秦_少年",
                style="",
                model="",
            )
        else:
            await use_cases.schedule_identity_image(
                repository=_repository(),
                task_context=None,
                project_dir=tmp_path,
                character_name="秦",
                identity_id="秦_少年",
                style="",
                model="",
            )
