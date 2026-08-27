import json

from ai_anime.modules.ai_assistant.public import tool_chat_error


def test_extract_tool_chat_error_from_nested_tool_result_string():
    payload = {
        "sessionUpdate": "tool_call_update",
        "status": "completed",
        "result": json.dumps(
            {
                "ok": True,
                "data": [
                    {
                        "status": "failed",
                        "error": "Content filter triggered. Finish reason: 'content_filter'",
                        "chat_error": "模型内容安全过滤拦截了本次文本生成，请调整原文后重试。",
                    }
                ],
            },
            ensure_ascii=False,
        ),
    }

    assert (
        tool_chat_error(payload)
        == "模型内容安全过滤拦截了本次文本生成，请调整原文后重试。"
    )


def test_extract_tool_chat_error_ignores_raw_provider_error_without_hint():
    payload = {
        "sessionUpdate": "tool_call_update",
        "status": "completed",
        "result": {
            "error": "Content filter triggered. Finish reason: 'content_filter'",
            "provider_response_id": "resp_123",
        },
    }

    assert tool_chat_error(payload) is None


def test_extract_tool_chat_error_maps_render_prereq_task_error():
    raw_error = (
        "Render 重生未生成可用图片（mode=1x1_2-3, beats=[1, 2, 3]）："
        "Render 模式需要草图但未找到覆盖 beat 1-1 的草图"
    )
    payload = {
        "sessionUpdate": "tool_call_update",
        "status": "completed",
        "result": {
            "status": "failed",
            "error": raw_error,
        },
    }

    chat_error = tool_chat_error(payload)

    assert chat_error is not None
    assert "Render 任务没有生成可用图片" in chat_error
    assert "资产库" in chat_error
    assert raw_error in chat_error


def test_extract_tool_chat_error_maps_generic_failed_task_error():
    payload = {
        "sessionUpdate": "tool_call_update",
        "status": "completed",
        "result": {
            "status": "failed",
            "error": "上游下载失败 token=secret-token provider_response_id=resp_123",
        },
    }

    chat_error = tool_chat_error(payload)

    assert chat_error is not None
    assert chat_error.startswith("任务执行失败：")
    assert "上游下载失败" in chat_error
    assert "secret-token" not in chat_error
    assert "resp_123" not in chat_error


def test_extract_tool_chat_error_maps_voice_prerequisite_without_failed_prefix():
    chat_error = tool_chat_error(
        {
            "status": "failed",
            "error": "Beat 08 角色声线缺失：夏栀_七月十七日时期",
        }
    )

    assert chat_error is not None
    assert chat_error.startswith("配音任务没有启动：")
    assert "自动设计" in chat_error
    assert "上传或录制" not in chat_error
    assert "夏栀" in chat_error
    assert not chat_error.startswith("任务执行失败：")


def test_extract_tool_chat_error_maps_voice_design_route_failure():
    chat_error = tool_chat_error(
        {
            "ok": False,
            "code": "voice_design_failed",
            "error": "夏栀·青年时期自动文字声线生成失败：上游服务暂不可用",
        }
    )

    assert chat_error is not None
    assert chat_error.startswith("配音任务没有启动：")
    assert "上游服务暂不可用" in chat_error


def test_extract_tool_chat_error_maps_missing_seedance_prompt():
    chat_error = tool_chat_error(
        {
            "status": "failed",
            "error": "Beat 1 Seedance 2.0 最终提示词为空",
        }
    )

    assert chat_error is not None
    assert chat_error.startswith("视频任务没有启动：")


def test_extract_tool_chat_error_maps_missing_model_prerequisite():
    chat_error = tool_chat_error(
        {
            "status": "failed",
            "error": "参考图编辑模型缺失：当前未配置可用的 IMAGE_EDIT 云端或 BYOK 模型",
        }
    )

    assert chat_error is not None
    assert chat_error.startswith("生产任务没有进入模型调用：")
    assert "IMAGE_EDIT" in chat_error


def test_extract_tool_chat_error_maps_missing_audio_model():
    chat_error = tool_chat_error(
        {
            "status": "failed",
            "error": "AI 配音模型缺失：当前未配置可用的 AUDIO_VOICE_CLONE 云端或 BYOK 模型",
        }
    )

    assert chat_error is not None
    assert chat_error.startswith("配音任务没有启动：")


def test_extract_tool_chat_error_maps_ok_false_without_error_text():
    payload = {
        "sessionUpdate": "tool_call_update",
        "status": "completed",
        "result": {"ok": False},
    }

    assert (
        tool_chat_error(payload)
        == "任务执行失败：接口返回 ok=false，但没有提供具体错误原因。"
    )


def test_failed_outer_status_prefers_nested_result_reason():
    payload = {
        "sessionUpdate": "tool_call_update",
        "status": "failed",
        "result": "Skill view failed: Skill 'ai-anime' not found.",
    }

    assert (
        tool_chat_error(payload)
        == "任务执行失败：Skill view failed: Skill 'ai-anime' not found."
    )


def test_successful_task_list_does_not_promote_historical_failure_to_chat_error():
    payload = {
        "sessionUpdate": "tool_call_update",
        "status": "completed",
        "result": json.dumps(
            {
                "ok": True,
                "status_code": 200,
                "data": [
                    {
                        "status": "failed",
                        "error": "历史图片任务失败",
                    }
                ],
            },
            ensure_ascii=False,
        ),
    }

    assert tool_chat_error(payload, tool_name="ai_anime_list_tasks") is None


def test_successful_task_list_without_status_code_keeps_domain_failure_internal():
    payload = {
        "sessionUpdate": "tool_call_update",
        "status": "completed",
        "result": json.dumps(
            {
                "ok": True,
                "data": [{"status": "failed", "error": "历史任务失败"}],
            },
            ensure_ascii=False,
        ),
    }

    assert tool_chat_error(payload, tool_name="ai_anime_list_tasks") is None


def test_read_only_domain_miss_does_not_mark_a_recovered_turn_failed():
    payload = {
        "sessionUpdate": "tool_call_update",
        "status": "completed",
        "result": {
            "ok": False,
            "status_code": 200,
            "error": "Style 'custom_style' not found",
        },
    }

    assert tool_chat_error(payload, tool_name="ai_anime_get") is None


def test_failed_read_tool_surfaces_nested_reason_as_read_failure():
    payload = {
        "sessionUpdate": "tool_call_update",
        "status": "failed",
        "result": [
            {
                "content": {
                    "text": "ai_anime_get failed: Not Found",
                }
            }
        ],
    }

    assert (
        tool_chat_error(payload, tool_name="ai_anime_get")
        == "读取失败：Not Found"
    )


def test_failed_display_read_tool_uses_read_failure_prefix():
    payload = {
        "sessionUpdate": "tool_call_update",
        "status": "failed",
    }

    assert (
        tool_chat_error(payload, tool_name="ai_anime_get_character_media")
        == "读取失败：当前状态为 failed。"
    )


def test_failed_task_list_request_still_surfaces_transport_error():
    payload = {
        "sessionUpdate": "tool_call_update",
        "status": "completed",
        "result": {
            "ok": False,
            "status_code": 401,
            "error": "desktop session rejected",
        },
    }

    assert (
        tool_chat_error(payload, tool_name="ai_anime_list_tasks")
        == "任务执行失败：desktop session rejected"
    )
