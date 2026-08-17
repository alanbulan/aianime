from __future__ import annotations

from types import SimpleNamespace

import pytest

from ai_anime.modules.narrative_planning.application.adaptive_script_writing import (
    AdaptiveScriptOutput,
    AdaptiveScriptWritingWorkflow,
    target_beats_for_duration,
)
from ai_anime.modules.narrative_planning.application.literal_script_writing import (
    LiteralScriptWritingWorkflow,
)
from ai_anime.modules.narrative_planning.application.episode_planning_models import (
    SceneMenuItem,
)
from ai_anime.modules.narrative_planning.composition import (
    create_script_writing_workflow,
)


def test_target_beats_follow_project_rhythm_and_bounds() -> None:
    assert target_beats_for_duration(120, "fast") == 40
    assert target_beats_for_duration(120, "medium") == 30
    assert target_beats_for_duration(120, "slow") == 24
    assert target_beats_for_duration(5, "medium") == 5
    assert target_beats_for_duration(900, "fast") == 80


def test_workflow_factory_switches_real_implementations() -> None:
    store = SimpleNamespace(output_dir="")

    adaptive = create_script_writing_workflow(
        store,
        script_mode="duration",
        rhythm="fast",
    )
    literal = create_script_writing_workflow(store, script_mode="literal")

    assert isinstance(adaptive, AdaptiveScriptWritingWorkflow)
    assert adaptive.rhythm == "fast"
    assert isinstance(literal, LiteralScriptWritingWorkflow)
    assert not isinstance(literal, AdaptiveScriptWritingWorkflow)


class _AdaptiveStore:
    output_dir = ""

    def __init__(self) -> None:
        self.episode = SimpleNamespace(
            number=1,
            title="测试集",
            beat_source_text="第一段原文。\n第二段原文。",
            content_summary="",
            identity_ids=[],
            identity_default_map={},
            scene_menu=[SceneMenuItem(scene_id="教室")],
            prop_menu=[],
        )
        self.persisted = None

    async def load_graph_state(self) -> None:
        pass

    async def get_episode_from_graph(self, episode_num: int):
        assert episode_num == 1
        return self.episode

    async def load_episode_content(self, episode_num: int) -> str:
        assert episode_num == 1
        return self.episode.beat_source_text

    def get_episode(self, episode_num: int):
        assert episode_num == 1
        return self.episode

    async def persist_narration_script(self, script) -> None:
        self.persisted = script


class _FakeAdaptiveAgent:
    def __init__(self) -> None:
        self.calls = 0

    async def run(self, prompt: str):
        self.calls += 1
        assert "不要按原文换行机械拆分" in prompt
        beats = [
            {
                "source_text": f"动作 {index}",
                "audio_type": "silence",
                "visual_description": f"教室内发生第 {index} 个可见动作",
                "scene_id": "教室",
            }
            for index in range(1, 6)
        ]
        output = AdaptiveScriptOutput.model_validate(
            {"beats": beats},
            context={"target_beats": 5, "valid_scene_ids": {"教室"}},
        )
        return SimpleNamespace(output=output)


class _TestAdaptiveWorkflow(AdaptiveScriptWritingWorkflow):
    def __init__(self, store: _AdaptiveStore, agent: _FakeAdaptiveAgent) -> None:
        super().__init__(store, sqlite_store=store, rhythm="medium")
        self._fake_agent = agent

    @property
    def adaptive_agent(self):
        return self._fake_agent


@pytest.mark.asyncio
async def test_duration_mode_uses_one_semantic_planning_call_and_persists_beats() -> (
    None
):
    store = _AdaptiveStore()
    agent = _FakeAdaptiveAgent()
    workflow = _TestAdaptiveWorkflow(store, agent)

    script = await workflow.run(episode_num=1, target_duration=20)

    assert agent.calls == 1
    assert len(script.beats) == 5
    assert script.total_duration_seconds == 20
    assert all(beat.duration_seconds == 4 for beat in script.beats)
    assert all(
        beat.scene_ref and beat.scene_ref.scene_id == "教室" for beat in script.beats
    )
    assert store.persisted is script
    assert workflow.last_review_summary == "时长自适应模式：目标 20 秒，生成 5 个 Beat"


@pytest.mark.asyncio
async def test_explicit_target_beats_overrides_duration_derived_count() -> None:
    store = _AdaptiveStore()
    agent = _FakeAdaptiveAgent()
    workflow = _TestAdaptiveWorkflow(store, agent)

    script = await workflow.run(
        episode_num=1,
        target_duration=120,
        target_beats=5,
    )

    assert len(script.beats) == 5
    assert workflow.last_review_summary == "时长自适应模式：目标 120 秒，生成 5 个 Beat"
