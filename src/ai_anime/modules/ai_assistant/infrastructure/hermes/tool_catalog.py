"""Structured, localized catalog for tools exposed by the Hermes assistant."""

from __future__ import annotations

import ast
from pathlib import Path
from typing import Any


_CORE_TOOLS: dict[str, tuple[str, str, str]] = {
    "delegate_task": (
        "委派子任务",
        "把独立、复杂或可并行的工作交给子代理处理；主对话可继续推进，完成结果会自动回传。",
        "任务与协作",
    ),
    "execute_code": (
        "批量执行代码",
        "运行可编排多个工具调用的 Python 脚本，适合带循环、条件判断或结果过滤的机械任务。",
        "代码与执行",
    ),
    "memory": (
        "持久记忆",
        "保存跨会话仍需保留的用户偏好、环境事实和稳定约定；不用于临时任务进度。",
        "会话与记忆",
    ),
    "patch": (
        "局部修改文件",
        "对文件执行精确查找替换或多文件补丁，并返回差异；适合修改已有内容。",
        "文件修改",
    ),
    "process": (
        "管理后台进程",
        "查看、等待、读取日志、输入或终止由终端启动的后台任务和长期运行进程。",
        "代码与执行",
    ),
    "read_file": (
        "读取文件",
        "按行号和分页读取文本、Notebook、Word 或 Excel 内容；不会修改文件。",
        "文件读取",
    ),
    "search_files": (
        "搜索文件",
        "按文件名或正则内容快速检索工作区，并返回文件路径、行号和匹配片段。",
        "文件读取",
    ),
    "session_search": (
        "搜索历史会话",
        "检索或翻阅 Hermes 的历史对话，用于找回先前讨论、决定和任务上下文。",
        "会话与记忆",
    ),
    "skill_manage": (
        "管理 Skills",
        "创建、修订或删除可复用 Skill；涉及新建或删除时需要先获得用户确认。",
        "Skills",
    ),
    "skill_view": (
        "读取 Skill",
        "加载某个 Skill 的完整说明，以及它关联的参考资料、模板和脚本。",
        "Skills",
    ),
    "skills_list": (
        "列出 Skills",
        "读取当前实际可用的 Skill 名称和简介，随后可用 skill_view 加载完整内容。",
        "Skills",
    ),
    "terminal": (
        "运行终端命令",
        "执行构建、测试、Git、包管理器和网络等 Shell 命令，也可启动受管理的后台进程。",
        "代码与执行",
    ),
    "todo": (
        "管理任务清单",
        "创建和更新当前会话的多步骤任务清单，持续记录待办、进行中与完成状态。",
        "任务与协作",
    ),
    "vision_analyze": (
        "分析图片",
        "把本地图片、网址图片或 Data URL 加入模型上下文，用于读取画面和视觉检查。",
        "视觉理解",
    ),
    "write_file": (
        "写入完整文件",
        "创建文件或完整覆盖现有文件，并对常见代码和配置格式执行基础语法检查。",
        "文件修改",
    ),
}


