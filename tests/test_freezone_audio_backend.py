from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from ai_anime import config
from ai_anime.modules.creative_canvas.infrastructure import (
    audio_generation,
    audio_voice_store,
)
from ai_anime.modules.creative_canvas.infrastructure.audio_generation import (
    freezone_audio_eleven_music_output_path,
    freezone_audio_speech_output_path,
)
from ai_anime.modules.creative_canvas.infrastructure.audio_voice_store import (
    CreativeCanvasVoiceResolution,
    USER_VOICE_SCOPE,
    create_user_audio_voice,
    list_user_audio_voices,
    resolve_user_audio_voice,
    user_audio_voices_index_path,
)
from ai_anime.model_access_policy import configure_model_access
from ai_anime.model_gateway_settings import MODE_CLOUD


class FakeTTSGenerator:
    calls = []

    def __init__(self, *, model: str) -> None:
        self.model = model

    async def generate(self, *, prompt, audio_url, output_path, emotion_prompt=""):
        from ai_anime.generators.tts_generator import TTSResult

        self.__class__.calls.append(
            {
                "prompt": prompt,
                "audio_url": audio_url,
                "output_path": Path(output_path),
                "emotion_prompt": emotion_prompt,
            }
        )
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        Path(output_path).write_bytes(b"generated-audio")
        return TTSResult(success=True, audio_path=str(output_path), duration_seconds=1.25)


@pytest.fixture(autouse=True)
def _reset_model_access() -> None:
    configure_model_access(allows_custom_models=False, mode=MODE_CLOUD)
    yield
    configure_model_access(allows_custom_models=False, mode=MODE_CLOUD)


