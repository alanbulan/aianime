from ai_anime.modules.production.domain.single_video import (
    dialogue_only_video_model_error,
    missing_video_prompt_error,
    seedance2_initial_prompt,
    standard_video_prompt,
)


def test_seedance_pro_accepts_only_dialogue_beats() -> None:
    beats = [
        {"beat_number": number, "audio_type": "narration"}
        for number in range(1, 10)
    ]

    assert dialogue_only_video_model_error(beats, "seedance-1.5-pro") == (
        "Seedance 1.5 有声只允许用于 dialogue beat；当前包含非 dialogue Beat: "
        "1、2、3、4、5、6、7、8 等"
    )
    assert (
        dialogue_only_video_model_error(
            [{"beat_number": 1, "audio_type": "dialogue"}],
            "seedance-1.5-pro",
        )
        is None
    )
    assert dialogue_only_video_model_error(beats, "cloud-video-standard") is None


def test_video_prompt_rules_preserve_generation_modes() -> None:
    beat = {
        "video_prompt": "video prompt",
        "keyframe_prompt": "keyframe prompt",
    }

    assert seedance2_initial_prompt(beat, "first_frame") == "video prompt"
    assert seedance2_initial_prompt(beat, "keyframe") == "keyframe prompt"
    assert standard_video_prompt(beat, "first_frame") == "video prompt"
    assert standard_video_prompt(beat, "keyframe") == "keyframe prompt"
    assert missing_video_prompt_error(3) == (
        "Beat 3 缺少视频提示词，请先点击“生成本 Beat 提示词”。"
    )
