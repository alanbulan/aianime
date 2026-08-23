"""Map Story Intake application results to the existing HTTP payload contract."""

from __future__ import annotations

from ai_anime.modules.story_intake.public import (
    NoChaptersDetected,
    SpineTemplateChangeRequiresRebuild,
    StoryDocumentNotFound,
    StoryDocumentParseFailed,
    StoryDocumentTooLarge,
    StoryIntakeError,
    StoryTextTooLarge,
    UnsafeStoryDocumentName,
    UnsupportedStoryDocument,
)


def _format_size_limit(limit_bytes: int) -> str:
    if limit_bytes % (1024 * 1024) == 0:
        return f"{limit_bytes // (1024 * 1024)}MB"
    return f"{limit_bytes // 1024}KB"


def story_intake_error_payload(error: Exception) -> dict:
    if isinstance(error, UnsafeStoryDocumentName):
        return {"ok": False, "error": "非法文件名"}
    if isinstance(error, UnsupportedStoryDocument):
        return {
            "ok": False,
            "error": (
                f"不支持的文件类型: {error.suffix}，"
                f"当前支持: {error.supported_extensions}"
            ),
            "error_type": "unsupported",
        }
    if isinstance(error, StoryDocumentTooLarge):
        return {
            "ok": False,
            "error": (
                f"文件超过 {_format_size_limit(error.max_bytes)} 上限，"
                "请压缩文件或拆分正文后重新上传。"
            ),
            "error_type": "file_too_large",
            "data": {"limit_bytes": error.max_bytes},
        }
    if isinstance(error, StoryTextTooLarge):
        return {
            "ok": False,
            "error": (
                f"正文共 {error.actual_chars:,} 字，超过单次导入上限 "
                f"{error.max_chars:,} 字。请拆分后重新上传。"
            ),
            "error_type": "text_too_large",
            "data": {
                "limit_chars": error.max_chars,
                "actual_chars": error.actual_chars,
            },
        }
    if isinstance(error, StoryDocumentNotFound):
        return {
            "ok": False,
            "error": f"File '{error.filename}' not found in uploads/",
        }
    if isinstance(error, StoryDocumentParseFailed):
        if error.source_format is None:
            return {"ok": False, "error": "解析章节失败"}
        return {
            "ok": False,
            "error": f"解析章节失败: {error.detail}",
            "error_type": "parse",
            "format": error.source_format,
            "detail": error.detail,
        }
    if isinstance(error, NoChaptersDetected):
        return {
            "ok": False,
            "error": "解析章节失败: 未检测到有效章节内容",
            "format_check": error.format_check,
        }
    if isinstance(error, SpineTemplateChangeRequiresRebuild):
        return {"ok": False, "error": "项目类型只能在重新导入时修改"}
    if isinstance(error, StoryIntakeError):
        return {"ok": False, "error": str(error)}
    raise TypeError(f"Unsupported Story Intake error: {type(error).__name__}")
