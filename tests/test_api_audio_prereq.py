import pytest


@pytest.fixture(autouse=True)
def _configured_voice_clone_route():
    from ai_anime.modules.model_usage.public import configure_model_access

    configure_model_access(
        allows_custom_models=False,
        mode="mixed",
        model_assignments=[
            {"modelId": "audio-voice-clone-test", "role": "AUDIO_VOICE_CLONE"},
        ],
    )
    yield
    configure_model_access(allows_custom_models=False, mode="mixed")


@pytest.mark.asyncio
async def test_audio_generate_prereq_error_does_not_start_task(monkeypatch, tmp_path):
    from ai_anime.api.routes.production.audio_schemas import EpisodeAudioGenerateRequest
    from ai_anime.api.routes.production import audio as production_audio
    from ai_anime.modules.production.public import AudioVoicePrerequisitesMissing

    context = object()

    async def resolve_project(project, user, *, required_role="editor"):
        assert (project, user, required_role) == (
            "demo",
            {"username": "alice"},
            "editor",
        )
        return type("Resolution", (), {"ctx": context})()

    class _UseCases:
        async def generate(self, candidate, command):
            assert candidate is context
            assert command.episode_num == 3
            assert command.mode == "redo_selected"
            assert command.beat_numbers == [1]
            raise AudioVoicePrerequisitesMissing(
                ["Beat 01 解说声线缺失：请上传旁白声线"]
            )

    monkeypatch.setattr(production_audio, "resolve_project_scope", resolve_project)
    monkeypatch.setattr(production_audio, "episode_audio_use_cases", _UseCases)

    response = await production_audio.generate_audio(
        project="demo",
        episode_num=3,
        body=EpisodeAudioGenerateRequest(
            mode="redo_selected",
            beat_numbers=[1],
        ),
        user={"username": "alice"},
    )

    assert response == {
        "ok": False,
        "code": "voice_prereq_required",
        "error": "Beat 01 解说声线缺失：请上传旁白声线",
        "details": ["Beat 01 解说声线缺失：请上传旁白声线"],
    }