_AI_ANIME_TOOLS: dict[str, tuple[str, str, str]] = {
    "question": (
        "请求用户确认",
        "遇到缺失参数、重要选择、覆盖或付费操作时暂停流程，展示结构化选择题，确认后再继续。",
        "确认与决策",
    ),
    "ai_anime_get": (
        "读取项目 API",
        "读取 AI 漫剧项目、资产和状态数据；只执行 GET 查询，不修改业务内容。",
        "项目与任务",
    ),
    "ai_anime_post": (
        "调用通用创建 API",
        "调用没有专用工具覆盖的普通 POST 接口；完整生产和关键写入仍必须走专用工作流工具。",
        "项目与任务",
    ),
    "ai_anime_create_style": (
        "创建视觉风格",
        "保存新的自定义视觉风格，可同时生成或上传一张风格参考图。",
        "视觉资产",
    ),
    "ai_anime_generate_style_preview": (
        "生成风格参考图",
        "为已有自定义风格生成并保存参考图，不重建或改写风格配置。",
        "视觉资产",
    ),
    "ai_anime_upload_style_preview": (
        "上传风格参考图",
        "把当前聊天附件中的图片绑定为已有自定义风格的参考图。",
        "视觉资产",
    ),
    "ai_anime_patch": (
        "更新项目 API",
        "调用 AI 漫剧 PATCH 接口修改指定业务资源；优先使用语义更明确的专用工具。",
        "项目与任务",
    ),
    "ai_anime_delete": (
        "删除项目资源",
        "调用 AI 漫剧 DELETE 接口删除指定资源；属于破坏性操作，执行前必须明确目标并确认。",
        "项目与任务",
    ),
    "ai_anime_pipeline_status": (
        "检查生产进度",
        "读取项目或指定分集的生产阶段、前置条件和当前完成状态。",
        "项目与任务",
    ),
    "ai_anime_list_tasks": (
        "列出生产任务",
        "按分集、任务类型或状态筛选任务中心记录，定位正在运行、失败或已完成的任务。",
        "项目与任务",
    ),
    "ai_anime_get_task": (
        "读取任务详情",
        "使用准确的 task_key 查询单个异步任务状态和结果。",
        "项目与任务",
    ),
    "ai_anime_wait_task": (
        "等待任务完成",
        "持续观察同一个 task_key，直到任务完成、失败、取消或本次等待超时；不会重复提交任务。",
        "项目与任务",
    ),
    "ai_anime_get_episode_script": (
        "读取分集剧本",
        "读取指定分集的当前剧本、Beat 和相关结构化内容。",
        "剧本与工作流",
    ),
    "ai_anime_list_ingest_uploads": (
        "查看已上传原稿",
        "列出项目素材导入目录中已经上传的小说、脚本或文档文件。",
        "剧本与工作流",
    ),
    "ai_anime_run_production_workflow": (
        "执行完整生产工作流",
        "从当前持久化状态补齐缺失前置并推进到最终合成；复用已有资产，默认遵循模型优先级路由。",
        "剧本与工作流",
    ),
    "ai_anime_run_script_workflow": (
        "执行剧本工作流",
        "按目标阶段推进原稿导入、分集规划和剧本生成，复用已存在且有效的内容。",
        "剧本与工作流",
    ),
    "ai_anime_start_ingest": (
        "导入故事原稿",
        "把已上传的小说或脚本文档导入项目，并启动规范化解析任务。",
        "剧本与工作流",
    ),
    "ai_anime_build_characters": (
        "构建角色资产",
        "根据已导入故事生成或补齐角色档案，为后续身份、肖像和剧本阶段提供基础。",
        "剧本与工作流",
    ),
    "ai_anime_plan_episodes": (
        "规划分集",
        "根据故事结构生成分集计划，明确每集范围、节奏和叙事目标。",
        "剧本与工作流",
    ),
    "ai_anime_generate_script": (
        "生成分集剧本",
        "为指定分集生成结构化剧本和 Beat，沿用项目已有角色、场景与风格信息。",
        "剧本与工作流",
    ),
    "ai_anime_update_character_face_prompt": (
        "更新角色面部描述",
        "修改角色用于肖像和身份图生成的面部提示，保持角色视觉身份一致。",
        "视觉资产",
    ),
    "ai_anime_plan_identities": (
        "规划角色身份",
        "为角色规划年龄、时期、服装或状态等身份变体，供身份图和镜头使用。",
        "视觉资产",
    ),
    "ai_anime_plan_scenes": (
        "规划场景资产",
        "从剧本中整理并生成场景清单、描述和拍摄方向。",
        "视觉资产",
    ),
    "ai_anime_plan_props": (
        "规划道具资产",
        "从剧本中整理关键道具及其外观、用途和连续性要求。",
        "视觉资产",
    ),
    "ai_anime_generate_scene_master": (
        "生成场景主视图",
        "为指定场景生成主方向参考图，作为镜头草图和渲染的一致性基准。",
        "视觉资产",
    ),
    "ai_anime_generate_scene_reverse": (
        "生成场景反打视图",
        "基于场景主视图生成反向机位参考图，用于正反打镜头的一致衔接。",
        "视觉资产",
    ),
    "ai_anime_generate_portrait": (
        "生成角色肖像",
        "为指定角色生成主肖像；默认遵循图像生成用途的云端/BYOK 优先级。",
        "视觉资产",
    ),
    "ai_anime_generate_identity_image": (
        "生成角色身份图",
        "为角色的指定身份或时期生成身份图；默认遵循图像编辑或生成用途优先级。",
        "视觉资产",
    ),
    "ai_anime_generate_sketches": (
        "生成镜头草图",
        "为指定分集或 Beat 生成/重做镜头草图，可限定范围并保留未选中的现有结果。",
        "视觉资产",
    ),
    "ai_anime_detect_sketch_identities": (
        "检测草图角色身份",
        "识别草图中的角色及身份变体，为后续上色、渲染和连续性检查提供绑定信息。",
        "视觉资产",
    ),
    "ai_anime_get_sketches": (
        "展示当前草图",
        "读取并展示分集当前正式采用的镜头草图，可按 Beat 分页筛选。",
        "素材展示",
    ),
    "ai_anime_get_first_frames": (
        "展示首帧",
        "读取并展示分集已生成的正式首帧，可限定一个或多个 Beat。",
        "素材展示",
    ),
    "ai_anime_get_sketch_candidates": (
        "展示草图候选",
        "读取某个 Beat 的草图候选池，与当前正式草图分开展示。",
        "素材展示",
    ),
    "ai_anime_get_scene_images": (
        "展示场景图片",
        "读取场景主视图、反打、全景或自定义场景图，并以可预览素材返回。",
        "素材展示",
    ),
    "ai_anime_get_character_media": (
        "展示角色素材",
        "读取角色肖像和身份图，可按角色名、身份或关键词筛选。",
        "素材展示",
    ),
    "ai_anime_get_episode_media": (
        "展示分集音视频",
        "读取指定分集的 Beat 视频或音频，可按 Beat 和内容关键词筛选。",
        "素材展示",
    ),
    "ai_anime_render_first_frames": (
        "重新生成首帧",
        "显式重做选定 Beat 的首帧并替换当前结果；只在用户明确要求重做时调用。",
        "视觉资产",
    ),
    "ai_anime_design_character_voices": (
        "设计角色声线",
        "按 AUDIO_VOICE_DESIGN 优先级生成并绑定缺失或无效声线；默认保留已有可用声线。",
        "声音",
    ),
    "ai_anime_generate_audio": (
        "生成分集配音",
        "生成指定分集的对白、旁白或音频；缺失角色声线会先按配置自动补齐。",
        "声音",
    ),
    "ai_anime_optimize_video_global": (
        "全局优化视频",
        "对指定分集执行全局视频优化任务，改善镜头间一致性和成片衔接。",
        "视频与成片",
    ),
    "ai_anime_compose_episode": (
        "合成分集成片",
        "在所需 Beat 视频和音频齐备后合成并导出最终分集视频。",
        "视频与成片",
    ),
    "ai_anime_get_final_video": (
        "展示最终成片",
        "读取并展示已经合成的分集最终视频；没有成片时返回真实缺失状态。",
        "素材展示",
    ),
    "ai_anime_start_single_video": (
        "生成单个 Beat 视频",
        "使用该 Beat 已保存的首帧和视频提示生成单段视频；模型始终遵循用途优先级。",
        "视频与成片",
    ),
}


