from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.production.infrastructure import seedance2_pipeline


def test_seedance2_reference_audio_allows_one_twelve_second_clip(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    audio_path = tmp_path / "voice.mp3"
    monkeypatch.setattr(
        seedance2_pipeline,
        "probe_voice_sample_duration_seconds",
        lambda _path: 12.0,
    )

    seedance2_pipeline._validate_reference_audio_request([str(audio_path)])


def test_seedance2_reference_audio_error_states_total_limit_and_recommendation(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    durations = {
        str(tmp_path / "voice-1.mp3"): 6.0,
        str(tmp_path / "voice-2.mp3"): 6.0,
        str(tmp_path / "voice-3.mp3"): 6.0,
    }
    monkeypatch.setattr(
        seedance2_pipeline,
        "probe_voice_sample_duration_seconds",
        durations.__getitem__,
    )

    with pytest.raises(
        ValueError,
        match=r"每段需至少 1\.8 秒，合计不超过 15\.2 秒.*建议.*3-5 秒",
    ):
        seedance2_pipeline._validate_reference_audio_request(list(durations))
