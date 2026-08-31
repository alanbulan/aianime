from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.narrative_planning.application.beat_models import (
    sync_beat_asset_refs,
)
from ai_anime.modules.narrative_planning.application.ports import (
    VideoPromptGateway,
    VideoPromptStore,
)
from ai_anime.modules.narrative_planning.domain import (
    select_script_beat_context,
)

class VideoPromptRejected(ValueError):
    pass


@dataclass(frozen=True)
class GenerateVideoPromptCommand:
    episode_num: int
    beat_num: int
    project_dir: str | Path
    requester_user_id: str
    project_id: str = ""
    manual_prompt_reference: str | None = None
    prompt_guidance: str | None = None


@dataclass(frozen=True)
class GeneratedVideoPrompt:
    beat: dict[str, Any]
    video_config_json: str
    final_prompt: str
    prompt_source: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "beat": self.beat,
            "video_config_json": self.video_config_json,
            "final_prompt": self.final_prompt,
            "prompt_source": self.prompt_source,
        }


class GenerateVideoPrompt:
    def __init__(
        self,
        *,
        gateway: VideoPromptGateway,
    ) -> None:
        self._gateway = gateway

    async def execute(
        self,
        store: VideoPromptStore,
        command: GenerateVideoPromptCommand,
    ) -> GeneratedVideoPrompt:
        script = await store.get_script_as_dict(command.episode_num)
        selection = select_script_beat_context(script, command.beat_num)
        mode = self._gateway.mode(
            selection.beat.get("video_config_json")
        )
        if mode == "first_last_frame" and selection.next_beat is None:
            raise VideoPromptRejected(
                "这是最后一个 Beat，无法使用首尾帧模式"
            )

        try:
            saved_json = await self._gateway.generate(
                store=store,
                episode=command.episode_num,
                beat=selection.beat,
                project_dir=command.project_dir,
                next_beat=selection.next_beat,
                manual_prompt_reference=command.manual_prompt_reference,
                prompt_guidance=command.prompt_guidance,
                prop_menu=list(script.get("prop_menu") or []),
            )
        except ValueError as exc:
            raise VideoPromptRejected(str(exc)) from exc

        selection.beat["video_config_json"] = saved_json
        sync_beat_asset_refs(selection.beat)
        final_prompt, prompt_source = self._gateway.result_fields(saved_json)
        if prompt_source != "generated":
            raise VideoPromptRejected(
                "AI 视频提示词生成失败：模型未返回可用结果"
            )

        return GeneratedVideoPrompt(
            beat=selection.beat,
            video_config_json=saved_json,
            final_prompt=final_prompt,
            prompt_source=prompt_source,
        )