def _isolate_settings_db(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(config, "STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.delenv("AI_ANIME_CONTROL_PLANE_DSN", raising=False)
    monkeypatch.delenv("MODEL_GATEWAY_MODE", raising=False)


class FakeProjectStore:
    def __init__(self, project_dir: Path):
        self.project_dir = str(project_dir)

    async def list_characters(self):
        from ai_anime.modules.asset_world.public import CharacterIdentity, NovelCharacter

        reference = (
            Path(self.project_dir)
            / "assets"
            / "characters"
            / "陆辰"
            / "identities"
            / "青年_voice.wav"
        )
        reference.parent.mkdir(parents=True, exist_ok=True)
        reference.write_bytes(b"main-character-reference")
        character = NovelCharacter(name="陆辰", gender="男", is_main=True)
        character.identities = [
            CharacterIdentity(
                identity_id="陆辰_青年",
                character_name="陆辰",
                identity_name="青年",
                reference_audio_path="assets/characters/陆辰/identities/青年_voice.wav",
                reference_audio_sha256="main-character-hash",
            )
        ]
        return [character]


def test_user_audio_voice_is_account_scoped_and_resolvable(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(audio_voice_store, "OUTPUT_DIR", str(tmp_path))
    monkeypatch.setattr(audio_voice_store, "audio_duration_ms", lambda _path: 1234)

    created = create_user_audio_voice(
        username="admin",
        name="  我的音色  ",
        filename="sample.mp3",
        content=b"fake-audio-bytes",
        mime_type="audio/mpeg",
    )

    assert created["scope"] == USER_VOICE_SCOPE
    assert created["voice_id"].startswith("fv_")
    assert created["name"] == "我的音色"
    assert created["duration_ms"] == 1234
    assert created["exists"] is True
    assert created["path"].startswith("_account/freezone/audio/voices/")
    assert "voices" in user_audio_voices_index_path("admin").read_text(encoding="utf-8")

    listed = list_user_audio_voices("admin")
    assert [item["voice_id"] for item in listed] == [created["voice_id"]]

    resolved = resolve_user_audio_voice("admin", created["voice_id"])
    assert resolved.source == USER_VOICE_SCOPE
    assert resolved.audio_path.exists()
    assert resolved.audio_path.read_bytes() == b"fake-audio-bytes"
    assert len(resolved.sha256) == 64


def test_create_user_audio_voice_rejects_unsupported_extension(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(audio_voice_store, "OUTPUT_DIR", str(tmp_path))

    with pytest.raises(ValueError, match="unsupported voice audio format"):
        create_user_audio_voice(
            username="admin",
            name="bad",
            filename="sample.txt",
            content=b"fake-audio-bytes",
        )


@pytest.mark.asyncio
async def test_user_custom_voice_generation_uses_requester_account(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    seen: list[tuple[str, str]] = []

    def fake_resolve_user_audio_voice(username: str, voice_id: str):
        seen.append((username, voice_id))
        return CreativeCanvasVoiceResolution(
            tmp_path / "viewer_voice.mp3",
            "sha",
            USER_VOICE_SCOPE,
        )

    monkeypatch.setattr(
        audio_voice_store,
        "resolve_user_audio_voice",
        fake_resolve_user_audio_voice,
    )

    resolved = await audio_generation._resolve_voice_ref(
        store=SimpleNamespace(),
        username="owner",
        account_voice_username="viewer",
        project_dir=tmp_path,
        voice_ref={"scope": USER_VOICE_SCOPE, "voice_id": "fv_viewer"},
    )

    assert seen == [("viewer", "fv_viewer")]
    assert resolved is not None
    assert resolved.source == USER_VOICE_SCOPE


@pytest.mark.asyncio
async def test_freezone_audio_speech_drama_first_person_uses_project_narrator(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.project_config import set_narrator_reference_audio, update_project_config_file
    from ai_anime.seedance2_i2v.voice_clone import file_sha256

    project_dir = tmp_path / "output" / "alice" / "demo"
    narrator = project_dir / "assets" / "narrator" / "voice.wav"
    narrator.parent.mkdir(parents=True, exist_ok=True)
    narrator.write_bytes(b"project-narrator-reference")
    narrator_sha = file_sha256(narrator)
    monkeypatch.setattr("ai_anime.project_config.OUTPUT_DIR", tmp_path / "state")
    monkeypatch.setattr(audio_generation, "IndexTTS2Client", FakeTTSGenerator)
    monkeypatch.setattr(
        audio_generation,
        "build_reference_audio_url",
        lambda path: f"data://{Path(path).name}",
    )
    FakeTTSGenerator.calls = []
    set_narrator_reference_audio(
        "alice",
        "demo",
        relative_path="assets/narrator/voice.wav",
        sha256=narrator_sha,
        updated_at="2026-05-12T00:00:00+00:00",
    )
    update_project_config_file(
        "alice",
        "demo",
        lambda config: config.update(
            {"spine_template": "drama", "narration_style": "first_person"}
        ),
    )

    result = await audio_generation.generate_freezone_audio_speech(
        store=FakeProjectStore(project_dir),
        username="alice",
        project="demo",
        project_dir=project_dir,
        job_id="job-1",
        model="audio-speech-1",
        text="画外音响起。",
    )

    assert result.voice_source == "project_narrator"
    assert result.voice_sha256 == narrator_sha
    assert FakeTTSGenerator.calls == [
        {
            "prompt": "画外音响起。",
            "audio_url": "data://voice.wav",
            "output_path": freezone_audio_speech_output_path(project_dir, "job-1"),
            "emotion_prompt": "以第三人称旁白视角，用客观冷静的解说语气朗读",
        }
    ]


@pytest.mark.asyncio
async def test_freezone_audio_eleven_music_uses_newapi_music_metadata(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict] = []

    async def fake_write_model_audio_speech(**kwargs):
        calls.append(kwargs)
        output_path = Path(kwargs["output_path"])
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"music")

    monkeypatch.setattr(
        audio_generation,
        "write_model_audio_speech",
        fake_write_model_audio_speech,
    )
    monkeypatch.setattr(audio_voice_store, "audio_duration_ms", lambda _path: 0)

    result = await audio_generation.generate_freezone_audio_eleven_music(
        project_dir=tmp_path,
        job_id="music-1",
        model="audio-music-1",
        prompt="Mysterious original soundtrack, rainforest.",
        music_length_ms=30_000,
        force_instrumental=True,
        respect_sections_durations=True,
        output_format="mp3_44100_128",
    )

    assert result.model == "audio-music-1"
    assert result.duration_ms == 30_000
    assert result.voice_source == "audio-music-1"
    assert calls == [
        {
                "output_path": freezone_audio_eleven_music_output_path(tmp_path, "music-1"),
                "model": "audio-music-1",
                "model_role": "AUDIO_MUSIC",
                "input_text": "Mysterious original soundtrack, rainforest.",
            "response_format": "mp3",
            "metadata": {
                "music_length_ms": 30_000,
                "force_instrumental": True,
                "respect_sections_durations": True,
                "output_format": "mp3_44100_128",
            },
            "timeout_seconds": 900.0,
        }
    ]


@pytest.mark.asyncio
async def test_freezone_audio_eleven_music_rejects_out_of_range_length(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="music_length_ms"):
        await audio_generation.generate_freezone_audio_eleven_music(
            project_dir=tmp_path,
            job_id="music-short",
            model="audio-music-1",
            prompt="short sting",
            music_length_ms=2999,
        )
