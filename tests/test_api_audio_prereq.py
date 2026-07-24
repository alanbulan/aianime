import pytest


@pytest.mark.asyncio
async def test_audio_generate_prereq_error_does_not_start_task(monkeypatch, tmp_path):
    from ai_anime.api.routes import generation
    from ai_anime.api.schemas import TTSGenerateRequest
    from ai_anime.modules.production.public import AudioVoicePrerequisitesMissing

    context = object()

    async def resolve_project(project, user, required_role="editor"):
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

    monkeypatch.setattr(generation, "_resolve_generation_project", resolve_project)
    monkeypatch.setattr(generation, "episode_audio_use_cases", _UseCases)

    response = await generation.generate_audio(
        project="demo",
        episode_num=3,
        body=TTSGenerateRequest(mode="redo_selected", beat_numbers=[1]),
        user={"username": "alice"},
    )

    assert response == {
        "ok": False,
        "code": "voice_prereq_required",
        "error": "Beat 01 解说声线缺失：请上传旁白声线",
    }
