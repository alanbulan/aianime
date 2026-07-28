from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.narrative_planning.application.beat_models import (
    sync_beat_asset_refs,
)
from ai_anime.modules.narrative_planning.application.ports import (
    FeatureUsageMeter,
    SeedancePromptGateway,
    SeedancePromptStore,
)
from ai_anime.modules.narrative_planning.domain import (
    select_script_beat_context,
)

logger = logging.getLogger("ai_anime.narrative_planning.seedance_prompts")

SEEDANCE2_PROMPT_FEATURE_KEY = "seedance2_prompt"
MODEL_CALL_CREDIT_POLICY_FEATURE_INCLUDED = "feature_included"


class SeedancePromptRejected(ValueError):
    pass


@dataclass(frozen=True)
class GenerateSeedancePromptCommand:
    episode_num: int
    beat_num: int
    project_dir: str | Path
    requester_user_id: str
    project_id: str = ""
    manual_prompt_reference: str | None = None
    prompt_guidance: str | None = None


@dataclass(frozen=True)
class GeneratedSeedancePrompt:
    beat: dict[str, Any]
    seedance2_config_json: str
    final_prompt: str
    prompt_source: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "beat": self.beat,
            "seedance2_config_json": self.seedance2_config_json,
            "final_prompt": self.final_prompt,
            "prompt_source": self.prompt_source,
        }


class GenerateSeedancePrompt:
    def __init__(
        self,
        *,
        gateway: SeedancePromptGateway,
        usage_meter: FeatureUsageMeter,
    ) -> None:
        self._gateway = gateway
        self._usage_meter = usage_meter

    async def execute(
        self,
        store: SeedancePromptStore,
        command: GenerateSeedancePromptCommand,
    ) -> GeneratedSeedancePrompt:
        script = await store.get_script_as_dict(command.episode_num)
        selection = select_script_beat_context(script, command.beat_num)
        mode = self._gateway.mode(
            selection.beat.get("seedance2_config_json")
        )
        if mode == "first_last_frame" and selection.next_beat is None:
            raise SeedancePromptRejected(
                "这是最后一个 Beat，无法使用首尾帧模式"
            )

        reservation = await self._usage_meter.reserve_feature_start_credits(
            user_id=command.requester_user_id,
            feature_key=SEEDANCE2_PROMPT_FEATURE_KEY,
            project_id=command.project_id,
            resource_kind="script",
            task_type=SEEDANCE2_PROMPT_FEATURE_KEY,
            metadata=self._event_metadata(command, mode=mode),
            require_price_rule=True,
            require_positive_cost=True,
        )
        reservation_id = str(reservation.get("id") or "")
        billing_metadata: dict[str, Any] = {
            "model_call_credit_policy": (
                MODEL_CALL_CREDIT_POLICY_FEATURE_INCLUDED
            ),
            "feature_key": SEEDANCE2_PROMPT_FEATURE_KEY,
            "source": "sync_api",
        }
        if reservation_id:
            billing_metadata.update(
                {
                    "feature_credit_reservation_id": reservation_id,
                    "feature_credit_charge_id": reservation_id,
                    "feature_credit_cost": str(reservation.get("cost") or 0),
                }
            )

        try:
            self._usage_meter.set_llm_usage_context(
                command.requester_user_id,
                project_id=command.project_id,
                resource_kind="script",
                billing_metadata=billing_metadata,
            )
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
            if reservation_id:
                await self._usage_meter.refund_feature_credit_reservation(
                    reservation_id,
                    metadata=self._event_metadata(command, error=str(exc)),
                )
            raise SeedancePromptRejected(str(exc)) from exc
        except Exception as exc:
            await self._refund_after_failure(
                reservation_id,
                command,
                exc,
            )
            raise
        finally:
            self._usage_meter.clear_llm_usage_context()

        try:
            selection.beat["seedance2_config_json"] = saved_json
            sync_beat_asset_refs(selection.beat)
            final_prompt, prompt_source = self._gateway.result_fields(saved_json)
            if reservation_id:
                await self._usage_meter.confirm_feature_credit_reservation(
                    reservation_id,
                    metadata=self._event_metadata(command, mode=mode),
                )
        except Exception as exc:
            await self._refund_after_failure(
                reservation_id,
                command,
                exc,
            )
            raise

        return GeneratedSeedancePrompt(
            beat=selection.beat,
            seedance2_config_json=saved_json,
            final_prompt=final_prompt,
            prompt_source=prompt_source,
        )

    @staticmethod
    def _event_metadata(
        command: GenerateSeedancePromptCommand,
        *,
        mode: str | None = None,
        error: str | None = None,
    ) -> dict[str, Any]:
        metadata: dict[str, Any] = {
            "source": "sync_api",
            "endpoint": "generate_seedance2_prompt",
            "episode": command.episode_num,
            "beat_num": command.beat_num,
        }
        if mode is not None:
            metadata["mode"] = mode
        if error is not None:
            metadata["error"] = error
        return metadata

    async def _refund_after_failure(
        self,
        reservation_id: str,
        command: GenerateSeedancePromptCommand,
        error: Exception,
    ) -> None:
        if not reservation_id:
            return
        try:
            await self._usage_meter.refund_feature_credit_reservation(
                reservation_id,
                metadata=self._event_metadata(command, error=str(error)),
            )
        except Exception:
            logger.exception(
                "Failed to refund Seedance2 prompt feature credit reservation"
            )
