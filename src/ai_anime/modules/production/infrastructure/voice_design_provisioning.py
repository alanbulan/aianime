"""Provision missing production voices through the configured voice-design route."""

from __future__ import annotations

import hashlib
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Iterable

from ai_anime.modules.asset_world.public import character_voice_use_cases
from ai_anime.modules.model_usage.public import (
    resolve_model_for_role,
    write_model_audio_voice_design,
)
from ai_anime.modules.production.domain.voice_design import VoiceDesignRequirement
from ai_anime.modules.project_workspace.public import (
    ProjectContext,
    set_narrator_reference_audio,
)
from ai_anime.shared.infrastructure import project_stores


class VoiceDesignModelUnavailable(PermissionError):
    """Raised when no priority route can serve AUDIO_VOICE_DESIGN."""

    code = "voice_design_model_unavailable"


class VoiceDesignProvisioningFailed(RuntimeError):
    """Raised when the configured voice-design route fails to create a voice."""

    code = "voice_design_failed"


def _file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _persist_project_narrator(
    context: ProjectContext,
    source_path: Path,
) -> None:
    relative_path = Path("assets") / "narrator" / "voice.wav"
    target_path = Path(context.output_dir) / relative_path
    target_path.parent.mkdir(parents=True, exist_ok=True)
    staged_path = target_path.with_name(".voice.auto-design.tmp")
    shutil.copyfile(source_path, staged_path)
    staged_path.replace(target_path)
    set_narrator_reference_audio(
        context.owner_username,
        context.project_name,
        relative_path=relative_path.as_posix(),
        sha256=_file_sha256(target_path),
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
                output_path = Path(temp_dir) / f"voice-{index}.wav"
                try:
                    await write_model_audio_voice_design(
                        output_path=output_path,
                        voice_prompt=requirement.voice_prompt,
                        preview_text=requirement.preview_text,
                        model_selector=None,
                        preferred_name="auto_voice",
                        language=requirement.language,
                        sample_rate=24000,
                        response_format="wav",
                        timeout_seconds=effective_timeout,
                    )
                    if requirement.target == "project_narrator":
                        _persist_project_narrator(context, output_path)
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
    "provision_voice_design_requirements",
]
