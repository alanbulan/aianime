from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.narrative_planning.application.ports import (
    SeedancePromptStore,
)


class SeedancePanelPromptGateway:
    def mode(self, config_json: Any) -> str:
        from ai_anime.modules.seedance2_i2v.public import parse_seedance2_config

        config = parse_seedance2_config(config_json)
        return str(getattr(config.mode, "value", config.mode))

    async def generate(
        self,
        *,
        store: SeedancePromptStore,
        episode: int,
        beat: dict[str, Any],
        project_dir: str | Path,
        next_beat: dict[str, Any] | None,
        manual_prompt_reference: str | None,
        prompt_guidance: str | None,
        prop_menu: list[Any],
    ) -> str:
        from ai_anime.modules.seedance2_i2v.public import (
            generate_seedance2_prompt_for_panel,
        )

        return await generate_seedance2_prompt_for_panel(
            store=store,
            episode=episode,
            beat=beat,
            project_dir=Path(project_dir),
            next_beat=next_beat,
            manual_prompt_reference=manual_prompt_reference,
            prompt_guidance=prompt_guidance,
            prop_menu=prop_menu,
        )

    def result_fields(self, config_json: str) -> tuple[str, str]:
        from ai_anime.modules.seedance2_i2v.public import parse_seedance2_config

        config = parse_seedance2_config(config_json)
        return config.final_prompt, config.prompt_source
