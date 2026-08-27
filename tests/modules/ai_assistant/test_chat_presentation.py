import copy
import json
import logging

from ai_anime.modules.ai_assistant.domain.chat_presentation import (
    split_ui_specs_from_text,
    ui_spec_json,
    wrap_ui_spec_json,
)
from ai_anime.modules.ai_assistant.public import (
    append_tool_ui_specs,
    extract_tool_ui_specs,
    filter_tool_ui_specs_for_prompt,
    normalize_json_render_reply,
    redact_local_filesystem_paths,
)
from ai_anime.modules.ai_assistant.infrastructure import FileJsonRenderErrors


def test_invalid_json_render_is_written_to_configured_error_log(
    monkeypatch,
    tmp_path,
):
    error_log = tmp_path / "logs" / "jr-error.log"
    monkeypatch.setenv("JR_ERROR_LOG", str(error_log))

    normalized = normalize_json_render_reply("<ui-spec>{not json}</ui-spec>")

    assert "格式校验失败" in normalized
    log_text = error_log.read_text(encoding="utf-8")
    assert "invalid ui-spec JSON" in log_text or "Expecting" in log_text
    assert "{not json}" in log_text


def test_invalid_json_render_uses_application_logging_by_default(
    caplog,
    monkeypatch,
):
    monkeypatch.delenv("JR_ERROR_LOG", raising=False)
    errors = FileJsonRenderErrors()

    with caplog.at_level(logging.WARNING):
        errors.record(ValueError("invalid ui-spec JSON"), "{not json}")

    assert errors.path() is None
    assert "invalid ui-spec JSON" in caplog.text
    assert "{not json}" in caplog.text


def test_sketch_only_prompt_filters_frame_images_without_mutating_spec():
    spec = {
        "type": "sketch_gallery",
        "root": "root",
        "elements": {
            "root": {
                "type": "Stack",
                "props": {},
                "children": ["sketch", "frame"],
            },
            "sketch": {
                "type": "Image",
                "props": {"src": "/static/projects/demo/sketches/beat-1.png"},
                "children": [],
            },
            "frame": {
                "type": "Image",
                "props": {"src": "/static/projects/demo/frames/beat-1.png"},
                "children": [],
            },
        },
    }
    original = copy.deepcopy(spec)

    filtered = filter_tool_ui_specs_for_prompt("只看第 1 个草图", [spec])

    assert filtered[0]["elements"]["root"]["children"] == ["sketch"]
    assert spec == original


def test_chat_visible_text_redacts_local_filesystem_paths():
    content = (
        "前端目录 ~/Works/ai-anime-fe，"
        "后端目录 /Users/tao/Works/AI anime/state/admin/.hermes。"
    )

    redacted = redact_local_filesystem_paths(content)

    assert "~/Works/ai-anime-fe" not in redacted
    assert "/Users/tao/Works/AI anime" not in redacted
    assert redacted.count("[本地路径]") == 2


def test_json_render_reply_normalizer_unwraps_fenced_ui_spec():
    content = """请查看：

```json-render
<ui-spec>
{
  "type": "character_showcase",
  "root": "root",
  "elements": {
    "root": {
      "type": "Stack",
      "props": {},
      "children": ["portrait"]
    },
    "portrait": {
      "type": "Image",
      "props": {"src": "/static/projects/demo/portrait.png", "alt": "肖像"},
      "children": []
    }
  }
}
</ui-spec>
```"""

    normalized = normalize_json_render_reply(content)

    assert "```" not in normalized
    assert '<ui-spec type="character_showcase">' in normalized
    assert '"type": "Image"' in normalized


def test_json_render_reply_normalizer_repairs_missing_trailing_brace():
    content = """<ui-spec>{"type":"character_showcase","root":"root","elements":{"root":{"type":"Stack","props":{},"children":[]}}</ui-spec>"""

    normalized = normalize_json_render_reply(content)

    assert "格式校验失败" not in normalized
    assert '"elements": {' in normalized
    assert normalized.rstrip().endswith("</ui-spec>")


def test_json_render_reply_normalizer_repairs_legacy_component_children_props():
    content = """<ui-spec>
{
  "type": "script_overview",
  "root": "root",
  "elements": {
    "root": {
      "type": "Stack",
      "props": {"row": false, "gap": 12},
      "children": ["heading", "badge", "body"]
    },
    "heading": {
      "type": "Heading",
      "props": {"level": 3, "children": "第 1 集脚本概览"},
      "children": []
    },
    "badge": {
      "type": "Badge",
      "props": {"children": "completed", "variant": "success"},
      "children": []
    },
    "body": {
      "type": "Text",
      "props": {"children": "脚本已经生成完成。", "variant": "body"},
      "children": []
    }
  }
}
</ui-spec>"""

    normalized = normalize_json_render_reply(content)

    assert "格式校验失败" not in normalized
    assert '"direction": "column"' in normalized
    assert '"content": "第 1 集脚本概览"' in normalized
    assert '"label": "completed"' in normalized
    assert '"content": "脚本已经生成完成。"' in normalized
    assert '"children": "脚本已经生成完成。"' not in normalized


