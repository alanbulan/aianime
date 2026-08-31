from pathlib import Path

import pytest


pytestmark = pytest.mark.m09


def test_video_prompt_draft_keeps_request_params_out_of_prompt():
    from ai_anime.modules.production.infrastructure.video_reference_assets import VideoReferenceAsset
    from ai_anime.modules.production.application.video_config import VideoReferenceMode
    from ai_anime.modules.production.infrastructure.video_prompt_composer import build_video_prompt_draft

    prompt = build_video_prompt_draft(
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        beat={
            "visual_description": "{{陆辰_书店老板时期}}在地下室翻找旧书。",
            "scene_ref": {"scene_id": "地下室_雨夜"},
            "props_description": "旧书、羊皮笔记本。",
            "video_prompt": "镜头缓慢推近，陆辰翻开旧书。",
        },
        assets=[
            VideoReferenceAsset(
                key="first_frame",
                label="当前 render · Beat 1",
                media_type="image",
                path=Path("frame.png"),
                exists=True,
                selected=True,
                request_field="reference_images",
                reference_label="图片1",
                image_number=1,
            ),
            VideoReferenceAsset(
                key="identity:陆辰_书店老板时期",
                label="陆辰 · 书店老板时期",
                media_type="image",
                path=Path("identity.png"),
                exists=True,
                selected=True,
                request_field="reference_images",
                reference_label="图片2",
                identity_id="陆辰_书店老板时期",
                image_number=2,
            ),
        ],
        text_overlay={
            "enabled": True,
            "kind": "subtitle",
            "content": "几天前，地下室中",
            "placement": "画面下方居中",
            "timing": "全片持续",
            "style": "干净易读",
        },
        prompt_guidance="动作克制，像官方多图参考示例。",
    )

    assert "生成4秒" not in prompt
    assert "9:16" not in prompt
    assert "720p" not in prompt
    assert "图片1作为起始状态和整体构图依据" in prompt
    assert "图片2中的陆辰" in prompt
    assert "环境为地下室_雨夜" in prompt
    assert "几天前，地下室中" in prompt
    assert "动作克制" in prompt
    assert "@" not in prompt


def test_video_prompt_draft_includes_dialogue_text():
    from ai_anime.modules.production.application.video_config import VideoReferenceMode
    from ai_anime.modules.production.infrastructure.video_prompt_composer import build_video_prompt_draft

    prompt = build_video_prompt_draft(
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        beat={
            "visual_description": "谢铮站在雨夜的巷口。",
            "dialogue": "谢铮低声说：“别回头，跟我走。”",
            "audio_type": "dialogue",
        },
        assets=[],
        text_overlay={},
        prompt_guidance="",
    )

    assert "别回头，跟我走" in prompt
    assert "台词" in prompt


def test_video_prompt_draft_keeps_desired_scene_state_when_asset_falls_back_to_base():
    from ai_anime.modules.production.infrastructure.video_reference_assets import VideoReferenceAsset
    from ai_anime.modules.production.application.video_config import VideoReferenceMode
    from ai_anime.modules.production.infrastructure.video_prompt_composer import build_video_prompt_draft

    prompt = build_video_prompt_draft(
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        beat={
            "visual_description": "地面积水反光。",
            "scene_ref": {"scene_id": "客厅", "variant_id": "漏水"},
        },
        assets=[
            VideoReferenceAsset(
                key="scene:客厅",
                label="场景锚点 · 客厅",
                media_type="image",
                path=Path("scene.png"),
                exists=True,
                selected=True,
                request_field="reference_images",
                reference_label="图片1",
                image_number=1,
            )
        ],
        text_overlay={},
        prompt_guidance="",
    )

    assert "环境为客厅" in prompt
    assert "目标场景状态：客厅_漏水" in prompt


