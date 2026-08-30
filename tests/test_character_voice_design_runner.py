from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.infrastructure.runners import character_voice


def _context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="project-1",
        project_name="demo",
        owner_type="user",
        owner_id="owner-1",
        owner_username="owner",
        requester_user_id="viewer-1",
        requester_username="viewer",
        requester_principals=(("user", "viewer-1"),),
        effective_role="editor",
        home_node_id="local",
        output_dir=tmp_path / "output",
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
        is_home_node=True,
    )


@pytest.mark.asyncio
async def test_character_voice_design_runner_builds_previews_and_closes_store(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.modules.production import public as production_public
    from ai_anime.shared.infrastructure import project_stores

    context = _context(tmp_path)
    characters = [
        SimpleNamespace(name="佐仓美咲", aliases=["美咲"]),
        SimpleNamespace(name="藤原悠真", aliases=[]),
    ]
    captured: dict[str, object] = {}

    class Store:
        closed = False

        def get_all_characters(self):
            return characters

        def get_all_episodes(self):
            return [SimpleNamespace(number=1)]

        async def get_beats_as_dicts(self, episode_num: int):
            assert episode_num == 1
            return [
                {
                    "speaker": "美咲",
                    "dialogue": "こんにちは。物語を始めましょう。",
                },
                {
                    "speaker": "藤原悠真_青年",
                    "narration_segment": "僕が案内する。",
                },
            ]

        async def close(self) -> None:
            self.closed = True

    class Manager:
        def __init__(self) -> None:
            self.progress: list[dict[str, object]] = []

        def update_progress_for_project(self, *_args, **kwargs) -> None:
            self.progress.append(kwargs)

    store = Store()
    manager = Manager()

    async def make_store(ctx: ProjectContext):
        assert ctx is context
        return store

    async def provision(ctx, project_characters, **kwargs):
        captured["context"] = ctx
        captured["characters"] = project_characters
        captured.update(kwargs)
        return ("佐仓美咲",), ("藤原悠真",)

    monkeypatch.setattr(project_stores, "make_sqlite_store_for_context", make_store)
    monkeypatch.setattr(
        production_public,
        "provision_missing_character_voices",
        provision,
    )
    monkeypatch.setattr(character_voice, "get_task_manager", lambda: manager)

    result = await character_voice._run_character_voice_design(
        {
            "scope": "character_voice_design",
            "payload": {
                "character_names": ["佐仓美咲"],
                "replace_existing": True,
            },
        },
        context,
    )

    assert captured["context"] is context
    assert captured["characters"] == characters
    assert captured["character_names"] == ("佐仓美咲",)
    assert captured["replace_existing"] is True
    assert captured["preview_text_by_character"] == {
        "佐仓美咲": "こんにちは。物語を始めましょう。",
        "藤原悠真": "僕が案内する。",
    }
    assert captured["project_preview_text"] == "こんにちは。物語を始めましょう。"
    assert result["generated"] == ["佐仓美咲"]
    assert result["skipped_existing"] == ["藤原悠真"]
    assert store.closed is True
    assert [item["progress"] for item in manager.progress] == [0.05, 0.20, 0.95]
