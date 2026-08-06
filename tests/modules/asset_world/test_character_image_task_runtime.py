from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.asset_world.infrastructure import character_image_task_runtime


class _Store:
    instances: list[_Store] = []
    character = SimpleNamespace(name="秦")

    def __init__(
        self,
        project_label: str,
        *,
        output_dir: str,
        state_dir: str,
        text_model: str | None = None,
        embedding_model: str | None = None,
        embedding_dimensions: int | None = None,
    ) -> None:
        self.project_label = project_label
        self.output_dir = output_dir
        self.state_dir = state_dir
        self.initialized = False
        self.loaded = False
        self.closed = False
        self.instances.append(self)

    async def initialize(self) -> None:
        self.initialized = True

    async def load_graph_state(self) -> None:
        self.loaded = True

    async def get_character_from_graph(self, name: str):
        return self.character if name == self.character.name else None

    async def close(self) -> None:
        self.closed = True


class _TaskManager:
    def __init__(self) -> None:
        self.updates: list[dict] = []

    def update_progress_for_project(self, context, task_type, episode, **kwargs) -> None:
        self.updates.append(
            {
                "context": context,
                "task_type": task_type,
                "episode": episode,
                **kwargs,
            }
        )


def _context(tmp_path: Path):
    return SimpleNamespace(
        project_id="project-1",
        project_name="demo",
        owner_username="alice",
        owner_project_label="alice/demo",
        output_dir=tmp_path,
        state_dir=tmp_path / "state",
        is_home_node=True,
    )


def _patch_runtime(monkeypatch: pytest.MonkeyPatch, manager: _TaskManager) -> None:
    import ai_anime.modules.knowledge_graph as cognee
    import ai_anime.project_config as project_config

    _Store.instances.clear()
    _Store.character = SimpleNamespace(name="秦")
    monkeypatch.setattr(cognee, "CogneeStore", _Store)
    monkeypatch.setattr(
        project_config,
        "load_project_config_file",
        lambda *_: {"ethnicity": "Chinese"},
    )
    monkeypatch.setattr(
        character_image_task_runtime,
        "get_task_manager",
        lambda: manager,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("mode", "task_type", "generator_name"),
    [
        ("portrait", "character_portrait", "_generate_character_portrait"),
        (
            "identity_portrait",
            "character_portrait",
            "_generate_identity_portrait",
        ),
        ("identity_image", "identity_image", "_generate_identity_image"),
    ],
)
async def test_runtime_dispatches_all_character_image_modes_and_closes_store(
    mode: str,
    task_type: str,
    generator_name: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manager = _TaskManager()
    _patch_runtime(monkeypatch, manager)
    calls: list[dict] = []

    async def generate(**kwargs):
        calls.append(kwargs)
        return tmp_path / f"{mode}.png"

    monkeypatch.setattr(character_image_task_runtime, generator_name, generate)
    context = _context(tmp_path)
    envelope = {
        "task_type": task_type,
        "scope": "character:秦:test",
        "payload": {
            "mode": mode,
            "character_name": "秦",
            "identity_id": "秦_少年",
            "identity_name": "少年",
            "style": "period-drama",
            "model": "image-model",
            "output_dir": str(tmp_path),
        },
    }

    result = await character_image_task_runtime.execute_character_image_task(
        envelope,
        context,
    )

    assert result == {
        "mode": mode,
        "character_name": "秦",
        "identity_id": "秦_少年",
        "identity_name": "少年",
        "path": str(tmp_path / f"{mode}.png"),
    }
    assert len(calls) == 1
    assert calls[0]["character"] is _Store.character
    assert calls[0]["ethnicity"] == "Chinese"
    assert calls[0]["task_type"] == task_type
    assert calls[0]["scope"] == "character:秦:test"
    assert _Store.instances[0].initialized is True
    assert _Store.instances[0].loaded is True
    assert _Store.instances[0].closed is True
    assert [update["current_task"] for update in manager.updates] == [
        "加载角色数据...",
        "准备生成参数...",
    ]


@pytest.mark.asyncio
async def test_runtime_closes_store_when_mode_is_unknown(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_runtime(monkeypatch, _TaskManager())

    with pytest.raises(RuntimeError, match="未知角色图像生成模式"):
        await character_image_task_runtime.execute_character_image_task(
            {
                "task_type": "character_portrait",
                "payload": {
                    "mode": "unknown",
                    "character_name": "秦",
                    "output_dir": str(tmp_path),
                },
            },
            _context(tmp_path),
        )

    assert _Store.instances[0].closed is True


@pytest.mark.asyncio
async def test_runtime_closes_store_when_character_is_missing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_runtime(monkeypatch, _TaskManager())
    _Store.character = SimpleNamespace(name="其他角色")

    with pytest.raises(RuntimeError, match="找不到角色: 秦"):
        await character_image_task_runtime.execute_character_image_task(
            {
                "task_type": "character_portrait",
                "payload": {
                    "mode": "portrait",
                    "character_name": "秦",
                    "output_dir": str(tmp_path),
                },
            },
            _context(tmp_path),
        )

    assert _Store.instances[0].closed is True
