"""Local speech and music generation runtime for Creative Canvas."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.production.public import SpeechSynthesisClient
from ai_anime.modules.model_usage.public import (
    resolve_model_for_role,
    resolve_model_route,
    write_model_audio_music,
    write_model_audio_speech,
)
from ai_anime.modules.creative_canvas.application.audio_generation import (
    CreativeCanvasGeneratedAudio,
)
from ai_anime.modules.creative_canvas.infrastructure import audio_voice_store
from ai_anime.modules.creative_canvas.infrastructure.audio_voice_store import (
    CreativeCanvasVoiceResolution,
    USER_VOICE_SCOPE,
)
from ai_anime.modules.creative_canvas.infrastructure.paths import outputs_dir
from ai_anime.modules.project_workspace.public import (
    load_effective_narration_style_for_voice,
    load_narrator_reference_audio,
)
from ai_anime.modules.production.public import (
    build_reference_audio_url,
    file_sha256,
    narration_style_prompt,
    resolve_character_voice,
    resolve_narrator_source,
)
from ai_anime.shared.utils.async_ops import call_blocking

def freezone_audio_speech_output_path(project_dir: Path, job_id: str) -> Path:
    return outputs_dir(project_dir, "freezone_audio_speech") / f"{job_id}.mp3"


def freezone_audio_music_output_path(
    project_dir: Path,
    job_id: str,
) -> Path:
    return outputs_dir(project_dir, "freezone_audio_music") / f"{job_id}.mp3"


def _project_path(project_dir: Path, stored_path: str) -> Path | None:
    value = str(stored_path or "").strip()
    if not value:
        return None
    path = Path(value)
    if not path.is_absolute():
        path = project_dir / path
    return path if path.exists() else None


async def _resolve_voice_ref(
    *,
    store: Any,
    username: str,
    account_voice_username: str | None = None,
    project_dir: Path,
    voice_ref: dict | None,
) -> CreativeCanvasVoiceResolution | None:
    if not isinstance(voice_ref, dict):
        return None

    scope = str(voice_ref.get("scope") or "").strip()
    character_name = str(voice_ref.get("character_name") or "").strip()
    identity_id = str(voice_ref.get("identity_id") or "").strip()
    slot = str(voice_ref.get("slot") or "").strip()

    if scope == USER_VOICE_SCOPE:
        return audio_voice_store.resolve_user_audio_voice(
            account_voice_username or username,
            str(voice_ref.get("voice_id") or ""),
        )

    characters = list(await store.list_characters())

    def find_character() -> Any | None:
        return next(
            (
                item
                for item in characters
                if str(getattr(item, "name", "") or "") == character_name
            ),
            None,
        )

    if scope == "character_default":
        character = find_character()
        path = _project_path(
            project_dir,
            getattr(character, "reference_audio_path", "") if character else "",
        )
        if path is None:
            raise RuntimeError(f"角色默认声线不可用: {character_name or '<空>'}")
        sha256 = str(
            getattr(character, "reference_audio_sha256", "") or ""
        ) or file_sha256(path)
        return CreativeCanvasVoiceResolution(path, sha256, "character_default")

    if scope == "character_age_group":
        character = find_character()
        samples = (
            getattr(character, "voice_samples_by_age_group", None) or {}
            if character
            else {}
        )
        entry = samples.get(slot) if isinstance(samples, dict) else None
        path = _project_path(
            project_dir,
            entry.get("path", "") if isinstance(entry, dict) else "",
        )
        if path is None:
            raise RuntimeError(
                f"角色年龄段声线不可用: {character_name or '<空>'}/{slot or '<空>'}"
            )
        sha256 = str(entry.get("sha256", "") or "") if isinstance(entry, dict) else ""
        return CreativeCanvasVoiceResolution(
            path,
            sha256 or file_sha256(path),
            "character_age_group",
        )

    if scope in {"identity", "identity_resolved"}:
        character = find_character()
        identity = None
        if character is not None:
            identity = next(
                (
                    item
                    for item in list(getattr(character, "identities", None) or [])
                    if str(getattr(item, "identity_id", "") or "") == identity_id
                ),
                None,
            )
        if character is None or identity is None:
            raise RuntimeError(
                f"身份声线不可用: {character_name or '<空>'}/{identity_id or '<空>'}"
            )
        if scope == "identity":
            path = _project_path(
                project_dir,
                getattr(identity, "reference_audio_path", ""),
            )
            if path is None:
                raise RuntimeError(f"身份声线未配置: {identity_id}")
            sha256 = str(
                getattr(identity, "reference_audio_sha256", "") or ""
            ) or file_sha256(path)
            return CreativeCanvasVoiceResolution(path, sha256, "identity")
        resolved = resolve_character_voice(
            project_dir=project_dir,
            character=character,
            identity=identity,
        )
        if resolved.audio_path is None:
            raise RuntimeError(f"身份实际声线不可用: {identity_id}")
        return CreativeCanvasVoiceResolution(
            resolved.audio_path,
            resolved.sha256 or file_sha256(resolved.audio_path),
            f"identity_resolved:{resolved.tier or 'unknown'}",
        )

    return None


async def generate_freezone_audio_speech(
    *,
    store: Any,
    username: str,
    project: str,
    account_voice_username: str | None = None,
    project_dir: Path,
    job_id: str,
    text: str,
    emotion_prompt: str = "",
    voice_ref: dict | None = None,
    mode: str = "VOICE_CLONE",
    voice: str = "",
    model_selector: str | None = None,
) -> CreativeCanvasGeneratedAudio:
    clean_text = str(text or "").strip()
    if not clean_text:
        raise ValueError("text is required")

    clean_mode = str(mode or "VOICE_CLONE").strip().upper()
    if clean_mode not in {"SPEECH", "VOICE_CLONE"}:
        raise ValueError("mode must be SPEECH or VOICE_CLONE")
    output_path = freezone_audio_speech_output_path(project_dir, job_id)
    if clean_mode == "SPEECH":
        clean_voice = str(voice or "").strip()
        route = resolve_model_route(model_selector)
        if not clean_voice and not route.selector.startswith("byok:"):
            raise ValueError("voice is required when mode is SPEECH")
        if voice_ref is not None:
            raise ValueError("voice_ref is not allowed when mode is SPEECH")
        model_name = route.model or resolve_model_for_role("AUDIO_SPEECH")
        await write_model_audio_speech(
            output_path=output_path,
            model_role="AUDIO_SPEECH",
            input_text=clean_text,
            model_selector=route.selector or None,
            voice=clean_voice,
            response_format="mp3",
            timeout_seconds=600.0,
        )
        if not output_path.exists() or output_path.stat().st_size <= 0:
            raise RuntimeError("speech audio file was not created")
        duration_ms = await call_blocking(
            audio_voice_store.audio_duration_ms,
            output_path,
        )
        return CreativeCanvasGeneratedAudio(
            audio_path=output_path,
            duration_ms=duration_ms,
            mime_type="audio/mpeg",
            model=model_name,
            voice_source=f"model_preset:{clean_voice or 'default'}",
            voice_sha256="",
        )

    if str(voice or "").strip():
        raise ValueError("voice is not allowed when mode is VOICE_CLONE")

    narration_style = load_effective_narration_style_for_voice(username, project)
    selected_voice = await _resolve_voice_ref(
        store=store,
        username=username,
        account_voice_username=account_voice_username,
        project_dir=project_dir,
        voice_ref=voice_ref,
    )
    if selected_voice is None:
        descriptor = load_narrator_reference_audio(username, project)
        characters = (
            await store.list_characters()
            if narration_style == "first_person"
            else None
        )
        voice = resolve_narrator_source(
            store=store,
            narration_style=narration_style,
            project_narrator_stored_path=descriptor.get("path", ""),
            characters=characters,
        )
        if voice.audio_path is None:
            raise RuntimeError(voice.error or "解说声线缺失")
        selected_voice = CreativeCanvasVoiceResolution(
            voice.audio_path,
            voice.sha256,
            voice.source or "project_narrator",
        )

    model_name = resolve_model_for_role("AUDIO_VOICE_CLONE")
    generator = SpeechSynthesisClient()
    result = await generator.generate(
        prompt=clean_text,
        audio_url=build_reference_audio_url(selected_voice.audio_path),
        output_path=output_path,
        emotion_prompt=(
            str(emotion_prompt or "").strip()
            or narration_style_prompt(narration_style)
        ),
    )
    if not result.success:
        raise RuntimeError(result.error or "Speech generation failed")

    duration_ms = int((result.duration_seconds or 0) * 1000)
    if duration_ms <= 0:
        duration_ms = await call_blocking(
            audio_voice_store.audio_duration_ms,
            output_path,
        )
    return CreativeCanvasGeneratedAudio(
        audio_path=output_path,
        duration_ms=duration_ms,
        mime_type="audio/mpeg",
        model=model_name,
        voice_source=selected_voice.source,
        voice_sha256=selected_voice.sha256,
    )


def _audio_mime_type(response_format: str) -> str:
    response_format = str(response_format or "mp3").strip().lower()
    return {
        "mp3": "audio/mpeg",
        "opus": "audio/opus",
        "pcm": "audio/L16",
        "ulaw": "audio/basic",
        "alaw": "audio/x-alaw-basic",
    }.get(response_format, "audio/mpeg")


def _audio_suffix(response_format: str) -> str:
    response_format = str(response_format or "mp3").strip().lower()
    return {
        "mp3": ".mp3",
        "opus": ".opus",
        "pcm": ".pcm",
        "ulaw": ".ulaw",
        "alaw": ".alaw",
    }.get(response_format, ".mp3")


async def generate_freezone_audio_music(
    *,
    project_dir: Path,
    job_id: str,
    prompt: str,
    music_length_ms: int = 30_000,
    force_instrumental: bool = True,
    respect_sections_durations: bool = True,
    output_format: str = "mp3_44100_128",
    response_format: str = "mp3",
) -> CreativeCanvasGeneratedAudio:
    clean_prompt = str(prompt or "").strip()
    if not clean_prompt:
        raise ValueError("prompt is required")
    length = int(music_length_ms or 0)
    if length < 3_000 or length > 600_000:
        raise ValueError("music_length_ms must be between 3000 and 600000")

    response_format = str(response_format or "mp3").strip() or "mp3"
    output_path = freezone_audio_music_output_path(project_dir, job_id)
    if _audio_suffix(response_format) != ".mp3":
        output_path = output_path.with_suffix(_audio_suffix(response_format))

    parameters: dict[str, Any] = {
        "force_instrumental": bool(force_instrumental),
        "respect_sections_durations": bool(respect_sections_durations),
        "output_format": (
            str(output_format or "mp3_44100_128").strip() or "mp3_44100_128"
        ),
    }

    model_name = resolve_model_for_role("AUDIO_MUSIC")
    await write_model_audio_music(
        output_path=output_path,
        prompt=clean_prompt,
        duration_seconds=length / 1000,
        response_format=response_format,
        parameters=parameters,
        timeout_seconds=900.0,
    )
    if not output_path.exists() or output_path.stat().st_size <= 0:
        raise RuntimeError("music audio file was not created")
    try:
        duration_ms = await call_blocking(
            audio_voice_store.audio_duration_ms,
            output_path,
        )
    except ValueError:
        if response_format.lower() not in {"pcm", "ulaw", "alaw"}:
            raise
        duration_ms = length
    duration_ms = duration_ms or length
    return CreativeCanvasGeneratedAudio(
        audio_path=output_path,
        duration_ms=duration_ms,
        mime_type=_audio_mime_type(response_format),
        model=model_name,
        voice_source=model_name,
        voice_sha256="",
    )