def test_video_prompt_draft_keeps_desired_scene_time_when_asset_falls_back_to_base():
    from ai_anime.modules.production.infrastructure.video_reference_assets import VideoReferenceAsset
    from ai_anime.modules.production.application.video_config import VideoReferenceMode
    from ai_anime.modules.production.infrastructure.video_prompt_composer import build_video_prompt_draft

    prompt = build_video_prompt_draft(
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        beat={
            "visual_description": "地面积水反光。",
            "scene_ref": {"scene_id": "客厅", "variant_id": "漏水"},
            "time_of_day": "夜晚",
        },
        assets=[
            VideoReferenceAsset(
                key="scene:客厅",
                label="场景锚点 · 客厅",
                media_type="image",
                path=Path("scene.png"),
                exists=True,
                selected=True,
                request_field="reference_images",
                reference_label="图片1",
                image_number=1,
            )
        ],
        text_overlay={},
        prompt_guidance="",
    )

    assert "环境为客厅" in prompt
    assert "目标场景状态：客厅_漏水" in prompt
    assert "目标时间：夜晚" in prompt


def test_video_prompt_draft_binds_multi_speaker_dialogue_to_audio_labels():
    from ai_anime.modules.production.infrastructure.video_reference_assets import VideoReferenceAsset
    from ai_anime.modules.production.application.video_config import VideoReferenceMode
    from ai_anime.modules.production.infrastructure.video_prompt_composer import build_video_prompt_draft

    prompt = build_video_prompt_draft(
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        beat={
            "audio_type": "dialogue",
            "narration_segment": (
                "面馆男青年（放下右手的筷子，拿起桌上的易拉罐打开，神色诧异）："
                "现在啥事儿没有啊？"
                "面馆女青年（抬头）：你知道研发部的主管杜晨吗？"
            ),
            "visual_description": "两人在面馆桌边说话。",
        },
        assets=[
            VideoReferenceAsset(
                key="voice:面馆男青年_青年时期",
                label="面馆男青年 · 青年时期声线",
                media_type="audio",
                path=Path("man.mp3"),
                exists=True,
                selected=True,
                request_field="reference_audios",
                reference_label="音频1",
                identity_id="面馆男青年_青年时期",
                audio_number=1,
            ),
            VideoReferenceAsset(
                key="voice:面馆女青年_青年时期",
                label="面馆女青年 · 青年时期声线",
                media_type="audio",
                path=Path("woman.mp3"),
                exists=True,
                selected=True,
                request_field="reference_audios",
                reference_label="音频2",
                identity_id="面馆女青年_青年时期",
                audio_number=2,
            ),
        ],
        text_overlay={},
        prompt_guidance="",
    )

    assert "面馆男青年" in prompt
    assert "参考音频1声线" in prompt
    assert "现在啥事儿没有啊？" in prompt
    assert "放下右手的筷子" in prompt
    assert "面馆女青年" in prompt
    assert "参考音频2声线" in prompt
    assert "你知道研发部的主管杜晨吗？" in prompt


def test_video_dialogue_draft_keeps_ambiguous_prose_for_ai() -> None:
    from ai_anime.modules.production.infrastructure.video_reference_assets import VideoReferenceAsset
    from ai_anime.modules.production.application.video_config import VideoReferenceMode
    from ai_anime.modules.production.infrastructure.video_prompt_composer import build_video_prompt_draft

    prompt = build_video_prompt_draft(
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        beat={
            "audio_type": "dialogue",
            "speaker": "丫鬟_青年时期",
            "narration_segment": "（清脆出声，探头打趣）说起来你和赵小王爷长得一模一样。",
        },
        assets=[
            VideoReferenceAsset(
                key="voice:丫鬟_青年时期",
                label="丫鬟 · 青年时期声线",
                media_type="audio",
                path=Path("maid.mp3"),
                exists=True,
                selected=True,
                request_field="reference_audios",
                reference_label="音频1",
                identity_id="丫鬟_青年时期",
                audio_number=1,
            )
        ],
        text_overlay={},
        prompt_guidance="",
    )

    assert "请语义区分动作说明和实际说出的台词" in prompt
    assert "实际台词必须逐字完整保留" in prompt
    assert "本 Beat 说话角色为丫鬟" in prompt
    assert "丫鬟参考音频1声线" in prompt
    assert "（清脆出声，探头打趣）说起来你和赵小王爷长得一模一样。" in prompt


