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


def test_missing_character_voice_requirements_skip_existing_default_voice() -> None:
    characters = (
        SimpleNamespace(
            name="藤原悠真",
            gender="男",
            age_group="youth",
            role="男主角",
            description="性格沉稳",
            reference_audio_path="assets/characters/藤原悠真/voices/voice_default.wav",
            voice_samples_by_age_group={"youth": {"path": "voice.wav"}},
        ),
        SimpleNamespace(
            name="佐仓美咲",
            gender="女",
            age_group="youth",
            role="青梅竹马",
            description="开朗直率",
            reference_audio_path="",
            voice_samples_by_age_group={"youth": {"path": "age-override.wav"}},
        ),
    )

    requirements, skipped = (
        voice_design_provisioning.missing_character_voice_requirements(characters)
    )

    assert skipped == ("藤原悠真",)
    assert len(requirements) == 1
    requirement = requirements[0]
    assert requirement.character_name == "佐仓美咲"
    assert requirement.slot == "default"
    assert requirement.language == "zh"
    assert "开朗直率" in requirement.voice_prompt
    assert "佐仓美咲" in requirement.preview_text


def test_missing_character_voice_requirements_uses_persisted_project_language() -> None:
    character = SimpleNamespace(
        name="佐仓美咲",
        gender="女",
        age_group="youth",
        role="主角",
        description="明るく率直",
        reference_audio_path="",
        voice_samples_by_age_group={},
    )

    requirements, skipped = (
        voice_design_provisioning.missing_character_voice_requirements(
            (character,),
            project_preview_text="こんにちは。物語を始めましょう。",
        )
    )

    assert skipped == ()
    assert len(requirements) == 1
    assert requirements[0].preview_text == "こんにちは。物語を始めましょう。"
    assert requirements[0].language == "ja"


def test_missing_character_voice_requirements_reject_unknown_name() -> None:
    with pytest.raises(ValueError, match="未找到角色：不存在"):
        voice_design_provisioning.missing_character_voice_requirements(
            (),
            character_names=("不存在",),
        )


def test_replacing_character_voices_requires_explicit_names() -> None:
    with pytest.raises(ValueError, match="必须明确指定角色"):
        voice_design_provisioning.missing_character_voice_requirements(
            (),
            replace_existing=True,
        )


def test_replace_existing_character_voice_rebuilds_only_selected_samples() -> None:
    identity = SimpleNamespace(
        identity_id="白石夏音_成年时期",
        identity_name="成年时期",
        age_group="middle",
        reference_audio_path="assets/characters/白石夏音/voices/adult.wav",
    )
    characters = (
        SimpleNamespace(
            name="白石夏音",
            gender="女",
            age_group="youth",
            role="主角",
            description="性格克制",
            reference_audio_path="assets/characters/白石夏音/voices/default.wav",
            voice_samples_by_age_group={
                "youth": {"path": "assets/characters/白石夏音/voices/youth.wav"},
                "middle": {"path": "assets/characters/白石夏音/voices/middle.wav"},
            },
            identities=[identity],
        ),
        SimpleNamespace(
            name="藤原悠真",
            gender="男",
            age_group="youth",
            role="主角",
            description="性格沉稳",
            reference_audio_path="assets/characters/藤原悠真/voices/default.wav",
            voice_samples_by_age_group={},
            identities=[],
        ),
    )

    requirements, skipped = (
        voice_design_provisioning.missing_character_voice_requirements(
            characters,
            character_names=("白石夏音",),
            replace_existing=True,
        )
    )

    assert skipped == ()
    assert [requirement.key for requirement in requirements] == [
        "character:白石夏音:slot:default",
        "character:白石夏音:slot:middle",
        "character:白石夏音:identity:白石夏音_成年时期",
    ]
    assert requirements[0].additional_slots == ("youth",)