def test_json_render_reply_normalizer_blocks_invalid_ui_spec():
    content = "<ui-spec>{not json}</ui-spec>"

    normalized = normalize_json_render_reply(content)

    assert "<ui-spec>" not in normalized
    assert "格式校验失败" in normalized


def test_json_render_reply_normalizer_accepts_media_bundle_array():
    spec_a = {
        "type": "character_showcase",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["portrait"]},
            "portrait": {
                "type": "Image",
                "props": {"src": "/static/projects/demo/portrait.png", "alt": "肖像"},
                "children": [],
            },
        },
    }
    spec_b = {
        "type": "sketch_gallery",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["sketch"]},
            "sketch": {
                "type": "Image",
                "props": {"src": "/static/projects/demo/sketch.png", "alt": "草图"},
                "children": [],
            },
        },
    }
    content = f'<ui-spec type="media_bundle">{json.dumps([spec_a, spec_b])}</ui-spec>'

    normalized = normalize_json_render_reply(content)

    assert "格式校验失败" not in normalized
    assert normalized.count("<ui-spec") == 1
    assert '<ui-spec type="media_bundle">' in normalized
    assert '"type": "character_showcase"' in normalized
    assert '"type": "sketch_gallery"' in normalized


def test_json_render_reply_normalizer_wraps_embedded_canonical_json():
    spec = {
        "type": "sketch_gallery",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["sketch"]},
            "sketch": {
                "type": "Image",
                "props": {"src": "/static/projects/demo/sketch.png", "alt": "草图"},
                "children": [],
            },
        },
    }
    content = (
        f"已加载草图：\n\n{json.dumps(spec, ensure_ascii=False)}\n\n继续查看请告诉我。"
    )

    normalized = normalize_json_render_reply(content)

    assert "已加载草图" in normalized
    assert "继续查看请告诉我" in normalized
    assert '<ui-spec type="sketch_gallery">' in normalized
    assert "/static/projects/demo/sketch.png" in normalized


def test_extract_tool_ui_specs_canonicalizes_tool_payload():
    payload = {
        "content": {
            "result": {
                "ok": True,
                "ui_spec": {
                    "type": "sketch_gallery",
                    "root": "root",
                    "elements": {
                        "root": {
                            "type": "Stack",
                            "props": {"row": True},
                            "children": ["image_1"],
                        },
                        "image_1": {
                            "type": "Image",
                            "props": {
                                "src": "/static/projects/demo/scene.png?v=1",
                                "alt": "场景",
                            },
                        },
                    },
                },
            }
        }
    }

    specs = extract_tool_ui_specs(payload)

    assert len(specs) == 1
    assert specs[0]["type"] == "sketch_gallery"
    assert specs[0]["elements"]["root"]["props"]["direction"] == "row"
    assert specs[0]["elements"]["image_1"]["children"] == []


def test_extract_tool_ui_specs_parses_json_string_tool_result():
    payload = {
        "sessionUpdate": "tool_call_update",
        "content": json.dumps(
            {
                "ok": True,
                "ui_spec": {
                    "type": "sketch_gallery",
                    "root": "root",
                    "elements": {
                        "root": {
                            "type": "Stack",
                            "props": {"direction": "column"},
                            "children": ["image_1"],
                        },
                        "image_1": {
                            "type": "Image",
                            "props": {
                                "src": "/static/projects/demo/sketch.png?v=1",
                                "alt": "草图",
                            },
                        },
                    },
                },
            },
            ensure_ascii=False,
        ),
    }

    specs = extract_tool_ui_specs(payload)

    assert len(specs) == 1
    assert specs[0]["type"] == "sketch_gallery"
    assert (
        specs[0]["elements"]["image_1"]["props"]["src"]
        == "/static/projects/demo/sketch.png?v=1"
    )


def test_append_tool_ui_specs_adds_block_when_model_did_not_write_one():
    spec = {
        "type": "character_showcase",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["portrait"]},
            "portrait": {
                "type": "Image",
                "props": {
                    "src": "/static/projects/demo/portrait.png?v=1",
                    "alt": "肖像",
                },
                "children": [],
            },
        },
    }

    content = append_tool_ui_specs("已展示肖像。", [spec])

    assert content.startswith("已展示肖像。")
    assert '<ui-spec type="character_showcase">' in content
    assert "/static/projects/demo/portrait.png?v=1" in content


