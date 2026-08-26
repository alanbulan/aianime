"""Adapters for IndexTTS2 episode audio scheduling."""

from __future__ import annotations

from ai_anime.modules.model_usage.public import (
    generation_credit_queries,
    resolve_model_for_role,
)
from ai_anime.modules.production.infrastructure.indextts2_beat_audio_task import (
    build_indextts2_audio_generation_plan,
)
from ai_anime.modules.production.application.episode_audio import (
    INDEXTTS2_AUDIO_TASK_TYPE,
    EpisodeAudioBillingQuote,
    EpisodeAudioGenerationPlan,
    EpisodeAudioTask,
    EpisodeAudioTaskReceipt,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import (
    ProjectTaskSubmission,
    ProjectTaskSubmissionUseCases,
)
from ai_anime.shared.infrastructure import project_stores

EPISODE_AUDIO_FEATURE_KEY = "mainline.beat_audio_generation"


class IndexTTS2EpisodeAudioPlanner:
    async def plan(
        self,
        context: ProjectContext,
        episode_num: int,
        beat_numbers: list[int] | None,
        mode: str,
    ) -> EpisodeAudioGenerationPlan:
        store = await project_stores.make_sqlite_store_for_context(context)
        try:
            plan = await build_indextts2_audio_generation_plan(
                store=store,
                username=context.owner_username,
                project=context.project_name,
                episode=episode_num,
                beat_numbers=beat_numbers,
                mode=mode,
            )
            errors = list(plan.errors)
            pricing_model = ""
            if plan.beat_numbers or plan.errors:
                try:
                    pricing_model = resolve_model_for_role("AUDIO_VOICE_CLONE")
                except PermissionError:
                    errors.append(
                        "AI 配音模型缺失：当前未配置可用的 AUDIO_VOICE_CLONE "
                        "云端或 BYOK 模型"
                    )
            return EpisodeAudioGenerationPlan(
                beat_numbers=tuple(plan.beat_numbers),
                errors=tuple(errors),
                voice_requirements=tuple(plan.voice_requirements),
                billable_chars=plan.billable_chars,
                pricing_model=pricing_model,
            )
        finally:
            await store.close()


class ModelUsageEpisodeAudioBilling:
    @staticmethod
    def _pricing_metrics(plan: EpisodeAudioGenerationPlan) -> dict[str, int]:
        metrics = {
            "call_count": plan.quantity,
            "item_count": plan.quantity,
        }
        if plan.billable_chars > 0:
            metrics["billable_chars"] = plan.billable_chars
        return metrics

    async def quote(
        self,
        plan: EpisodeAudioGenerationPlan,
    ) -> EpisodeAudioBillingQuote:
        if plan.quantity <= 0:
            return EpisodeAudioBillingQuote(
                beat_numbers=(),
                quantity=0,
                unit_cost=0,
                cost=0,
                display="",
                prereq_errors=plan.errors,
            )
        if not plan.pricing_model:
            return EpisodeAudioBillingQuote(
                beat_numbers=plan.beat_numbers,
                quantity=plan.quantity,
                unit_cost=0,
                cost=0,
                display="",
                prereq_errors=plan.errors,
            )

        cost = await generation_credit_queries().cost(
            kind="feature",
            surface="ai_anime",
            value=EPISODE_AUDIO_FEATURE_KEY,
            params=self.task_payload(plan),
            quantity=plan.quantity,
            mode_key="",
            image_role="",
        )
        unit_cost = cost.unit_cost
        if unit_cost is None:
            unit_cost = cost.cost // plan.quantity
        return EpisodeAudioBillingQuote(
            beat_numbers=plan.beat_numbers,
            quantity=plan.quantity,
            unit_cost=max(int(unit_cost), 0),
            cost=max(int(cost.cost), 0),
            display=str(cost.display or ""),
            prereq_errors=plan.errors,
        )

    def task_payload(self, plan: EpisodeAudioGenerationPlan) -> dict:
        return {
            "pricing_kind": "audio",
            "pricing_model": plan.pricing_model,
            "pricing_params": {},
            "pricing_quantity": plan.quantity,
            "pricing_metrics": self._pricing_metrics(plan),
            "items": plan.quantity,
            "beat_numbers": list(plan.beat_numbers),
        }


class TaskExecutionEpisodeAudioScheduler:
    def __init__(self, submissions: ProjectTaskSubmissionUseCases) -> None:
        self._submissions = submissions

    async def enqueue(
        self,
        context: ProjectContext,
        task: EpisodeAudioTask,
    ) -> EpisodeAudioTaskReceipt:
        receipt = await self._submissions.submit(
            context,
            ProjectTaskSubmission(
                task_type=INDEXTTS2_AUDIO_TASK_TYPE,
                episode=task.episode_num,
                payload=task.backend_payload(),
            ),
        )
        return EpisodeAudioTaskReceipt(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
        )