def test_video_dialogue_validation_keeps_plain_dialogue_required() -> None:
    from ai_anime.modules.production.infrastructure.video_reference_assets import VideoReferenceAsset
    from ai_anime.modules.production.infrastructure.video_reference_pipeline import (
        _validate_dialogue_final_prompt,
    )

    beat = {
        "audio_type": "dialogue",
        "speaker": "丫鬟_青年时期",
        "narration_segment": "（清脆出声，探头打趣）说起来你和赵小王爷长得一模一样。",
    }
    assets = [
        VideoReferenceAsset(
            key="voice:丫鬟_青年时期",
            label="丫鬟 · 青年时期声线",
            media_type="audio",
            path=Path("maid.mp3"),
            exists=True,
            selected=True,
            request_field="reference_audios",
            reference_label="音频1",
            identity_id="丫鬟_青年时期",
            audio_number=1,
        )
    ]

    _validate_dialogue_final_prompt(
        beat=beat,
        final_prompt=(
            "丫鬟（清脆出声，探头打趣，参考音频1声线）说："
            "“说起来你和赵小王爷长得一模一样。”"
        ),
        assets=assets,
    )
    with pytest.raises(ValueError, match="视频最终提示词缺少台词内容"):
        _validate_dialogue_final_prompt(
            beat=beat,
            final_prompt="丫鬟（清脆出声，探头打趣，参考音频1声线）看向对方。",
            assets=assets,
        )


def test_video_prompt_draft_can_use_narration_voice_reference():
    from ai_anime.modules.production.infrastructure.video_reference_assets import VideoReferenceAsset
    from ai_anime.modules.production.application.video_config import VideoReferenceMode
    from ai_anime.modules.production.infrastructure.video_prompt_composer import build_video_prompt_draft

    prompt = build_video_prompt_draft(
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        beat={
            "audio_type": "narration",
            "narration_segment": "夜色里的面馆还亮着灯。",
            "visual_description": "两人在面馆桌边说话。",
        },
        assets=[
            VideoReferenceAsset(
                key="voice:narrator",
                label="项目解说声线",
                media_type="audio",
                path=Path("narrator.mp3"),
                exists=True,
                selected=True,
                request_field="reference_audios",
                reference_label="音频1",
                identity_id="__narrator__",
                audio_number=1,
            ),
        ],
        text_overlay={},
        prompt_guidance="",
    )

    assert "夜色里的面馆还亮着灯" in prompt
    assert "音频1" in prompt
    assert "项目解说声线" in prompt


def test_video_asset_manifest_exposes_unreferenced_audio_to_ai():
    from ai_anime.modules.production.infrastructure.video_reference_assets import VideoReferenceAsset
    from ai_anime.modules.production.infrastructure.video_prompt_composer import build_video_reference_asset_manifest

    manifest = build_video_reference_asset_manifest(
        [
            VideoReferenceAsset(
                key="voice:narrator",
                label="项目解说声线",
                media_type="audio",
                path=Path("narrator.mp3"),
                exists=True,
                selected=False,
                request_field="",
                reference_label="音频1",
                identity_id="__narrator__",
                audio_number=1,
            )
        ]
    )

    assert manifest == [
        {
            "label": "音频1",
            "title": "项目解说声线",
            "media_type": "audio",
            "request_field": "",
            "note": "",
            "identity_id": "__narrator__",
            "prop_id": "",
            "prop_scope": "",
            "key": "voice:narrator",
        }
    ]


def test_video_prompt_uses_identity_text_when_reference_image_is_missing():
    from ai_anime.modules.production.infrastructure.video_reference_assets import VideoReferenceAsset
    from ai_anime.modules.production.application.video_config import VideoReferenceMode
    from ai_anime.modules.production.infrastructure.video_prompt_composer import build_video_prompt_draft

    assets = [
        VideoReferenceAsset(
            key="first_frame",
            label="当前 render · Beat 6",
            media_type="image",
            path=Path("frame.png"),
            exists=True,
            selected=True,
            request_field="reference_images",
            reference_label="图片1",
        ),
        VideoReferenceAsset(
            key="identity:面馆男青年_青年时期",
            label="面馆男青年 · 青年时期",
            media_type="image",
            path=Path("missing.png"),
            exists=False,
            selected=False,
            request_field="",
            reference_label="未发送",
            identity_id="面馆男青年_青年时期",
            fallback_text="男性，二十岁出头，黑色短发，炭灰色围裙，健壮清爽",
        ),
    ]

    prompt = build_video_prompt_draft(
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        beat={
            "beat_number": 6,
            "visual_description": "{{面馆男青年_青年时期}}放下易拉罐。",
            "scene_ref": {"scene_id": "面馆"},
        },
        assets=assets,
        text_overlay=None,
    )

    assert (
        "面馆男青年造型按提示词生成：男性，二十岁出头，黑色短发，炭灰色围裙，健壮清爽"
        in prompt
    )
    assert (
        "画面呈现面馆男青年（男性，二十岁出头，黑色短发，炭灰色围裙，健壮清爽）放下易拉罐"
        in prompt
    )


