"""IndexTTS2 and Production Seedance2 smoke tests."""

from __future__ import annotations

import asyncio
import importlib

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


def test_indextts2_client_module_loads():
    mod = importlib.import_module(
        "ai_anime.modules.production.infrastructure.media_generation.indextts2"
    )
    assert hasattr(mod, "IndexTTS2Client")


def test_voice_audio_records_module_loads():
    mod = importlib.import_module("ai_anime.modules.production.infrastructure.seedance2_voice_records")
    assert hasattr(mod, "classify_seedance2_voice_audio")
    assert hasattr(mod, "upsert_seedance2_voice_audio_record")


def test_character_voice_storage_module_loads():
    mod = importlib.import_module(
        "ai_anime.modules.asset_world.infrastructure.character_voice_storage"
    )
    assert hasattr(mod, "persist_character_voice_file")
    assert hasattr(mod, "decode_recorded_audio_data_url")


def test_voice_clone_module_loads_without_oss_client():
    mod = importlib.import_module("ai_anime.modules.production.infrastructure.seedance2_voice")
    assert hasattr(mod, "build_reference_audio_url")
    assert hasattr(mod, "MAX_REFERENCE_AUDIO_BYTES")


def test_audio_request_usage_module_loads():
    mod = importlib.import_module(
        "ai_anime.modules.model_usage.infrastructure.audio_request_usage"
    )
    assert mod is not None


def test_production_public_exports_seedance2_runtime_contract():
    public = importlib.import_module("ai_anime.modules.production.public")
    assert "Seedance2I2VMode" in public.__all__
    assert "prepare_seedance2_generation_inputs" in public.__all__


def test_indextts2_client_reports_missing_model_base_url(monkeypatch, tmp_path):
    import ai_anime.modules.production.infrastructure.media_generation.indextts2 as indextts2

    from ai_anime.modules.production.infrastructure.media_generation.indextts2 import (
        IndexTTS2Client,
    )

    async def fake_reserve(model, *, source, billable_chars):
        return "reservation_1"

    async def fake_refund(*args, **kwargs):
        return None

    async def missing_transport(**kwargs):
        _ = kwargs
        raise ValueError("Model Base URL is not configured.")

    monkeypatch.setattr(indextts2, "_reserve_tts_model_call", fake_reserve)
    monkeypatch.setattr(indextts2, "_refund_tts_model_call", fake_refund)
    monkeypatch.setattr(indextts2, "write_model_audio_speech", missing_transport)
    client = IndexTTS2Client()
    result = asyncio.run(
        client.generate(
            prompt="hello",
            audio_url="https://example.com/sample.mp3",
            output_path=tmp_path / "out.mp3",
        )
    )
    assert not result.success
    assert "Base URL" in (result.error or "")


def test_indextts2_client_rejects_empty_prompt(tmp_path):
    from ai_anime.modules.production.infrastructure.media_generation.indextts2 import (
        IndexTTS2Client,
    )

    client = IndexTTS2Client()
    result = asyncio.run(
        client.generate(
            prompt="",
            audio_url="https://example.com/x.mp3",
            output_path=tmp_path / "out.mp3",
        )
    )
    assert not result.success
    assert "prompt" in (result.error or "").lower() or "empty" in (result.error or "").lower()


def test_build_reference_audio_url_size_guard(tmp_path):
    from ai_anime.modules.production.infrastructure.seedance2_voice import (
        MAX_REFERENCE_AUDIO_BYTES,
        build_reference_audio_url,
    )

    big = tmp_path / "big.mp3"
    big.write_bytes(b"\x00" * (MAX_REFERENCE_AUDIO_BYTES + 1))
    with pytest.raises(ValueError, match="Re-encode"):
        build_reference_audio_url(big)


def test_build_reference_audio_url_returns_data_url(tmp_path):
    from ai_anime.modules.production.infrastructure.seedance2_voice import build_reference_audio_url

    small = tmp_path / "small.mp3"
    small.write_bytes(b"ID3\x03\x00\x00\x00fake-mp3-bytes")
    url = build_reference_audio_url(small)
    assert url.startswith("data:")