def test_append_tool_ui_specs_ignores_placeholder_ui_spec_chatter():
    spec = {
        "type": "character_showcase",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["portrait"]},
            "portrait": {
                "type": "Image",
                "props": {
                    "src": "/static/projects/demo/portrait.png?v=1",
                    "alt": "肖像",
                },
                "children": [],
            },
        },
    }

    content = append_tool_ui_specs(
        "\n".join(
            [
                "首先，调用ai_anime_get_character_media工具获取角色肖像信息：",
                "<ui-spec> JSON has been generated and will be automatically rendered by the backend.",
                "所有图片都已按规范渲染为UI画廊，您可以直接查看。",
                "如需查看其他内容，请告诉我。",
            ]
        ),
        [spec],
    )

    assert "ai_anime_get_character_media" not in content
    assert "automatically rendered" not in content
    assert "UI画廊" not in content
    assert "如需查看其他内容" in content
    assert '<ui-spec type="character_showcase">' in content
    assert "/static/projects/demo/portrait.png?v=1" in content


def test_append_tool_ui_specs_replaces_truncated_embedded_media_json():
    spec = {
        "type": "sketch_gallery",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["sketch"]},
            "sketch": {
                "type": "Image",
                "props": {"src": "/static/projects/demo/sketch.png", "alt": "草图"},
                "children": [],
            },
        },
    }
    truncated_json = (
        '{"type": "sketch_gallery", "root": "root", "elements": '
        '{"root": {"type": "Stack", "props": {}, "children": ["sketch"]}}'
    )

    content = append_tool_ui_specs(
        f"已为您展示草图：\n\n{truncated_json}\n\n继续查看请告诉我。",
        [spec],
    )

    assert "已为您展示草图" in content
    assert "继续查看请告诉我" in content
    assert truncated_json not in content
    assert '<ui-spec type="sketch_gallery">' in content
    assert "/static/projects/demo/sketch.png" in content


def test_ui_spec_json_is_generated_before_wrapping_tags():
    spec = {
        "type": "character_showcase",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["portrait"]},
            "portrait": {
                "type": "Image",
                "props": {
                    "src": "/static/projects/demo/portrait.png?v=1",
                    "alt": "肖像",
                },
                "children": [],
            },
        },
    }

    spec_type, json_text = ui_spec_json(spec)
    wrapped = wrap_ui_spec_json(spec_type, json_text)

    assert spec_type == "character_showcase"
    assert "<ui-spec" not in json_text
    assert "</ui-spec>" not in json_text
    assert wrapped.startswith('<ui-spec type="character_showcase">')
    assert wrapped.endswith("</ui-spec>")


def test_append_tool_ui_specs_keeps_image_specs_separate_and_ordered():
    portrait_spec = {
        "type": "character_showcase",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["portrait"]},
            "portrait": {
                "type": "Image",
                "props": {
                    "src": "/static/projects/demo/portrait.png?v=1",
                    "alt": "肖像",
                    "overlayTitle": "江念",
                },
                "children": [],
            },
        },
    }
    sketch_spec = {
        "type": "sketch_gallery",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["sketch"]},
            "sketch": {
                "type": "Image",
                "props": {
                    "src": "/static/projects/demo/sketch.png?v=1",
                    "alt": "草图",
                    "overlayTitle": "Beat 1 草图",
                },
                "children": [],
            },
        },
    }

    content = append_tool_ui_specs("已展示媒体。", [portrait_spec, sketch_spec])

    assert content.count("<ui-spec") == 2
    assert '<ui-spec type="character_showcase">' in content
    assert '<ui-spec type="sketch_gallery">' in content
    assert '"type": "character_showcase"' in content
    assert '"type": "sketch_gallery"' in content
    assert content.index('<ui-spec type="character_showcase">') < content.index(
        '<ui-spec type="sketch_gallery">'
    )
    assert content.index("/static/projects/demo/portrait.png?v=1") < content.index(
        "/static/projects/demo/sketch.png?v=1"
    )


def test_append_tool_ui_specs_merges_adjacent_character_showcase_specs():
    first_spec = {
        "type": "character_showcase",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["portrait"]},
            "portrait": {
                "type": "Image",
                "props": {
                    "src": "/static/projects/demo/jiang-nian.png?v=1",
                    "alt": "江念",
                    "overlayTitle": "江念",
                },
                "children": [],
            },
        },
    }
    second_spec = {
        "type": "character_showcase",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["portrait"]},
            "portrait": {
                "type": "Image",
                "props": {
                    "src": "/static/projects/demo/luo-xi.png?v=1",
                    "alt": "洛曦",
                    "overlayTitle": "洛曦",
                },
                "children": [],
            },
        },
    }

    content = append_tool_ui_specs("已展示角色。", [first_spec, second_spec])

    assert content.count('<ui-spec type="character_showcase">') == 1
    assert "/static/projects/demo/jiang-nian.png?v=1" in content
    assert "/static/projects/demo/luo-xi.png?v=1" in content
    assert '"portrait_2"' in content
    assert content.index("/static/projects/demo/jiang-nian.png?v=1") < content.index(
        "/static/projects/demo/luo-xi.png?v=1"
    )


