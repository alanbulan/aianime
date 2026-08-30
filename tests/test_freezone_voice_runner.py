from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.infrastructure.runners import freezone


def _context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="project-1",
        project_name="demo",
        owner_type="user",
        owner_id="owner-1",
        owner_username="owner",
        requester_user_id="viewer-1",
        requester_username="viewer",
        requester_principals=(("user", "viewer-1"),),
        effective_role="editor",
        home_node_id="local",
        output_dir=tmp_path / "output",
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
        is_home_node=True,
    )


@pytest.mark.asyncio
async def test_generated_voice_binding_persists_project_narrator(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.modules.asset_world import public as asset_world_public
    from ai_anime.modules.creative_canvas import public as creative_canvas_public
    from ai_anime.modules.project_workspace import public as project_workspace_public

    context = _context(tmp_path)
    source_path = tmp_path / "voice.wav"
    source_path.write_bytes(b"voice")
    seen: list[object] = []

    class AudioLibrary:
        def get_voice(self, query):
            seen.append(query)
            return source_path

    def persist(ctx: ProjectContext, source: Path):
        assert ctx is context
        assert source == source_path
        return {"reference_path": "assets/narrator/voice.wav", "sha256": "abc"}

    monkeypatch.setattr(
        creative_canvas_public,
        "creative_canvas_audio_library_use_cases",
        lambda: AudioLibrary(),
    )
    monkeypatch.setattr(
        asset_world_public,
        "probe_voice_sample_duration_seconds",
        lambda _path: 4.0,
    )
    monkeypatch.setattr(
        project_workspace_public,
        "persist_narrator_voice_source",
        persist,
    )

    result = await freezone._bind_generated_voice(
        ctx=context,
        voice_id="voice-1",
        binding={"kind": "project_narrator"},
    )

    assert result == {
        "reference_path": "assets/narrator/voice.wav",
        "sha256": "abc",
    }
    assert len(seen) == 1
    assert seen[0].context is context
    assert seen[0].voice_id == "voice-1"


@pytest.mark.asyncio
async def test_generated_voice_binding_updates_character_identity_and_closes_store(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.modules.asset_world import public as asset_world_public
    from ai_anime.modules.creative_canvas import public as creative_canvas_public
    from ai_anime.shared.infrastructure import project_stores

    context = _context(tmp_path)
    source_path = tmp_path / "voice.wav"
    source_path.write_bytes(b"voice")
    captured: dict[str, object] = {}

    class AudioLibrary:
        def get_voice(self, _query):
            return source_path

    class Store:
        closed = False

        async def close(self) -> None:
            self.closed = True

    class CharacterVoices:
        async def bind_identity_sample(self, **kwargs):
            captured.update(kwargs)
            return {"identity_id": kwargs["identity_id"], "bound": True}

    store = Store()

    async def make_store(ctx: ProjectContext):
        assert ctx is context
        return store

    monkeypatch.setattr(
        creative_canvas_public,
        "creative_canvas_audio_library_use_cases",
        lambda: AudioLibrary(),
    )
    monkeypatch.setattr(
        asset_world_public,
        "probe_voice_sample_duration_seconds",
        lambda _path: 4.0,
    )
    monkeypatch.setattr(
        asset_world_public,
        "character_voice_use_cases",
        lambda: CharacterVoices(),
    )
    monkeypatch.setattr(project_stores, "make_sqlite_store_for_context", make_store)

    result = await freezone._bind_generated_voice(
        ctx=context,
        voice_id="voice-1",
        binding={
            "kind": "identity",
            "character_name": "夏栀",
            "identity_id": "夏栀_青年",
        },
    )

    assert result == {"identity_id": "夏栀_青年", "bound": True}
    assert captured["repository"] is store
    assert captured["project_dir"] == context.output_dir
    assert captured["character_name"] == "夏栀"
    assert captured["identity_id"] == "夏栀_青年"
    assert captured["source_path"] == source_path
    assert captured["media_url"](source_path) == ""
    assert store.closed is True


@pytest.mark.asyncio
async def test_generated_voice_binding_rejects_invalid_reference_duration(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.modules.asset_world import public as asset_world_public
    from ai_anime.modules.creative_canvas import public as creative_canvas_public
    from ai_anime.modules.project_workspace import public as project_workspace_public

    context = _context(tmp_path)
    source_path = tmp_path / "voice.wav"
    source_path.write_bytes(b"voice")

    monkeypatch.setattr(
        creative_canvas_public,
        "creative_canvas_audio_library_use_cases",
        lambda: type(
            "AudioLibrary",
            (),
            {"get_voice": lambda _self, _query: source_path},
        )(),
    )
    monkeypatch.setattr(
        asset_world_public,
        "probe_voice_sample_duration_seconds",
        lambda _path: 15.201,
    )
    monkeypatch.setattr(
        project_workspace_public,
        "persist_narrator_voice_source",
        lambda *_args: pytest.fail("invalid voice must not be persisted"),
    )

    with pytest.raises(ValueError, match=r"1\.8-15\.2 秒.*15\.201 秒"):
        await freezone._bind_generated_voice(
            ctx=context,
            voice_id="voice-1",
            binding={"kind": "project_narrator"},
        )
