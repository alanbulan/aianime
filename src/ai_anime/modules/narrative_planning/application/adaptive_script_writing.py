from __future__ import annotations

from typing import Any, Callable, Optional

from pydantic import BaseModel, Field, ValidationInfo, model_validator
from pydantic_ai import Agent
from pydantic_ai.exceptions import ContentFilterError

from ai_anime.modules.model_usage.public import (
    get_newapi_text_pydantic_model,
    get_newapi_text_pydantic_model_settings,
)
from ai_anime.modules.narrative_planning.application.literal_script_writing import (
    LiteralBeatMetaOutput,
    LiteralScriptWritingWorkflow,
)
from ai_anime.modules.narrative_planning.application.script_models import (
    NarrationScript,
    VisualBeat,
)
from ai_anime.shared.time_of_day import normalize_time_of_day


RHYTHM_SECONDS: dict[str, float] = {
    "fast": 3.0,
    "medium": 4.0,
    "slow": 5.0,
}
DEFAULT_TARGET_DURATION_SECONDS = 120.0
MIN_ADAPTIVE_BEATS = 5
MAX_ADAPTIVE_BEATS = 80


ADAPTIVE_SCRIPT_PROMPT = """你是短剧分镜编剧。你的任务不是逐行照抄原文，而是把整集原文按语义、镜头节奏和目标时长改编成可生产的 Beat 列表。

## 核心规则
- 一个 Beat 对应一个连续、可拍摄的动作、对白、反应或信息变化。
- 合并同一动作或同一信息的碎句，禁止把原文每一行机械转换成一个 Beat。
- 关键因果、人物关系变化、冲突升级、高潮和结尾钩子必须保留。
- 按目标 Beat 数控制整体密度；允许在不改变剧情事实的前提下压缩重复描写。
- source_text 是该 Beat 的对白、旁白或动作原文，必须可直接用于后续音频类型判断。
- visual_description 只写当前 Beat 能看到的确定画面，不要输出备选方案。
- scene_id 只能从场景菜单中精确选择；无法判断时留空。
- 角色身份必须写成 `{{identity_id}}`，道具必须写成 `[[prop_id]]`。
- 对白使用 dialogue，旁白使用 narration，纯动作画面使用 silence。
- 只返回结构化结果，不要解释。
"""


class AdaptiveBeatOutput(LiteralBeatMetaOutput):
    source_text: str = Field(
        min_length=1,
        max_length=500,
        description="当前 Beat 的对白、旁白或动作文本",
    )
    time_of_day: str = Field(
        default="",
        description="清晨/上午/正午/午后/白天/黄昏/夜晚之一；无法判断时留空",
    )


class AdaptiveScriptOutput(BaseModel):
    beats: list[AdaptiveBeatOutput] = Field(
        min_length=1,
        max_length=MAX_ADAPTIVE_BEATS,
        description="按叙事顺序排列的 Beat 列表",
    )

    @model_validator(mode="after")
    def validate_target_count(self, info: ValidationInfo) -> "AdaptiveScriptOutput":
        target = int((info.context or {}).get("target_beats") or 0)
        if target <= 0:
            return self
        tolerance = max(2, round(target * 0.15))
        if not target - tolerance <= len(self.beats) <= target + tolerance:
            raise ValueError(
                f"Beat 数量应接近 {target}，允许范围为 "
                f"{target - tolerance}-{target + tolerance}，实际为 {len(self.beats)}"
            )
        return self


def target_beats_for_duration(
    target_duration: float,
    rhythm: str,
) -> int:
    seconds_per_beat = RHYTHM_SECONDS.get(str(rhythm or "").strip().lower(), 4.0)
    target = round(max(1.0, float(target_duration)) / seconds_per_beat)
    return min(MAX_ADAPTIVE_BEATS, max(MIN_ADAPTIVE_BEATS, target))


