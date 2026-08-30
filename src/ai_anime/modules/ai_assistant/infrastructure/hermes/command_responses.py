"""Chinese, product-accurate responses for Hermes slash commands."""

from __future__ import annotations

import re

from ai_anime.modules.ai_assistant.infrastructure.hermes.tool_catalog import (
    describe_tool,
)


_LOCALIZED_RUNTIME_COMMANDS = frozenset(
    {"tools", "context", "reset", "compact", "version"}
)
_COMMAND_PATTERN = re.compile(r"^/([A-Za-z][A-Za-z0-9_-]*)(?:\s+([\s\S]*))?$")
_COMPACT_PATTERN = re.compile(
    r"Context compressed:\s*([\d,]+)\s*->\s*([\d,]+)\s*messages\s*"
    r"~([\d,]+)\s*->\s*~([\d,]+)\s*tokens",
    re.IGNORECASE,
)


def slash_command_parts(prompt: str) -> tuple[str, str] | None:
    match = _COMMAND_PATTERN.fullmatch(str(prompt or "").strip())
    if match is None:
        return None
    return match.group(1).lower(), (match.group(2) or "").strip()


def should_localize_runtime_command(prompt: str) -> str | None:
    parts = slash_command_parts(prompt)
    if parts is None or parts[0] not in _LOCALIZED_RUNTIME_COMMANDS:
        return None
    return parts[0]


def help_response() -> str:
    return "\n".join(
        (
            "可用命令：",
            "",
            "/model　选择当前对话使用的模型",
            "/tools　查看当前可用工具",
            "",
            "上下文状态、压缩、清空和运行版本已整合到输入框右下角的“上下文”按钮。",
            "",
            "Skills 会自动加载在 / 菜单的“Skills”分组中；选择后补充任务说明即可执行。",
        )
    )


def model_response(selector: str | None, *, has_arguments: bool = False) -> str:
    if has_arguments:
        return (
            "请从 /model 打开的模型列表中选择。直接输入模型名称不会绕过或修改"
            "右上角的全局模型优先级。"
        )
    if selector is None:
        return "当前对话使用“自动”模式：每次请求均遵循右上角设置中的模型优先级路由。"
    return (
        f"当前对话已固定使用：{_route_label(selector)}。"
        "该选择仅影响当前对话，不修改右上角的全局模型优先级。"
    )


def localize_runtime_response(command: str, response: str) -> str:
    raw = str(response or "").strip()
    if command == "tools":
        return _localize_tools(raw)
    if command == "context":
        return _localize_context(raw)
    if command == "reset":
        if "cleared" in raw.casefold():
            suffix = "；运行内核状态重置失败，请查看日志。" if "failed" in raw.casefold() else "。"
            return f"已清空当前对话的模型上下文；界面中的聊天记录仍会保留{suffix}"
        return _command_failure("清空模型上下文", raw)
    if command == "compact":
        return _localize_compact(raw)
    if command == "version":
        version = re.search(r"(?:Hermes Agent\s*)?v?([0-9][\w.+-]*)", raw)
        return (
            f"AI anime 助手运行内核：Hermes v{version.group(1)}"
            if version
            else _command_failure("读取运行内核版本", raw)
        )
    return raw


def _route_label(selector: str) -> str:
    if selector.startswith("cloud:"):
        return f"云端 / {selector.removeprefix('cloud:')}"
    if selector.startswith("byok:"):
        parts = selector.split(":", 2)
        if len(parts) == 3:
            return f"BYOK / {parts[2]}"
    return selector


def _localize_tools(raw: str) -> str:
    if "no tools available" in raw.casefold():
        return "当前没有可用工具。"
    tools: list[dict[str, str]] = []
    for line in raw.splitlines()[1:]:
        candidate, separator, raw_description = line.strip().partition(":")
        candidate = candidate.strip()
        if re.fullmatch(r"[A-Za-z][A-Za-z0-9_.-]*", candidate):
            tools.append(
                describe_tool(
                    candidate,
                    raw_description.strip() if separator else "",
                )
            )
    if tools:
        return "当前可用工具（{} 个）：\n{}".format(
            len(tools),
            "\n".join(
                f"- `{tool['name']}`（{tool['label']}）：{tool['description']}"
                for tool in tools
            ),
        )
    return _command_failure("读取工具列表", raw)


def _localize_context(raw: str) -> str:
    if not raw:
        return _command_failure("读取模型上下文", raw)
    replacements = (
        (r"Conversation is empty \(no messages yet\)\.", "当前模型上下文为空。"),
        (r"Conversation:\s*([\d,]+) messages", r"模型上下文：\1 条消息"),
        (
            r"user:\s*([\d,]+), assistant:\s*([\d,]+), tool:\s*([\d,]+), system:\s*([\d,]+)",
            r"用户 \1，助手 \2，工具 \3，系统 \4",
        ),
        (r"Model:\s*.+", "模型路由：由当前对话选择决定"),
        (r"Provider:\s*.+", "提供方：统一模型网关"),
        (r"Context usage:", "上下文占用："),
        (r"Compression threshold:", "压缩阈值："),
        (r"Compression: due now[^\n]*", "压缩状态：已达到阈值，可使用“压缩上下文”。"),
        (r"Compression: ~([\d,]+) tokens until threshold[^\n]*", r"压缩状态：距阈值约 \1 tokens。"),
        (r"Compression is disabled for this agent\.", "当前未启用上下文压缩。"),
        (r"Tip: run /compact[^\n]*", "提示：可使用右下角的“压缩上下文”立即压缩。"),
    )
    localized = raw
    for pattern, replacement in replacements:
        localized = re.sub(pattern, replacement, localized, flags=re.IGNORECASE)
    return localized


def _localize_compact(raw: str) -> str:
    lowered = raw.casefold()
    if "nothing to compress" in lowered:
        return "当前对话没有可压缩的模型上下文。"
    if "compression is disabled" in lowered:
        return "当前对话未启用模型上下文压缩。"
    if "compression not available" in lowered:
        return "当前运行内核不支持手动压缩模型上下文。"
    match = _COMPACT_PATTERN.search(raw)
    if match:
        before_messages, after_messages, before_tokens, after_tokens = match.groups()
        if before_messages == after_messages and before_tokens == after_tokens:
            return "当前上下文均为必须保留的近期内容，本次无需压缩。"
        return (
            f"模型上下文压缩完成：消息 {before_messages} → {after_messages}，"
            f"约 {before_tokens} → {after_tokens} tokens。"
        )
    return _command_failure("压缩模型上下文", raw)


def _command_failure(action: str, raw: str) -> str:
    detail = raw[:240].strip()
    if detail and re.search(r"[\u3400-\u9fff]", detail):
        return f"{action}失败。运行内核返回：{detail}"
    return f"{action}失败，运行内核未能完成该操作。"


__all__ = [
    "help_response",
    "localize_runtime_response",
    "model_response",
    "should_localize_runtime_command",
    "slash_command_parts",
]