def test_append_tool_ui_specs_merges_same_category_video_and_audio_specs():
    video_a = {
        "type": "keyframe_video",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["video"]},
            "video": {
                "type": "Video",
                "props": {"src": "/static/projects/demo/beat-1.mp4", "title": "Beat 1"},
                "children": [],
            },
        },
    }
    video_b = {
        "type": "keyframe_video",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["video"]},
            "video": {
                "type": "Video",
                "props": {"src": "/static/projects/demo/beat-2.mp4", "title": "Beat 2"},
                "children": [],
            },
        },
    }
    audio_a = {
        "type": "audio_list",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["audio"]},
            "audio": {
                "type": "Audio",
                "props": {"src": "/static/projects/demo/beat-1.mp3", "title": "Beat 1"},
                "children": [],
            },
        },
    }
    audio_b = {
        "type": "audio_list",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["audio"]},
            "audio": {
                "type": "Audio",
                "props": {"src": "/static/projects/demo/beat-2.mp3", "title": "Beat 2"},
                "children": [],
            },
        },
    }

    content = append_tool_ui_specs("已展示媒体。", [video_a, video_b, audio_a, audio_b])

    assert content.count('<ui-spec type="keyframe_video">') == 1
    assert content.count('<ui-spec type="audio_list">') == 1
    assert content.index("/static/projects/demo/beat-1.mp4") < content.index(
        "/static/projects/demo/beat-2.mp4"
    )
    assert content.index("/static/projects/demo/beat-2.mp4") < content.index(
        "/static/projects/demo/beat-1.mp3"
    )
    assert content.index("/static/projects/demo/beat-1.mp3") < content.index(
        "/static/projects/demo/beat-2.mp3"
    )


def test_append_tool_ui_specs_keeps_same_src_across_different_categories():
    shared_src = "/static/projects/demo/shared.png?v=1"
    portrait_spec = {
        "type": "character_showcase",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["portrait"]},
            "portrait": {
                "type": "Image",
                "props": {"src": shared_src, "alt": "肖像", "overlayTitle": "角色肖像"},
                "children": [],
            },
        },
    }
    sketch_spec = {
        "type": "sketch_gallery",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["sketch"]},
            "sketch": {
                "type": "Image",
                "props": {"src": shared_src, "alt": "草图", "overlayTitle": "草图候选"},
                "children": [],
            },
        },
    }

    content = append_tool_ui_specs("已展示媒体。", [portrait_spec, sketch_spec])

    assert content.count("<ui-spec") == 2
    assert content.count(shared_src) == 2
    assert "角色肖像" in content
    assert "草图候选" in content


def test_split_ui_specs_from_text_extracts_model_written_blocks():
    spec = {
        "type": "sketch_gallery",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["image"]},
            "image": {
                "type": "Image",
                "props": {"src": "/static/projects/demo/sketch.png", "alt": "草图"},
                "children": [],
            },
        },
    }
    content = (
        "以下是草图：\n\n"
        f"<ui-spec>{json.dumps(spec, ensure_ascii=False)}</ui-spec>\n\n"
        "展示完成。"
    )

    text, specs = split_ui_specs_from_text(content)

    assert "<ui-spec" not in text
    assert text == "以下是草图：\n\n展示完成。"
    assert len(specs) == 1
    assert specs[0]["type"] == "sketch_gallery"
    assert specs[0]["elements"]["image"]["children"] == []


def test_append_tool_ui_specs_does_not_duplicate_existing_ui_spec():
    existing_spec = {
        "type": "character_showcase",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["portrait"]},
            "portrait": {
                "type": "Image",
                "props": {"src": "/static/projects/demo/portrait.png", "alt": "肖像"},
                "children": [],
            },
        },
    }
    tool_spec = {
        "type": "sketch_gallery",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["sketch"]},
            "sketch": {
                "type": "Image",
                "props": {"src": "/static/projects/demo/sketch.png", "alt": "草图"},
                "children": [],
            },
        },
    }

    content = append_tool_ui_specs(
        f"已有展示\n<ui-spec>{json.dumps(existing_spec, ensure_ascii=False)}</ui-spec>",
        [tool_spec],
    )

    assert content.count("<ui-spec") == 1
    assert "已有展示" in content
    assert "/static/projects/demo/portrait.png" in content
    assert "/static/projects/demo/sketch.png" not in content