def test_missing_character_voice_requirements_rebuild_short_bound_voice(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    voices_dir = tmp_path / "assets" / "characters" / "白石夏音" / "voices"
    voices_dir.mkdir(parents=True)
    default_path = voices_dir / "voice_default.wav"
    youth_path = voices_dir / "voice_youth.wav"
    default_path.write_bytes(b"short-default")
    youth_path.write_bytes(b"short-youth")
    monkeypatch.setattr(
        voice_design_provisioning,
        "probe_voice_sample_duration_seconds",
        lambda _path: 1.04,
    )
    character = SimpleNamespace(
        name="白石夏音",
        gender="女",
        age_group="youth",
        role="主角",
        description="性格克制",
        reference_audio_path=(
            "assets/characters/白石夏音/voices/voice_default.wav"
        ),
        voice_samples_by_age_group={
            "youth": {
                "path": "assets/characters/白石夏音/voices/voice_youth.wav"
            }
        },
        identities=[],
    )

    requirements, skipped = (
        voice_design_provisioning.missing_character_voice_requirements(
            (character,),
            project_dir=tmp_path,
        )
    )

    assert skipped == ()
    assert [requirement.key for requirement in requirements] == [
        "character:白石夏音:slot:default"
    ]
    assert requirements[0].additional_slots == ("youth",)


def test_missing_character_voice_requirements_repairs_short_age_override(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    voices_dir = tmp_path / "assets" / "characters" / "白石夏音" / "voices"
    voices_dir.mkdir(parents=True)
    default_path = voices_dir / "voice_default.wav"
    youth_path = voices_dir / "voice_youth.wav"
    default_path.write_bytes(b"usable-default")
    youth_path.write_bytes(b"short-youth")
    monkeypatch.setattr(
        voice_design_provisioning,
        "probe_voice_sample_duration_seconds",
        lambda path: 4.0 if Path(path).name == "voice_default.wav" else 1.04,
    )
    character = SimpleNamespace(
        name="白石夏音",
        gender="女",
        age_group="youth",
        role="主角",
        description="性格克制",
        reference_audio_path=(
            "assets/characters/白石夏音/voices/voice_default.wav"
        ),
        voice_samples_by_age_group={
            "youth": {
                "path": "assets/characters/白石夏音/voices/voice_youth.wav"
            }
        },
        identities=[],
    )

    requirements, skipped = (
        voice_design_provisioning.missing_character_voice_requirements(
            (character,),
            project_dir=tmp_path,
        )
    )

    assert skipped == ()
    assert [requirement.key for requirement in requirements] == [
        "character:白石夏音:slot:youth"
    ]
    assert requirements[0].additional_slots == ()


def test_character_voice_requirement_repairs_resolved_age_slot() -> None:
    identity = SimpleNamespace(
        identity_id="白石夏音_学生时期",
        identity_name="学生时期",
        age_group="youth",
        reference_audio_path="",
    )
    character = SimpleNamespace(
        name="白石夏音",
        aliases=[],
        gender="女",
        age_group="youth",
        role="主角",
        description="性格克制",
        identities=[identity],
    )

    requirement = voice_design_provisioning.build_character_voice_requirement(
        (character,),
        speaker="白石夏音_学生时期",
        preview_text="你怎么在这里？",
    )

    assert requirement is not None
    assert requirement.key == "character:白石夏音:slot:youth"
    assert requirement.slot == "youth"
    assert requirement.preview_text == "你怎么在这里？"


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
        "library": [],
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

    def persist_reusable(context, requirement, source_path):
        assert context is project_context
        calls["library"].append(
            (requirement.label, Path(source_path).read_bytes())
        )
        return {"voice_id": f"fv_{len(calls['library'])}"}

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
    monkeypatch.setattr(
        voice_design_provisioning,
        "probe_voice_sample_duration_seconds",
        lambda _path: 4.0,
    )
    monkeypatch.setattr(
        voice_design_provisioning,
        "_persist_reusable_generated_voice",
        persist_reusable,
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
            key="character:白石夏音:slot:default",
            target="character_slot",
            label="白石夏音·学生时期",
            voice_prompt="清澈的青年女声",
            preview_text="我们走吧。",
            character_name="白石夏音",
            identity_id="白石夏音_学生时期",
            slot="default",
            additional_slots=("youth",),
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
    assert calls["slot"] == [
        ("白石夏音", "default", b"designed-voice"),
        ("白石夏音", "youth", b"designed-voice"),
    ]
    assert calls["identity"] == [("藤原悠真", "藤原悠真_教师时期", b"designed-voice")]
    assert calls["library"] == [
        ("项目解说人", b"designed-voice"),
        ("白石夏音·学生时期", b"designed-voice"),
        ("藤原悠真·教师时期", b"designed-voice"),
    ]
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


@pytest.mark.asyncio
async def test_voice_design_retries_when_first_sample_is_too_short(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    previews: list[str] = []

    async def write_voice(**kwargs):
        previews.append(kwargs["preview_text"])
        Path(kwargs["output_path"]).write_bytes(b"voice")
        return SimpleNamespace(voice_id="voice")

    monkeypatch.setattr(
        voice_design_provisioning,
        "write_model_audio_voice_design",
        write_voice,
    )
    monkeypatch.setattr(
        voice_design_provisioning,
        "probe_voice_sample_duration_seconds",
        lambda path: 1.04 if str(path).endswith("-1.wav") else 4.2,
    )
    requirement = VoiceDesignRequirement(
        key="character:白石夏音:slot:youth",
        target="character_slot",
        label="白石夏音·学生时期",
        voice_prompt="清澈的青年女声",
        preview_text="你怎么在这里？",
        character_name="白石夏音",
        slot="youth",
    )

    output = await voice_design_provisioning._generate_usable_voice_design(
        requirement,
        temp_dir=tmp_path,
        index=1,
        timeout_seconds=60,
    )

    assert output.name == "voice-1-2.wav"
    assert previews == [
        "你怎么在这里？",
        "这是角色声线试听。请保持自然清晰的语气，完整说完这段校准内容。",
    ]


@pytest.mark.asyncio
async def test_voice_design_retry_preserves_foreign_language(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    calls: list[tuple[str, str]] = []

    async def write_voice(**kwargs):
        calls.append((kwargs["preview_text"], kwargs["language"]))
        Path(kwargs["output_path"]).write_bytes(b"voice")
        return SimpleNamespace(voice_id="voice")

    monkeypatch.setattr(
        voice_design_provisioning,
        "write_model_audio_voice_design",
        write_voice,
    )
    monkeypatch.setattr(
        voice_design_provisioning,
        "probe_voice_sample_duration_seconds",
        lambda path: 1.04 if str(path).endswith("-1.wav") else 4.2,
    )
    requirement = VoiceDesignRequirement(
        key="character:佐仓美咲:slot:youth",
        target="character_slot",
        label="佐仓美咲·青年",
        voice_prompt="明るい若い女性の声",
        preview_text="こんにちは。",
        language="ja",
        character_name="佐仓美咲",
        slot="youth",
    )

    await voice_design_provisioning._generate_usable_voice_design(
        requirement,
        temp_dir=tmp_path,
        index=1,
        timeout_seconds=60,
    )

    assert calls == [
        ("こんにちは。", "ja"),
        (
            "これはキャラクターボイスの試聴です。自然で明瞭な口調で、"
            "この調整用の台詞を最後まで話してください。",
            "ja",
        ),
    ]
