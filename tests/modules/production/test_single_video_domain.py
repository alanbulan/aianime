from ai_anime.modules.production.domain.single_video import (
    legacy_video_prompt,
    missing_video_prompt_error,
    seedance2_initial_prompt,
    seedance_pro_dialogue_error,
)


def test_seedance_pro_accepts_only_dialogue_beats() -> None:
    beats = [
        {"beat_number": number, "audio_type": "narration"}
        for number in range(1, 10)
    ]

    assert seedance_pro_dialogue_error(beats, "newapi_seedance-1.5-pro") == (
        "Seedance 1.5 有声只允许用于 dialogue beat；当前包含非 dialogue Beat: "
        "1、2、3、4、5、6、7、8 等"
    )
    assert (
        seedance_pro_dialogue_error(
            [{"beat_number": 1, "audio_type": "dialogue"}],
            "seedance_pro",
        )
        is None
    )
    assert seedance_pro_dialogue_error(beats, "comfyui") is None


def test_video_prompt_rules_preserve_backend_modes() -> None:
    beat = {
        "video_prompt": "video prompt",
        "keyframe_prompt": "keyframe prompt",
    }

    assert seedance2_initial_prompt(beat, "first_frame") == "video prompt"
    assert seedance2_initial_prompt(beat, "keyframe") == "keyframe prompt"
    assert legacy_video_prompt(beat, "first_frame") == "video prompt"
    assert legacy_video_prompt(beat, "keyframe") == "keyframe prompt"
    assert missing_video_prompt_error(3) == (
        "Beat 3 缺少视频提示词，请先点击“生成本 Beat 提示词”。"
    )