class AdaptiveScriptWritingWorkflow(LiteralScriptWritingWorkflow):
    """按目标时长一次性完成语义分镜的剧本工作流。"""

    def __init__(
        self,
        cognee_store: Any,
        sqlite_store: Any | None = None,
        output_dir: str = "",
        audio_type_mode: str = "literal",
        rhythm: str = "medium",
    ) -> None:
        super().__init__(
            cognee_store=cognee_store,
            sqlite_store=sqlite_store,
            output_dir=output_dir,
            audio_type_mode=audio_type_mode,
        )
        normalized_rhythm = str(rhythm or "").strip().lower()
        self.rhythm = (
            normalized_rhythm if normalized_rhythm in RHYTHM_SECONDS else "medium"
        )
        self._adaptive_agent: Agent | None = None
        self._target_beats = 0

    @property
    def adaptive_agent(self) -> Agent:
        if self._adaptive_agent is None:
            self._adaptive_agent = Agent(
                get_newapi_text_pydantic_model(),
                system_prompt=ADAPTIVE_SCRIPT_PROMPT,
                model_settings=get_newapi_text_pydantic_model_settings(
                    "LITERAL_BEAT_META_THINKING_LEVEL",
                    "low",
                ),
                output_type=AdaptiveScriptOutput,
                output_retries=3,
                validation_context={
                    "valid_identity_ids": self._valid_identity_ids,
                    "valid_scene_ids": self._valid_scene_ids,
                    "valid_prop_ids": self._valid_prop_ids,
                    "target_beats": self._target_beats,
                },
                name="时长自适应分镜编剧",
            )
        return self._adaptive_agent

    async def run(
        self,
        *,
        episode_num: int,
        source_text: str | None = None,
        target_duration: float | None = None,
        target_beats: int | None = None,
        narration_style: str = "first_person",
        visual_style: str = "chinese_period_drama",
        protagonist_name: str = "",
        on_progress: Optional[Callable[[float, str], None]] = None,
        on_log: Optional[Callable[[str], None]] = None,
        **_: Any,
    ) -> NarrationScript:
        del protagonist_name

        def report_progress(progress: float, task: str) -> None:
            if on_progress:
                on_progress(progress, task)

        def log(message: str) -> None:
            if on_log:
                on_log(message)

        self._current_episode = episode_num
        self._adaptive_agent = None
        self._identity_section = ""
        self._scene_section = ""
        self._prop_section = ""

        report_progress(0.03, "读取本集原文与资产菜单...")
        await self.cognee_store.load_graph_state()
        episode = await self.sqlite_store.get_episode_from_graph(episode_num)
        if not episode:
            raise ValueError(f"未找到第 {episode_num} 集规划")

        if source_text is None:
            source_text = (
                getattr(episode, "beat_source_text", "")
                or await self.sqlite_store.load_episode_content(episode_num)
                or getattr(episode, "content_summary", "")
                or ""
            )
        source_text = source_text.strip()
        if not source_text:
            raise ValueError("当前集原文为空，无法按时长生成脚本")

        self._identity_section, self._valid_identity_ids = (
            self._build_identity_menu_for_episode(episode_num)
        )
        self._scene_section = self._build_scene_menu_for_episode(episode)
        self._prop_section = self._build_prop_menu_for_episode(episode)

        duration = float(target_duration or DEFAULT_TARGET_DURATION_SECONDS)
        self._target_beats = (
            min(MAX_ADAPTIVE_BEATS, max(MIN_ADAPTIVE_BEATS, int(target_beats)))
            if target_beats is not None
            else target_beats_for_duration(duration, self.rhythm)
        )
        seconds_per_beat = RHYTHM_SECONDS[self.rhythm]
        report_progress(
            0.10,
            f"按 {duration:.0f} 秒目标时长规划约 {self._target_beats} 个 Beat...",
        )
        log(
            f"[Adaptive] 模式=时长自适应，节奏={self.rhythm}，"
            f"单 Beat≈{seconds_per_beat:.0f} 秒，目标={self._target_beats} 个"
        )

        prompt = f"""## 本集信息
- 标题: {getattr(episode, "title", "") or f"第 {episode_num} 集"}
- 目标总时长: {duration:.0f} 秒
- 项目节奏: {self.rhythm}（约 {seconds_per_beat:.0f} 秒/Beat）
- 目标 Beat 数: {self._target_beats}
- 叙事方式: {narration_style}
- 视觉风格: {visual_style}

{self._identity_section}
{self._scene_section}
{self._prop_section}

## 本集原文
{source_text}

请把整集原文语义改编为接近 {self._target_beats} 个 Beat。不要按原文换行机械拆分。"""

        try:
            result = await self.adaptive_agent.run(prompt)
        except ContentFilterError as exc:
            raise RuntimeError(
                "时长自适应分镜触发模型内容安全过滤。请检查原文中的高风险表达，"
                "或在模型设置中切换适合剧本创作的文本模型后重试。"
            ) from exc

        output: AdaptiveScriptOutput = result.output
        report_progress(
            0.78, f"已生成 {len(output.beats)} 个语义 Beat，正在规范化资产引用..."
        )

        beat_duration = duration / max(1, len(output.beats))
        fallback_scene_id = next(iter(sorted(self._valid_scene_ids)), "")
        previous_scene_id = ""
        beats: list[VisualBeat] = []
        for index, planned in enumerate(output.beats, start=1):
            requested_scene_id = (planned.scene_id or "").strip()
            scene_id = (
                requested_scene_id
                if requested_scene_id in self._valid_scene_ids
                else ""
            )
            if not scene_id:
                scene_id = previous_scene_id or fallback_scene_id
                if requested_scene_id:
                    log(
                        f"[Adaptive][WARN] Beat {index} 场景 `{requested_scene_id}` 不在菜单中，"
                        f"回落 `{scene_id or '未绑定'}`"
                    )
            previous_scene_id = scene_id or previous_scene_id

            audio_type = self._normalize_audio_type_for_mode(planned.audio_type)
            speaker_kind = (planned.speaker_kind or "character").strip()
            speaker = (planned.speaker or "").strip()
            audio_type, speaker = self._normalize_audio_metadata(
                audio_type=audio_type,
                speaker_kind=speaker_kind,
                speaker=speaker,
            )
            if audio_type != "dialogue":
                speaker_kind = "character"
            if audio_type == "dialogue" and speaker_kind == "character" and speaker:
                speaker = self._resolve_unit_speaker_label(speaker)

            beats.append(
                VisualBeat(
                    beat_number=index,
                    narration_segment=self._derive_narration_segment(
                        planned.source_text.strip(),
                        audio_type,
                    ),
                    visual_description=planned.visual_description.strip(),
                    time_of_day=normalize_time_of_day(planned.time_of_day),
                    scene_ref=self._canonical_scene_ref_for_menu_choice(scene_id),
                    audio_type=audio_type,
                    speaker=speaker,
                    speaker_kind=speaker_kind,
                    estimated_duration=beat_duration,
                    duration_seconds=beat_duration,
                )
            )
            log(f"[Adaptive] Beat {index}/{len(output.beats)} 已规范化")

        script = NarrationScript(
            episode_number=episode_num,
            title=getattr(episode, "title", f"第 {episode_num} 集"),
            beats=beats,
            total_duration_seconds=duration,
        )
        report_progress(0.93, "保存时长自适应脚本...")
        await self.cognee_store.persist_narration_script(script)
        self.last_review_passed = True
        self.last_review_summary = (
            f"时长自适应模式：目标 {duration:.0f} 秒，生成 {len(beats)} 个 Beat"
        )
        report_progress(1.0, "完成")
        return script


__all__ = [
    "AdaptiveScriptWritingWorkflow",
    "DEFAULT_TARGET_DURATION_SECONDS",
    "MAX_ADAPTIVE_BEATS",
    "MIN_ADAPTIVE_BEATS",
    "RHYTHM_SECONDS",
    "target_beats_for_duration",
]
