from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.generators.video_generator import (
    CommercialVideoGenerator,
    VideoGenResult,
    VideoGenStatus,
)
from ai_anime.model_access_policy import configure_model_access
from ai_anime.modules.creative_canvas.infrastructure.video_generation import (
    ConfiguredCreativeCanvasVideoModelPolicy,
)
from ai_anime.modules.creative_canvas.public import (
    GenerateCreativeCanvasVideoJobCommand,
    build_freezone_image_to_video_prompt,
    build_freezone_keyframe_video_prompt,
    build_freezone_omni_video_prompt,
    build_freezone_video_prompt,
    creative_canvas_job_execution_use_cases,
    get_video_camera_template,
    normalize_video_aspect_ratio,
    normalize_video_resolution,
    summarize_omni_reference_counts,
    validate_omni_reference_limits,
)


def test_build_freezone_video_prompt_includes_camera_template_and_character_names() -> None:
    prompt = build_freezone_video_prompt(
        user_prompt="赛博朋克街头，角色缓慢向前走",
        camera_template_id="follow_tracking",
        character_names=["林小满", "阿七"],
        marks=[{"label": "老人", "point_x": 0.2, "point_y": 0.5}],
    )

    assert "赛博朋克街头" in prompt
    assert "跟随拍摄" in prompt
    assert "林小满、阿七" in prompt
    assert "重点元素标记" in prompt
    assert "老人" in prompt


def test_video_camera_template_lookup_works() -> None:
    template = get_video_camera_template("locked_off")

    assert template is not None
    assert template["name"] == "固定镜头"


def test_video_ratio_and_resolution_normalization() -> None:
    assert normalize_video_aspect_ratio("auto") == "16:9"
    assert normalize_video_aspect_ratio("9:16") == "9:16"
    assert normalize_video_resolution("720P") == "720p"


def test_build_freezone_omni_video_prompt_includes_theme() -> None:
    prompt = build_freezone_omni_video_prompt(
        user_prompt="雨夜中老人躺在病床上，年轻男子伸手整理氧气管。",
        theme="压抑、克制、纪实感",
        camera_template_id="orbit_up",
        marks=[{"label": "氧气管", "point_x": 0.7, "point_y": 0.6}],
    )

    assert "压抑、克制、纪实感" in prompt
    assert "盘旋抬升" in prompt
    assert "氧气管" in prompt


def test_build_freezone_image_to_video_prompt_includes_first_frame_and_marks() -> None:
    prompt = build_freezone_image_to_video_prompt(
        user_prompt="老人缓慢抬眼，呼吸微弱。",
        camera_template_id="pedestal_up",
        marks=[
            {
                "label": "老人",
                "point_x": 0.15,
                "point_y": 0.45,
                "note": "主体",
            }
        ],
    )

    assert "老人缓慢抬眼" in prompt
    assert "镜头上升" in prompt
    assert "老人" in prompt
    assert "主体" in prompt
    assert "首帧约束" in prompt


def test_build_freezone_image_to_video_prompt_supports_multi_image_references() -> None:
    prompt = build_freezone_image_to_video_prompt(
        user_prompt="老人微微抬头，保持病房压抑氛围。",
        camera_template_id="follow_tracking",
        reference_image_count=3,
    )

    assert "图片参考约束" in prompt
    assert "多张输入图片" in prompt
    assert "跟随拍摄" in prompt


def test_build_freezone_keyframe_video_prompt_handles_first_and_last_frame() -> None:
    prompt = build_freezone_keyframe_video_prompt(
        user_prompt="老人抬眼后镜头缓慢推进到病床侧面。",
        camera_template_id="pedestal_up",
        marks=[{"label": "老人", "point_x": 0.4, "point_y": 0.4}],
        has_first_frame=True,
        has_last_frame=True,
    )

    assert "老人抬眼后镜头缓慢推进到病床侧面" in prompt
    assert "镜头上升" in prompt
    assert "首尾帧约束" in prompt
    assert "老人" in prompt


def test_commercial_video_model_policy_requires_and_preserves_explicit_sku() -> None:
    policy = ConfiguredCreativeCanvasVideoModelPolicy()
    with pytest.raises(ValueError, match="video model is required"):
        policy.resolve_model(None)
    assert policy.resolve_model("Cloud-Video-Pro") == "Cloud-Video-Pro"


def test_commercial_video_generator_enforces_byok_model_role() -> None:
    configure_model_access(
        allows_custom_models=True,
        mode="byok",
        byok_base_url="https://models.example.test/v1",
        model_assignments=[
            {
                "modelId": "local-video",
                "role": "VIDEO_IMAGE_TO_VIDEO",
            },
        ],
    )
    try:
        generator = CommercialVideoGenerator(
            model="local-video",
            model_role="VIDEO_IMAGE_TO_VIDEO",
        )
        assert generator.model_role == "VIDEO_IMAGE_TO_VIDEO"
        with pytest.raises(PermissionError, match="VIDEO_EDIT"):
            CommercialVideoGenerator(
                model="local-video",
                model_role="VIDEO_EDIT",
            )
    finally:
        configure_model_access(allows_custom_models=False, mode="cloud")


@pytest.mark.asyncio
async def test_freezone_video_generation_uses_one_commercial_generator(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    captured: dict[str, dict] = {}

    class FakeVideoGenerator:
        async def generate(self, **kwargs):
            captured["generate"] = kwargs
            output_path = Path(kwargs["output_path"])
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(b"fake mp4")
            return VideoGenResult(
                status=VideoGenStatus.DONE,
                video_path=str(output_path),
            )

    def fake_create_video_generator(**kwargs):
        captured["create"] = kwargs
        return FakeVideoGenerator()

    monkeypatch.setattr(
        "ai_anime.modules.generators.public.create_video_generator",
        fake_create_video_generator,
    )

    out = await creative_canvas_job_execution_use_cases().generate_video(
        GenerateCreativeCanvasVideoJobCommand(
            project_dir=tmp_path,
            job_id="job_video",
            prompt="雨夜街头，镜头缓慢推进",
            model="cloud-video-standard",
            model_role="VIDEO_ALL_REFERENCE",
            reference_items=(
                {
                    "type": "image",
                    "path": "https://media.example/first.png",
                    "role": "首帧",
                    "field": "input_reference",
                },
                {
                    "type": "video",
                    "path": "https://media.example/motion.mp4",
                    "role": "动作参考",
                    "field": "reference_videos",
                },
            ),
        )
    )

    assert out.exists()
    assert captured["create"] == {
        "model": "cloud-video-standard",
        "model_role": "VIDEO_ALL_REFERENCE",
        "resolution": "720p",
        "generate_audio": False,
    }
    assert captured["generate"]["image_path"] == (
        "https://media.example/first.png"
    )
    assert [item.field for item in captured["generate"]["references"]] == [
        "input_reference",
        "reference_videos",
    ]


def test_validate_omni_reference_limits_and_summary() -> None:
    items = [{"type": "image", "url": f"/static/{i}.png"} for i in range(9)]
    items += [{"type": "video", "url": f"/static/{i}.mp4"} for i in range(3)]

    assert summarize_omni_reference_counts(items) == {
        "image_count": 9,
        "video_count": 3,
        "audio_count": 0,
        "total_count": 12,
    }
    validate_omni_reference_limits(items)

    with pytest.raises(ValueError, match="<= 9"):
        validate_omni_reference_limits(
            [
                {"type": "image", "url": f"/static/{i}.png"}
                for i in range(10)
            ]
        )
