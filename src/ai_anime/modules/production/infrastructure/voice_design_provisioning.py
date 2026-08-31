"""Provision missing production voices through the configured voice-design route."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import replace
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Iterable

from ai_anime.modules.asset_world.public import (
    AGE_GROUP_SLOTS,
    DEFAULT_SLOT,
    character_voice_use_cases,
    probe_voice_sample_duration_seconds,
)
from ai_anime.modules.model_usage.public import (
    resolve_model_for_role,
    write_model_audio_voice_design,
)
from ai_anime.modules.production.domain.voice_design import (
    VoiceDesignRequirement,
    build_character_voice_prompt,
    infer_voice_design_language,
)
from ai_anime.modules.project_workspace.public import (
    ProjectContext,
    persist_narrator_voice_content,
)
from ai_anime.shared.infrastructure import project_stores
from ai_anime.shared.utils.async_ops import call_blocking
from ai_anime.shared.utils.voice_samples import (
    REFERENCE_VOICE_MAX_SECONDS,
    REFERENCE_VOICE_MIN_SECONDS,
)


class VoiceDesignModelUnavailable(PermissionError):
    """Raised when no priority route can serve AUDIO_VOICE_DESIGN."""

    code = "voice_design_model_unavailable"


class VoiceDesignProvisioningFailed(RuntimeError):
    """Raised when the configured voice-design route fails to create a voice."""

    code = "voice_design_failed"


MIN_USABLE_VOICE_REFERENCE_SECONDS = REFERENCE_VOICE_MIN_SECONDS
MAX_USABLE_VOICE_REFERENCE_SECONDS = REFERENCE_VOICE_MAX_SECONDS
RECOMMENDED_VOICE_REFERENCE_SECONDS = 3.0


def _project_voice_path(project_dir: str | Path, stored_path: str) -> Path:
    path = Path(str(stored_path or "").strip())
    return path if path.is_absolute() else Path(project_dir) / path


def _usable_voice_reference(path: Path) -> bool:
    if not path.exists() or not path.is_file():
        return False
    try:
        duration = probe_voice_sample_duration_seconds(path)
    except ValueError:
        return False
    return (
        MIN_USABLE_VOICE_REFERENCE_SECONDS
        <= duration
        <= MAX_USABLE_VOICE_REFERENCE_SECONDS
    )


def _stored_voice_is_usable(
    stored_path: str,
    *,
    project_dir: str | Path | None = None,
) -> bool:
    normalized = str(stored_path or "").strip()
    if not normalized:
        return False
    if project_dir is None:
        return True
    return _usable_voice_reference(_project_voice_path(project_dir, normalized))


def _character_voice_preview(character, project_preview_text: str = "") -> str:
    persisted_preview = str(project_preview_text or "").strip()
    if persisted_preview:
        return persisted_preview[:1024]
    name = str(getattr(character, "name", "") or "").strip()
    return (
        f"你好，我是{name}。很高兴与你相遇，请听我自然地说完接下来这段故事。"
    )[:1024]


_AGE_SLOT_LABELS = {
    "child": "幼年",
    "youth": "青年",
    "middle": "中年",
    "elder": "老年",
}


def _character_target_requirement(
    character,
    *,
    preview_text: str,
    target: str,
    slot: str = "",
    identity=None,
    additional_slots: tuple[str, ...] = (),
) -> VoiceDesignRequirement:
    character_name = str(getattr(character, "name", "") or "").strip()
    identity_id = str(getattr(identity, "identity_id", "") or "").strip()
    identity_name = str(getattr(identity, "identity_name", "") or "").strip()
    identity_age = str(getattr(identity, "age_group", "") or "").strip()
    prompt_age = identity_age or (
        slot
        if slot in AGE_GROUP_SLOTS
        else str(getattr(character, "age_group", "") or "")
    )
    if target == "identity":
        key = f"character:{character_name}:identity:{identity_id}"
        label = f"{character_name}·{identity_name or identity_id}"
    else:
        key = f"character:{character_name}:slot:{slot}"
        slot_label = _AGE_SLOT_LABELS.get(slot, "")
        label = f"{character_name}·{slot_label}" if slot_label else character_name
    preview = str(preview_text or "").strip() or _character_voice_preview(character)
    return VoiceDesignRequirement(
        key=key,
        target=target,
        label=label,
        voice_prompt=build_character_voice_prompt(
            character_name=character_name,
            gender=str(getattr(character, "gender", "") or ""),
            age_group=prompt_age,
            role=str(getattr(character, "role", "") or ""),
            description=str(getattr(character, "description", "") or ""),
            identity_name=identity_name,
        ),
        preview_text=preview[:1024],
        language=infer_voice_design_language(preview),
        character_name=character_name,
        identity_id=identity_id,
        slot=slot,
        additional_slots=additional_slots,
    )


def build_character_voice_requirement(
    characters: Iterable[object],
    *,
    speaker: str,
    preview_text: str,
) -> VoiceDesignRequirement | None:
    """Build the exact slot/identity requirement used by one dialogue speaker."""

    speaker_text = str(speaker or "").strip()
    if not speaker_text:
        return None
    display_name = speaker_text.split("_", 1)[0]
    character = next(
        (
            item
            for item in characters
            if speaker_text == str(getattr(item, "name", "") or "").strip()
            or speaker_text.startswith(
                f"{str(getattr(item, 'name', '') or '').strip()}_"
            )
            or display_name
            in {
                str(alias or "").strip()
                for alias in (getattr(item, "aliases", None) or [])
            }
        ),
        None,
    )
    if character is None:
        return None
    identity = next(
        (
            item
            for item in (getattr(character, "identities", None) or [])
            if str(getattr(item, "identity_id", "") or "").strip()
            == speaker_text
        ),
        None,
    )
    identity_age = str(getattr(identity, "age_group", "") or "").strip()
    identity_voice_path = str(
        getattr(identity, "reference_audio_path", "") or ""
    ).strip()
    if identity is not None and identity_voice_path:
        target = "identity"
        slot = ""
    elif identity is not None and identity_age in AGE_GROUP_SLOTS:
        target = "character_slot"
        slot = identity_age
    elif identity is not None:
        target = "identity"
        slot = ""
    else:
        target = "character_slot"
        slot = DEFAULT_SLOT
    return _character_target_requirement(
        character,
        preview_text=preview_text,
        target=target,
        slot=slot,
        identity=identity,
    )


def missing_character_voice_requirements(
    characters: Iterable[object],
    *,
    character_names: Iterable[str] = (),
    replace_existing: bool = False,
    project_dir: str | Path | None = None,
    preview_text_by_character: Mapping[str, str] | None = None,
    project_preview_text: str = "",
) -> tuple[tuple[VoiceDesignRequirement, ...], tuple[str, ...]]:
    """Describe missing voices, or explicitly selected voices to replace."""

    items = tuple(characters)
    requested = {
        str(name or "").strip() for name in character_names if str(name or "").strip()
    }
    if replace_existing and not requested:
        raise ValueError("覆盖重做声线时必须明确指定角色")
    available_names = {
        str(getattr(character, "name", "") or "").strip() for character in items
    }
    missing_names = sorted(requested - available_names)
    if missing_names:
        raise ValueError(f"未找到角色：{'、'.join(missing_names)}")

    requirements: list[VoiceDesignRequirement] = []
    skipped: list[str] = []
    previews = preview_text_by_character or {}
    for character in items:
        name = str(getattr(character, "name", "") or "").strip()
        if not name or (requested and name not in requested):
            continue
        preview = _character_voice_preview(
            character,
            str(previews.get(name) or project_preview_text or ""),
        )
        character_requirements: list[VoiceDesignRequirement] = []
        default_path = str(
            getattr(character, "reference_audio_path", "") or ""
        ).strip()
        default_usable = _stored_voice_is_usable(
            default_path,
            project_dir=project_dir,
        )

        samples = getattr(character, "voice_samples_by_age_group", None) or {}
        stored_age_slots: list[str] = []
        invalid_age_slots: list[str] = []
        for age_slot in AGE_GROUP_SLOTS:
            entry = samples.get(age_slot) if isinstance(samples, dict) else None
            stored_path = (
                str(entry.get("path") or "").strip()
                if isinstance(entry, dict)
                else ""
            )
            if not stored_path:
                continue
            stored_age_slots.append(age_slot)
            if project_dir is not None and not _stored_voice_is_usable(
                stored_path,
                project_dir=project_dir,
            ):
                invalid_age_slots.append(age_slot)

        base_age_slot = str(getattr(character, "age_group", "") or "").strip()
        mirrored_slots: tuple[str, ...] = ()
        if replace_existing:
            if base_age_slot in stored_age_slots:
                mirrored_slots = (base_age_slot,)
            character_requirements.append(
                _character_target_requirement(
                    character,
                    preview_text=preview,
                    target="character_slot",
                    slot=DEFAULT_SLOT,
                    additional_slots=mirrored_slots,
                )
            )
            age_slots_to_generate = [
                slot for slot in stored_age_slots if slot != base_age_slot
            ]
        else:
            age_slots_to_generate = invalid_age_slots
        if not replace_existing and not default_usable:
            if base_age_slot in invalid_age_slots:
                mirrored_slots = (base_age_slot,)
                age_slots_to_generate.remove(base_age_slot)
            character_requirements.append(
                _character_target_requirement(
                    character,
                    preview_text=preview,
                    target="character_slot",
                    slot=DEFAULT_SLOT,
                    additional_slots=mirrored_slots,
                )
            )

        for age_slot in age_slots_to_generate:
            character_requirements.append(
                _character_target_requirement(
                    character,
                    preview_text=preview,
                    target="character_slot",
                    slot=age_slot,
                )
            )

        for identity in getattr(character, "identities", None) or []:
            stored_path = str(
                getattr(identity, "reference_audio_path", "") or ""
            ).strip()
            identity_needs_voice = bool(stored_path) and (
                replace_existing
                or (
                    project_dir is not None
                    and not _stored_voice_is_usable(
                        stored_path,
                        project_dir=project_dir,
                    )
                )
            )
            if identity_needs_voice:
                character_requirements.append(
                    _character_target_requirement(
                        character,
                        preview_text=preview,
                        target="identity",
                        identity=identity,
                    )
                )

        if character_requirements:
            requirements.extend(character_requirements)
        else:
            skipped.append(name)
    return tuple(requirements), tuple(skipped)


async def provision_missing_character_voices(
    context: ProjectContext,
    characters: Iterable[object],
    *,
    character_names: Iterable[str] = (),
    replace_existing: bool = False,
    preview_text_by_character: Mapping[str, str] | None = None,
    project_preview_text: str = "",
    timeout_seconds: float = 600.0,
) -> tuple[tuple[str, ...], tuple[str, ...]]:
    """Generate missing voices or explicitly replace selected configured samples."""

    requirements, skipped = missing_character_voice_requirements(
        characters,
        character_names=character_names,
        replace_existing=replace_existing,
        project_dir=context.output_dir,
        preview_text_by_character=preview_text_by_character,
        project_preview_text=project_preview_text,
    )
    completed = await provision_voice_design_requirements(
        context,
        requirements,
        timeout_seconds=timeout_seconds,
    )
    return completed, skipped


def _persist_project_narrator(
    context: ProjectContext,
    source_path: Path,
) -> None:
    persist_narrator_voice_content(
        username=context.owner_username,
        project=context.project_name,
        project_dir=context.output_dir,
        filename=source_path.name,
        content=source_path.read_bytes(),
    )


def _persist_reusable_generated_voice(
    context: ProjectContext,
    requirement: VoiceDesignRequirement,
    source_path: Path,
) -> dict:
    from ai_anime.modules.creative_canvas.public import (
        CreateCreativeCanvasAudioVoiceCommand,
        creative_canvas_audio_library_use_cases,
    )

    return dict(
        creative_canvas_audio_library_use_cases().create_voice(
            CreateCreativeCanvasAudioVoiceCommand(
                context=context,
                name=requirement.label,
                filename=source_path.name,
                content=source_path.read_bytes(),
                mime_type="audio/wav",
            )
        )
    )


_RETRY_PREVIEW_BY_LANGUAGE = {
    "zh": "这是角色声线试听。请保持自然清晰的语气，完整说完这段校准内容。",
    "en": "This is a character voice preview. Please deliver this calibration line naturally and clearly.",
    "ja": "これはキャラクターボイスの試聴です。自然で明瞭な口調で、この調整用の台詞を最後まで話してください。",
    "ko": "캐릭터 음성 미리듣기입니다. 자연스럽고 또렷한 말투로 이 보정 문장을 끝까지 읽어 주세요.",
}


def _retry_preview(requirement: VoiceDesignRequirement) -> str:
    return _RETRY_PREVIEW_BY_LANGUAGE.get(
        requirement.language,
        _RETRY_PREVIEW_BY_LANGUAGE["en"],
    )[:1024]


async def _generate_usable_voice_design(
    requirement: VoiceDesignRequirement,
    *,
    temp_dir: str | Path,
    index: int,
    timeout_seconds: float,
) -> Path:
    usable: list[tuple[float, Path]] = []
    failures: list[str] = []
    attempts = (
        requirement,
        replace(
            requirement,
            preview_text=_retry_preview(requirement),
            language=requirement.language,
        ),
    )
    for attempt_index, attempt in enumerate(attempts, start=1):
        output_path = Path(temp_dir) / f"voice-{index}-{attempt_index}.wav"
        await write_model_audio_voice_design(
            output_path=output_path,
            voice_prompt=attempt.voice_prompt,
            preview_text=attempt.preview_text,
            model_selector=None,
            preferred_name="auto_voice",
            language=attempt.language,
            sample_rate=24000,
            response_format="wav",
            timeout_seconds=timeout_seconds,
        )
        try:
            duration = float(
                await call_blocking(
                    probe_voice_sample_duration_seconds,
                    output_path,
                )
            )
        except ValueError as exc:
            failures.append(str(exc))
            continue
        if (
            MIN_USABLE_VOICE_REFERENCE_SECONDS
            <= duration
            <= MAX_USABLE_VOICE_REFERENCE_SECONDS
        ):
            usable.append((duration, output_path))
            if duration >= RECOMMENDED_VOICE_REFERENCE_SECONDS:
                return output_path
        else:
            failures.append(f"生成结果为 {duration:.2f} 秒")
    if usable:
        return max(usable, key=lambda item: item[0])[1]
    detail = "；".join(failures) or "模型未返回可读取的音频"
    raise ValueError(
        "文字声线设计结果不符合视频参考声线要求 "
        f"（需 {MIN_USABLE_VOICE_REFERENCE_SECONDS:.1f}-"
        f"{MAX_USABLE_VOICE_REFERENCE_SECONDS:.1f} 秒）：{detail}"
    )


async def provision_voice_design_requirements(
    context: ProjectContext,
    requirements: Iterable[VoiceDesignRequirement],
    *,
    timeout_seconds: float = 600.0,
) -> tuple[str, ...]:
    """Generate and bind every distinct missing voice in dependency order."""

    unique_requirements = tuple(
        {requirement.key: requirement for requirement in requirements}.values()
    )
    if not unique_requirements:
        return ()

    # This is only a preflight.  The transport deliberately receives no explicit
    # selector below, so cloud and BYOK candidates still follow configured priority.
    try:
        resolve_model_for_role("AUDIO_VOICE_DESIGN")
    except PermissionError as exc:
        raise VoiceDesignModelUnavailable(str(exc)) from exc
    effective_timeout = min(max(float(timeout_seconds), 30.0), 600.0)
    store = await project_stores.make_sqlite_store_for_context(context)
    completed: list[str] = []
    try:
        voice_use_cases = character_voice_use_cases()
        with TemporaryDirectory(prefix="ai-anime-auto-voice-") as temp_dir:
            for index, requirement in enumerate(unique_requirements, start=1):
                try:
                    output_path = await _generate_usable_voice_design(
                        requirement,
                        temp_dir=temp_dir,
                        index=index,
                        timeout_seconds=effective_timeout,
                    )
                    _persist_reusable_generated_voice(
                        context,
                        requirement,
                        output_path,
                    )
                    if requirement.target == "project_narrator":
                        await call_blocking(
                            _persist_project_narrator,
                            context,
                            output_path,
                        )
                    elif requirement.target == "identity":
                        await voice_use_cases.bind_identity_sample(
                            repository=store,
                            project_dir=context.output_dir,
                            character_name=requirement.character_name,
                            identity_id=requirement.identity_id,
                            source_path=output_path,
                            media_url=lambda _path: "",
                        )
                    else:
                        await voice_use_cases.bind_sample(
                            repository=store,
                            project_dir=context.output_dir,
                            character_name=requirement.character_name,
                            slot=requirement.slot,
                            source_path=output_path,
                            media_url=lambda _path: "",
                        )
                        for additional_slot in requirement.additional_slots:
                            await voice_use_cases.bind_sample(
                                repository=store,
                                project_dir=context.output_dir,
                                character_name=requirement.character_name,
                                slot=additional_slot,
                                source_path=output_path,
                                media_url=lambda _path: "",
                            )
                except Exception as exc:
                    raise VoiceDesignProvisioningFailed(
                        f"{requirement.label}自动文字声线生成失败：{exc}"
                    ) from exc
                completed.append(requirement.label)
    finally:
        await store.close()
    return tuple(completed)


class ModelUsageVoiceDesignProvisioner:
    async def provision(
        self,
        context: ProjectContext,
        requirements: tuple[VoiceDesignRequirement, ...],
    ) -> tuple[str, ...]:
        return await provision_voice_design_requirements(context, requirements)


__all__ = [
    "ModelUsageVoiceDesignProvisioner",
    "VoiceDesignModelUnavailable",
    "VoiceDesignProvisioningFailed",
    "build_character_voice_requirement",
    "missing_character_voice_requirements",
    "provision_missing_character_voices",
    "provision_voice_design_requirements",
]
