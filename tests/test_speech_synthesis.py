from pathlib import Path

import pytest

from ai_anime.modules.model_usage.public import ModelQuotaExceededError


pytestmark = pytest.mark.m07


@pytest.fixture(autouse=True)
def _configured_model_access(monkeypatch):
    from ai_anime.modules.model_usage.public import configure_model_access
    import ai_anime.modules.production.infrastructure.media_generation.speech_synthesis as speech_synthesis

    async def fake_audio_duration(_audio_path: str) -> float:
        return 1.25

    monkeypatch.setattr(
        speech_synthesis,
        "get_audio_duration_async",
        fake_audio_duration,
    )
    configure_model_access(
        allows_custom_models=False,
        mode="mixed",
        model_assignments=[
            {"modelId": "audio-clone-model", "role": "AUDIO_VOICE_CLONE"},
        ],
    )
    yield
    configure_model_access(allows_custom_models=False, mode="mixed")


@pytest.mark.asyncio
async def test_speech_synthesis_forwards_the_generic_audio_contract(
    monkeypatch,
    tmp_path: Path,
) -> None:
    import ai_anime.modules.production.infrastructure.media_generation.speech_synthesis as speech_synthesis
    from ai_anime.modules.production.infrastructure.media_generation.speech_synthesis import (
        SpeechSynthesisClient,
    )

    calls: list[dict] = []

    async def write_audio(**kwargs) -> None:
        calls.append(kwargs)
        Path(kwargs["output_path"]).write_bytes(b"generated-audio")

    monkeypatch.setattr(speech_synthesis, "write_model_audio_speech", write_audio)
    output_path = tmp_path / "beat_03.mp3"
    client = SpeechSynthesisClient(timeout_seconds=12)

    result = await client.generate(
        prompt="你终于来了。",
        audio_url="data:audio/wav;base64,YWJj",
        output_path=output_path,
        emotion_prompt="压低声音，克制但急切",
    )

    assert client.model == "audio-clone-model"
    assert result.success is True
    assert result.audio_path == str(output_path)
    assert result.duration_seconds == 1.25
    assert output_path.read_bytes() == b"generated-audio"
    assert calls == [
        {
            "output_path": output_path,
            "model_role": "AUDIO_VOICE_CLONE",
            "input_text": "你终于来了。",
            "reference_audio": "data:audio/wav;base64,YWJj",
            "emotion_prompt": "压低声音，克制但急切",
            "timeout_seconds": 12.0,
        }
    ]


@pytest.mark.asyncio
async def test_speech_synthesis_returns_transport_failures(
    monkeypatch,
    tmp_path: Path,
) -> None:
    import ai_anime.modules.production.infrastructure.media_generation.speech_synthesis as speech_synthesis
    from ai_anime.modules.production.infrastructure.media_generation.speech_synthesis import (
        SpeechSynthesisClient,
    )

    async def fail_write(**_kwargs) -> None:
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr(speech_synthesis, "write_model_audio_speech", fail_write)

    result = await SpeechSynthesisClient().generate(
        prompt="测试",
        audio_url="https://example.com/reference.wav",
        output_path=tmp_path / "out.mp3",
    )

    assert result.success is False
    assert result.error == "RuntimeError: provider unavailable"


@pytest.mark.asyncio
async def test_speech_synthesis_reraises_remote_quota_rejection(
    monkeypatch,
    tmp_path: Path,
) -> None:
    import ai_anime.modules.production.infrastructure.media_generation.speech_synthesis as speech_synthesis
    from ai_anime.modules.production.infrastructure.media_generation.speech_synthesis import (
        SpeechSynthesisClient,
    )

    async def reject_write(**_kwargs) -> None:
        raise ModelQuotaExceededError(
            user_id="usr_1",
            required_units=3,
            available_units=0,
        )

    monkeypatch.setattr(speech_synthesis, "write_model_audio_speech", reject_write)

    with pytest.raises(ModelQuotaExceededError):
        await SpeechSynthesisClient().generate(
            prompt="测试",
            audio_url="https://example.com/reference.wav",
            output_path=tmp_path / "out.mp3",
        )


def test_speech_synthesis_resolves_the_selected_model() -> None:
    from ai_anime.modules.model_usage.public import configure_model_access
    from ai_anime.modules.production.infrastructure.media_generation.speech_synthesis import (
        SpeechSynthesisClient,
    )

    configure_model_access(
        allows_custom_models=True,
        mode="mixed",
        model_assignments=[
            {"modelId": "custom-audio-model", "role": "AUDIO_VOICE_CLONE"},
        ],
    )

    assert SpeechSynthesisClient().model == "custom-audio-model"