def test_video_prompt_binds_prop_marker_to_reference_image():
    from ai_anime.modules.production.infrastructure.video_reference_assets import VideoReferenceAsset
    from ai_anime.modules.production.application.video_config import VideoReferenceMode
    from ai_anime.modules.production.infrastructure.video_prompt_composer import build_video_prompt_draft

    prompt = build_video_prompt_draft(
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        beat={
            "beat_number": 1,
            "visual_description": "男青年举起[[TOKEN]]，红色代码光团在手心闪烁。",
            "detected_props": ["TOKEN"],
        },
        assets=[
            VideoReferenceAsset(
                key="first_frame",
                label="当前 render · Beat 1",
                media_type="image",
                path=Path("frame.png"),
                exists=True,
                selected=True,
                request_field="reference_images",
                reference_label="图片1",
                image_number=1,
            ),
            VideoReferenceAsset(
                key="prop:TOKEN",
                label="道具 · TOKEN",
                media_type="image",
                path=Path("token.png"),
                exists=True,
                selected=True,
                request_field="reference_images",
                reference_label="图片2",
                image_number=2,
                prop_id="TOKEN",
            ),
        ],
        text_overlay={},
        prompt_guidance="",
    )

    assert "图片2中的TOKEN道具" in prompt
    assert "[[TOKEN]]" not in prompt


def test_video_prompt_uses_prop_fallback_when_reference_image_is_missing():
    from ai_anime.modules.production.infrastructure.video_reference_assets import VideoReferenceAsset
    from ai_anime.modules.production.application.video_config import VideoReferenceMode
    from ai_anime.modules.production.infrastructure.video_prompt_composer import build_video_prompt_draft

    prompt = build_video_prompt_draft(
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        beat={
            "beat_number": 1,
            "visual_description": "桌面上放着[[易拉罐]]。",
            "detected_props": ["易拉罐"],
        },
        assets=[
            VideoReferenceAsset(
                key="prop:易拉罐",
                label="道具 · 易拉罐",
                media_type="image",
                path=Path("missing.png"),
                exists=False,
                selected=False,
                request_field="",
                reference_label="未发送",
                prop_id="易拉罐",
                fallback_text="红色铝制饮料罐，表面有细小水珠和拉环结构",
            )
        ],
        text_overlay={},
        prompt_guidance="",
    )

    assert "易拉罐道具按提示词生成：红色铝制饮料罐，表面有细小水珠和拉环结构" in prompt
    assert "桌面上放着易拉罐（红色铝制饮料罐，表面有细小水珠和拉环结构）" in prompt


def test_video_prompt_composer_task_exposes_prop_assets_and_fallbacks():
    from ai_anime.modules.production.infrastructure.video_reference_assets import VideoReferenceAsset
    from ai_anime.modules.production.application.video_config import VideoReferenceMode
    from ai_anime.modules.production.infrastructure.video_prompt_composer import (
        build_video_prompt_composer_task,
    )

    task = build_video_prompt_composer_task(
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        beat={
            "visual_description": "桌面上放着[[TOKEN]]和[[易拉罐]]。",
            "detected_props": ["TOKEN", "易拉罐"],
        },
        assets=[
            VideoReferenceAsset(
                key="prop:TOKEN",
                label="道具 · TOKEN",
                media_type="image",
                path=Path("token.png"),
                exists=True,
                selected=True,
                request_field="reference_images",
                reference_label="图片1",
                prop_id="TOKEN",
                prop_scope="global",
            ),
            VideoReferenceAsset(
                key="prop:易拉罐",
                label="道具 · 易拉罐",
                media_type="image",
                path=Path("missing.png"),
                exists=False,
                selected=False,
                request_field="",
                reference_label="未发送",
                prop_id="易拉罐",
                prop_scope="episode",
                fallback_text="红色铝制饮料罐，表面有细小水珠",
            ),
        ],
        text_overlay={},
        prompt_guidance="",
        draft_prompt="草稿。",
    )

    assert '"prop_id": "TOKEN"' in task
    assert '"prop_scope": "global"' in task
    assert '"asset_fallbacks": [' in task
    assert '"prop_id": "易拉罐"' in task
    assert '"prop_scope": "episode"' in task
    assert "红色铝制饮料罐" in task


