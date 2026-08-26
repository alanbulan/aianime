from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.production.domain.voice_design import (
    VoiceDesignRequirement,
    build_character_voice_prompt,
    infer_voice_design_language,
)
from ai_anime.modules.production.infrastructure import voice_design_provisioning


def test_voice_design_prompt_uses_character_facts_and_detects_language() -> None:
    prompt = build_character_voice_prompt(
        character_name="白石夏音",
        gender="女",
        age_group="youth",
        role="主角",
        description="性格克制、待人温和",
        identity_name="学生时期",
    )

    assert "白石夏音" in prompt
    assert "青年 女" in prompt
    assert "学生时期" in prompt
    assert "性格克制、待人温和" in prompt
    assert infer_voice_design_language("こんにちは") == "ja"
    assert infer_voice_design_language("안녕하세요") == "ko"
    assert infer_voice_design_language("hello") == "en"
    assert infer_voice_design_language("你好") == "zh"


@pytest.mark.asyncio
async def test_provision_voice_design_reports_missing_priority_route(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    def missing_route(_role: str) -> str:
        raise PermissionError("missing route")

    monkeypatch.setattr(
        voice_design_provisioning,
        "resolve_model_for_role",
        missing_route,
    )

    with pytest.raises(
        voice_design_provisioning.VoiceDesignModelUnavailable,
        match="missing route",
    ):
        await voice_design_provisioning.provision_voice_design_requirements(
            SimpleNamespace(output_dir=tmp_path),
            (
                VoiceDesignRequirement(
                    key="project:narrator",
                    target="project_narrator",
                    label="项目解说人",
                    voice_prompt="沉稳旁白",
                    preview_text="故事开始。",
                ),
            ),
        )


@pytest.mark.asyncio
async def test_provision_voice_design_uses_priority_route_and_binds_targets(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    calls: dict[str, list] = {
        "resolve": [],
        "write": [],
        "slot": [],
        "identity": [],
        "narrator": [],
    }

    class _Store:
        closed = False

        async def close(self):
            self.closed = True

    class _VoiceUseCases:
        async def bind_sample(self, **kwargs):
            calls["slot"].append(
                (
                    kwargs["character_name"],
                    kwargs["slot"],
                    Path(kwargs["source_path"]).read_bytes(),
                )
            )

        async def bind_identity_sample(self, **kwargs):
            calls["identity"].append(
                (
                    kwargs["character_name"],
                    kwargs["identity_id"],
                    Path(kwargs["source_path"]).read_bytes(),
                )
            )

    store = _Store()

    async def make_store(context):
        assert context is project_context
        return store

    async def write_voice(**kwargs):
        calls["write"].append(kwargs)
        Path(kwargs["output_path"]).write_bytes(b"designed-voice")
        return SimpleNamespace(voice_id="voice-1")

    def resolve(role):
        calls["resolve"].append(role)
        return "QWEN3_TTS_VD_2026_01_26"

    def set_narrator(username, project, **kwargs):
        calls["narrator"].append((username, project, kwargs))

    monkeypatch.setattr(
        voice_design_provisioning.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )
    monkeypatch.setattr(
        voice_design_provisioning,
        "character_voice_use_cases",
        lambda: _VoiceUseCases(),
    )
    monkeypatch.setattr(
        voice_design_provisioning,
        "resolve_model_for_role",
        resolve,
    )
    monkeypatch.setattr(
        voice_design_provisioning,
        "write_model_audio_voice_design",
        write_voice,
    )
    monkeypatch.setattr(
        voice_design_provisioning,
        "set_narrator_reference_audio",
        set_narrator,
    )
    project_context = SimpleNamespace(
        output_dir=tmp_path / "project",
        owner_username="alice",
        project_name="demo",
    )
    requirements = (
        VoiceDesignRequirement(
            key="project:narrator",
            target="project_narrator",
            label="项目解说人",
            voice_prompt="沉稳的旁白声线",
            preview_text="故事开始了。",
        ),
        VoiceDesignRequirement(
            key="character:白石夏音:slot:youth",
            target="character_slot",
            label="白石夏音·学生时期",
            voice_prompt="清澈的青年女声",
            preview_text="我们走吧。",
            character_name="白石夏音",
            identity_id="白石夏音_学生时期",
            slot="youth",
        ),
        VoiceDesignRequirement(
            key="character:藤原悠真:identity:藤原悠真_教师时期",
            target="identity",
            label="藤原悠真·教师时期",
            voice_prompt="温和的成年男声",
            preview_text="上课了。",
            character_name="藤原悠真",
            identity_id="藤原悠真_教师时期",
        ),
    )

    completed = await voice_design_provisioning.provision_voice_design_requirements(
        project_context,
        requirements,
        timeout_seconds=900,
    )

    assert calls["resolve"] == ["AUDIO_VOICE_DESIGN"]
    assert len(calls["write"]) == 3
    assert all(call["model_selector"] is None for call in calls["write"])
    assert all(call["timeout_seconds"] == 600 for call in calls["write"])
    assert calls["slot"] == [("白石夏音", "youth", b"designed-voice")]
    assert calls["identity"] == [("藤原悠真", "藤原悠真_教师时期", b"designed-voice")]
    narrator_path = tmp_path / "project" / "assets" / "narrator" / "voice.wav"
    assert narrator_path.read_bytes() == b"designed-voice"
    assert calls["narrator"][0][0:2] == ("alice", "demo")
    assert calls["narrator"][0][2]["relative_path"] == "assets/narrator/voice.wav"
    assert store.closed is True
    assert completed == (
        "项目解说人",
        "白石夏音·学生时期",
        "藤原悠真·教师时期",
    )
