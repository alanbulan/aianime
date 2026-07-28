from pathlib import Path


def test_fish_speech_prompt_field_and_agent_are_removed() -> None:
    sources = {
        "script routes": Path("src/ai_anime/api/routes/scripts.py").read_text(encoding="utf-8"),
        "sqlite store": Path("src/ai_anime/sqlite_store.py").read_text(encoding="utf-8"),
        "models": Path("src/ai_anime/models.py").read_text(encoding="utf-8"),
        "cognee store": Path("src/ai_anime/cognee/store.py").read_text(encoding="utf-8"),
        "sketch edit tasks": Path("src/ai_anime/verification/sketch_edit_tasks.py").read_text(
            encoding="utf-8"
        ),
    }

    for name, source in sources.items():
        assert "fish_speech_prompt" not in source, name
        assert "build_fish_speech_prompt" not in source, name

    assert not Path("src/ai_anime/api/schemas.py").exists()
    assert not Path("src/ai_anime/agents/fish_speech_prompt_builder.py").exists()
    assert not Path("src/ai_anime/manual_shots.py").exists()


def test_fish_audio_tts_path_is_removed() -> None:
    tts_generator = Path("src/ai_anime/generators/tts_generator.py").read_text(encoding="utf-8")

    assert "class FishAudioTTSGenerator" not in tts_generator