def describe_tool(name: str, raw_description: str = "") -> dict[str, str]:
    """Return one localized display item while preserving unknown runtime tools."""
    metadata = _CORE_TOOLS.get(name) or _AI_ANIME_TOOLS.get(name)
    if metadata is None:
        label = name.replace("_", " ")
        description = raw_description.strip() or "当前运行时提供的扩展工具。"
        return {
            "name": name,
            "label": label,
            "description": description,
            "category": "其他工具",
            "source": "扩展",
        }
    label, description, category = metadata
    return {
        "name": name,
        "label": label,
        "description": description,
        "category": category,
        "source": "AI anime" if name in _AI_ANIME_TOOLS else "Hermes",
    }


def list_tool_catalog_for_home(
    home: Path,
    *,
    include_project_tools: bool,
) -> list[dict[str, str]]:
    """Build the visible catalog from core tools and the managed plugin registry."""
    discovered: list[tuple[str, str]] = [
        (name, "") for name in _CORE_TOOLS
    ]
    if include_project_tools:
        discovered.extend(_plugin_tools(home / "plugins" / "ai_anime" / "__init__.py"))

    catalog: list[dict[str, str]] = []
    seen: set[str] = set()
    for name, raw_description in discovered:
        if not name or name in seen:
            continue
        seen.add(name)
        catalog.append(describe_tool(name, raw_description))
    return catalog


def _plugin_tools(plugin_path: Path) -> list[tuple[str, str]]:
    """Read literal tool metadata without importing or executing plugin code."""
    try:
        tree = ast.parse(plugin_path.read_text(encoding="utf-8"))
    except (OSError, SyntaxError, UnicodeError):
        return []
    assignment = next(
        (
            node
            for node in tree.body
            if isinstance(node, ast.Assign)
            and any(
                isinstance(target, ast.Name) and target.id == "TOOLS"
                for target in node.targets
            )
        ),
        None,
    )
    if assignment is None or not isinstance(assignment.value, (ast.Tuple, ast.List)):
        return []

    tools: list[tuple[str, str]] = []
    for entry in assignment.value.elts:
        if not isinstance(entry, (ast.Tuple, ast.List)) or len(entry.elts) < 2:
            continue
        name = _literal_text(entry.elts[0])
        schema = entry.elts[1]
        description = ""
        if isinstance(schema, ast.Call) and len(schema.args) >= 2:
            description = _literal_text(schema.args[1])
        if name:
            tools.append((name, description))
    return tools


def _literal_text(node: ast.AST) -> str:
    try:
        value: Any = ast.literal_eval(node)
    except (ValueError, TypeError, SyntaxError):
        return ""
    return str(value).strip() if isinstance(value, str) else ""


__all__ = [
    "describe_tool",
    "list_tool_catalog_for_home",
]