def test_video_prompt_hash_changes_when_prop_fallback_changes():
    from ai_anime.modules.production.infrastructure.video_reference_assets import VideoReferenceAsset
    from ai_anime.modules.production.application.video_config import VideoReferenceMode
    from ai_anime.modules.production.infrastructure.video_prompt_composer import (
        compute_video_prompt_inputs_hash,
    )

    beat = {
        "visual_description": "桌面上放着[[易拉罐]]。",
        "detected_props": ["易拉罐"],
    }

    def make_hash(fallback_text: str) -> str:
        return compute_video_prompt_inputs_hash(
            mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
            beat=beat,
            assets=[
                VideoReferenceAsset(
                    key="prop:易拉罐",
                    label="道具 · 易拉罐",
                    media_type="image",
                    path=Path("missing.png"),
                    exists=False,
                    selected=False,
                    request_field="",
                    reference_label="未发送",
                    prop_id="易拉罐",
                    fallback_text=fallback_text,
                )
            ],
            text_overlay={},
        )

    assert make_hash("红色铝制饮料罐") != make_hash("蓝色玻璃瓶")


def test_video_prompt_composer_task_includes_scene_ref_and_dialogue_text():
    from ai_anime.modules.production.application.video_config import VideoReferenceMode
    from ai_anime.modules.production.infrastructure.video_prompt_composer import (
        build_video_prompt_composer_task,
    )

    task = build_video_prompt_composer_task(
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        beat={
            "visual_description": "谢铮站在雨夜的巷口。",
            "scene_ref": {"scene_id": "旧巷_暴雨"},
            "dialogue": "谢铮低声说：“别回头，跟我走。”",
            "audio_type": "dialogue",
        },
        assets=[],
        text_overlay={},
        prompt_guidance="",
        draft_prompt="草稿。",
    )

    assert '"scene_ref": {' in task
    assert '"scene_id": "旧巷_暴雨"' in task
    assert '"variant_id"' not in task
    assert '"dialogue": "谢铮低声说：' in task
    assert "别回头，跟我走" in task
    assert "实际台词必须逐字完整保留" in task


def test_video_prompt_hash_ignores_request_only_video_params():
    from ai_anime.modules.production.infrastructure.video_reference_assets import VideoReferenceAsset
    from ai_anime.modules.production.application.video_config import VideoReferenceMode
    from ai_anime.modules.production.infrastructure.video_prompt_composer import (
        compute_video_prompt_inputs_hash,
    )

    asset = VideoReferenceAsset(
        key="first_frame",
        label="当前 render · Beat 1",
        media_type="image",
        path=Path("frame.png"),
        exists=True,
        selected=True,
        request_field="reference_images",
        reference_label="图片1",
        image_number=1,
    )
    beat = {
        "visual_description": "陆辰在地下室翻书。",
        "scene_ref": {"scene_id": "地下室"},
        "video_prompt": "缓慢推进。",
    }

    base_hash = compute_video_prompt_inputs_hash(
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        beat=beat,
        assets=[asset],
        text_overlay={},
        prompt_guidance="保持悬疑感。",
    )
    same_hash_after_request_change = compute_video_prompt_inputs_hash(
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        beat={**beat, "duration": 10, "ratio": "16:9"},
        assets=[asset],
        text_overlay={},
        prompt_guidance="保持悬疑感。",
    )
    changed_hash = compute_video_prompt_inputs_hash(
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        beat={**beat, "scene_ref": {"scene_id": "旧巷"}},
        assets=[asset],
        text_overlay={},
        prompt_guidance="保持悬疑感。",
    )

    assert base_hash == same_hash_after_request_change
    assert base_hash != changed_hash


