"""Task runner for project-wide character voice design."""

from __future__ import annotations

import asyncio
from typing import Any

from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.infrastructure.task_state import get_task_manager
from ai_anime.modules.task_execution.public import (
    await_envelope_with_cancel_watch,
    register_project_task_runner,
)

TASK_TYPE = "character_voice_design"


def run_character_voice_design(
    envelope: dict[str, Any],
    context: ProjectContext,
) -> dict[str, Any] | None:
    return asyncio.run(
        await_envelope_with_cancel_watch(
            _run_character_voice_design(envelope, context),
            envelope,
            task_type=TASK_TYPE,
        )
    )


async def _run_character_voice_design(
    envelope: dict[str, Any],
    context: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.modules.production.public import provision_missing_character_voices
    from ai_anime.shared.infrastructure.project_stores import (
        make_sqlite_store_for_context,
    )

    payload = envelope.get("payload") or {}
    raw_names = payload.get("character_names") or []
    if not isinstance(raw_names, list):
        raise ValueError("character_names must be a list")
    character_names = tuple(
        dict.fromkeys(
            str(name or "").strip() for name in raw_names if str(name or "").strip()
        )
    )
    replace_existing = bool(payload.get("replace_existing"))
    if replace_existing and not character_names:
        raise ValueError("覆盖已有角色声线时必须明确指定角色")

    scope = str(envelope.get("scope") or TASK_TYPE)
    manager = get_task_manager()

    def update(progress: float, current_task: str) -> None:
        manager.update_progress_for_project(
            context,
            TASK_TYPE,
            0,
            scope=scope,
            progress=progress,
            current_task=current_task,
            logs=[current_task],
        )

    update(0.05, "读取项目角色与台词...")
    store = await make_sqlite_store_for_context(context)
    try:
        characters = list(store.get_all_characters())
        preview_text_by_character: dict[str, str] = {}
        project_preview_text = ""
        for episode in store.get_all_episodes():
            episode_num = int(getattr(episode, "number", 0) or 0)
            if episode_num <= 0:
                continue
            for beat in await store.get_beats_as_dicts(episode_num):
                preview_text = str(
                    beat.get("dialogue")
                    or beat.get("narration_segment")
                    or beat.get("narration")
                    or ""
                ).strip()
                if not preview_text:
                    continue
                project_preview_text = project_preview_text or preview_text
                speaker = str(beat.get("speaker") or "").strip()
                if not speaker:
                    continue
                for character in characters:
                    character_name = str(getattr(character, "name", "") or "").strip()
                    aliases = {
                        str(alias or "").strip()
                        for alias in (getattr(character, "aliases", None) or [])
                    }
                    if (
                        speaker == character_name
                        or speaker.startswith(f"{character_name}_")
                        or speaker.split("_", 1)[0] in aliases
                    ):
                        preview_text_by_character.setdefault(
                            character_name,
                            preview_text,
                        )
                        break

        update(0.20, "调用声线设计模型并绑定角色...")
        completed, skipped = await provision_missing_character_voices(
            context,
            characters,
            character_names=character_names,
            replace_existing=replace_existing,
            preview_text_by_character=preview_text_by_character,
            project_preview_text=project_preview_text,
        )
        update(0.95, "角色声线设计完成")
        return {
            "generated": list(completed),
            "skipped_existing": list(skipped),
            "agent_instruction": (
                "向用户准确报告 generated 与 skipped_existing；"
                "本任务只生成并绑定声线，不会启动完整生产流程或整集配音。"
            ),
        }
    finally:
        await store.close()


register_project_task_runner(TASK_TYPE, run_character_voice_design)


__all__ = ["run_character_voice_design"]