async def test_generate_video_prompt_uses_ai_composer_before_fallback():
    from ai_anime.modules.production.infrastructure.video_reference_assets import VideoReferenceAsset
    from ai_anime.modules.production.application.video_config import VideoReferenceMode
    from ai_anime.modules.production.infrastructure.video_prompt_composer import generate_video_prompt

    async def fake_composer(**kwargs):
        assert "duration" not in kwargs["draft_prompt"]
        assert kwargs["request_params"] == {
            "duration": 6,
            "resolution": "720p",
            "ratio": "9:16",
        }
        return "根据图片1生成官方风格视频。"

    result = await generate_video_prompt(
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        beat={"visual_description": "陆辰在地下室翻书。"},
        assets=[
            VideoReferenceAsset(
                key="first_frame",
                label="当前 render · Beat 1",
                media_type="image",
                path=Path("frame.png"),
                exists=True,
                selected=True,
                request_field="reference_images",
                reference_label="图片1",
                image_number=1,
            )
        ],
        text_overlay={},
        prompt_guidance="",
        request_params={"duration": 6, "resolution": "720p", "ratio": "9:16"},
        composer=fake_composer,
    )

    assert result.prompt == "根据图片1生成官方风格视频。"
    assert result.used_ai is True
    assert result.error == ""


@pytest.mark.parametrize(
    "contaminated_prompt",
    [
        "镜头缓慢推近。использовать参考音频1作为角色声线。",
        "镜头缓慢推近。<|FCResponseBegin|>",
        "镜头缓慢推近。_unexpected_fragment",
    ],
)
async def test_generate_video_prompt_falls_back_on_contaminated_ai_output(
    contaminated_prompt: str,
) -> None:
    from ai_anime.modules.production.application.video_config import (
        VideoReferenceMode,
    )
    from ai_anime.modules.production.infrastructure.video_prompt_composer import (
        generate_video_prompt,
    )

    async def fake_composer(**_kwargs):
        return contaminated_prompt

    result = await generate_video_prompt(
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        beat={
            "visual_description": "白石夏音站在音乐教室内。",
            "narration_segment": "你听到了？",
            "audio_type": "dialogue",
        },
        assets=[],
        text_overlay={},
        prompt_guidance="",
        composer=fake_composer,
    )

    assert result.used_ai is False
    assert result.prompt == result.draft_prompt
    assert contaminated_prompt not in result.prompt
    assert result.error


async def test_generate_video_prompt_allows_cyrillic_from_source_dialogue() -> None:
    from ai_anime.modules.production.application.video_config import (
        VideoReferenceMode,
    )
    from ai_anime.modules.production.infrastructure.video_prompt_composer import (
        generate_video_prompt,
    )

    async def fake_composer(**_kwargs):
        return "角色面对镜头说出俄语台词：“Привет”。"

    result = await generate_video_prompt(
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        beat={
            "visual_description": "角色面对镜头。",
            "narration_segment": "Привет",
            "audio_type": "dialogue",
        },
        assets=[],
        text_overlay={},
        prompt_guidance="",
        composer=fake_composer,
    )

    assert result.used_ai is True
    assert result.prompt == "角色面对镜头说出俄语台词：“Привет”。"
    assert result.error == ""


async def test_generate_video_prompt_allows_chinese_underscore_suffix() -> None:
    from ai_anime.modules.production.application.video_config import (
        VideoReferenceMode,
    )
    from ai_anime.modules.production.infrastructure.video_prompt_composer import (
        generate_video_prompt,
    )

    async def fake_composer(**_kwargs):
        return "镜头缓慢推近，进入角色的_回忆画面"

    result = await generate_video_prompt(
        mode=VideoReferenceMode.MULTIMODAL_REFERENCE,
        beat={"visual_description": "镜头缓慢推近角色。"},
        assets=[],
        text_overlay={},
        prompt_guidance="",
        composer=fake_composer,
    )

    assert result.used_ai is True
    assert result.prompt == "镜头缓慢推近，进入角色的_回忆画面"
