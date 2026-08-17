"""账号级视觉风格目录适配器。"""

import json
import logging
import os
import shutil
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping, Optional

from ai_anime.shared.runtime_paths import OUTPUT_DIR, STATE_DIR
from ai_anime.modules.asset_world.application.style_models import StyleConfig

logger = logging.getLogger(__name__)


class StyleService:
    """风格配置管理服务。

    提供统一的风格配置访问接口，支持：
    1. 系统预设风格（从 JSON 文件加载，只读）
    2. 自定义风格（账号级目录，可读写，所有项目共享）

    所有风格访问都应通过此服务，确保 One Source of Truth。
    """

    # 预设文件目录
    PRESETS_DIR = Path(__file__).resolve().parents[3] / "styles" / "presets"

    # 预设风格缓存（避免重复读取文件）
    _preset_cache: dict[str, StyleConfig] = {}
    _catalog_lock = threading.RLock()
    STYLE_FAMILY_LABELS = {
        "live_action": "真人",
        "animation": "动画",
    }
    ANIMATION_SUBTYPE_LABELS = {
        "2d": "2D",
        "3d": "3D",
        "hybrid": "混合媒介",
    }
    STYLE_PREVIEW_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".gif")

    @staticmethod
    def build_style_config(payload: Mapping[str, Any]) -> StyleConfig:
        return StyleConfig(**dict(payload))

    @classmethod
    def preset_preview_path(cls, style_id: str) -> Path:
        return cls.PRESETS_DIR / f"{style_id}.png"

    @staticmethod
    def _account_root(base_dir: str | Path, username: str) -> Path:
        root = Path(base_dir).resolve()
        candidate = (root / username / "_account").resolve()
        if not candidate.is_relative_to(root):
            raise ValueError("Invalid username")
        return candidate

    @classmethod
    def _catalog_path(cls, username: str) -> Path:
        return cls._account_root(STATE_DIR, username) / "styles" / "catalog.json"

    @classmethod
    def _style_asset_root(cls, username: str) -> Path:
        return cls._account_root(OUTPUT_DIR, username)

    @classmethod
    def resolve_style_preview_path(
        cls,
        username: str,
        preview_path: str,
    ) -> Path | None:
        root = cls._style_asset_root(username)
        candidate = (root / preview_path).resolve()
        if not candidate.is_relative_to(root) or not candidate.is_file():
            return None
        return candidate

    @classmethod
    def _style_preview_dir(cls, username: str, style_id: str) -> Path:
        account_root = cls._style_asset_root(username)
        if not style_id or Path(style_id).name != style_id:
            raise ValueError("Invalid style id")
        style_dir = (account_root / "styles" / style_id).resolve()
        if not style_dir.is_relative_to(account_root):
            raise ValueError("Invalid style preview path")
        return style_dir

    @classmethod
    def remove_style_previews(cls, username: str, style_id: str) -> None:
        """Remove every supported reference image variant for a custom style."""
        style_dir = cls._style_preview_dir(username, style_id)
        for extension in cls.STYLE_PREVIEW_EXTENSIONS:
            candidate = style_dir / f"reference{extension}"
            if candidate.is_file():
                candidate.unlink()

    @classmethod
    def stage_style_preview(
        cls,
        username: str,
        content: bytes,
        extension: str,
    ) -> str:
        """Store an uploaded reference image in the account staging area."""
        suffix = extension.lower()
        if not suffix.startswith("."):
            suffix = f".{suffix}"
        if suffix not in cls.STYLE_PREVIEW_EXTENSIONS:
            raise ValueError("Unsupported style preview image type")
        account_root = cls._style_asset_root(username)
        staging_dir = account_root / "styles" / ".staging"
        staging_dir.mkdir(parents=True, exist_ok=True)
        relative = Path("styles") / ".staging" / f"{uuid.uuid4().hex}{suffix}"
        (account_root / relative).write_bytes(content)
        return relative.as_posix()

    @classmethod
    def finalize_style_preview(
        cls,
        username: str,
        style_id: str,
        staged_path: str,
    ) -> str:
        """Move a staged reference image to its custom style directory."""
        account_root = cls._style_asset_root(username)
        target_dir = cls._style_preview_dir(username, style_id)
        staged = (account_root / staged_path).resolve()
        staging_root = (account_root / "styles" / ".staging").resolve()
        if not staged.is_relative_to(staging_root) or not staged.is_file():
            raise ValueError("Invalid style preview token")
        if staged.suffix.lower() not in cls.STYLE_PREVIEW_EXTENSIONS:
            raise ValueError("Unsupported style preview image type")
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / f"reference{staged.suffix.lower()}"
        cls.remove_style_previews(username, style_id)
        shutil.move(str(staged), str(target))
        return target.relative_to(account_root).as_posix()

    @classmethod
    def find_style_preview(cls, username: str, style_id: str) -> str | None:
        """Return an already-uploaded reference image for a style, if present."""
        root = cls._style_asset_root(username)
        style_root = cls._style_preview_dir(username, style_id)
        for extension in cls.STYLE_PREVIEW_EXTENSIONS:
            candidate = style_root / f"reference{extension}"
            if candidate.is_file():
                return candidate.relative_to(root).as_posix()
        return None

    @classmethod
    def validate_style_preview_path(
        cls,
        username: str,
        style_id: str,
        preview_path: str,
    ) -> str:
        """Validate that a preview points at the style's published reference file."""
        root = cls._style_asset_root(username)
        style_root = cls._style_preview_dir(username, style_id)
        candidate = (root / preview_path).resolve()
        if candidate.parent != style_root:
            raise ValueError("Invalid style preview path")
        if candidate.name not in {
            f"reference{extension}" for extension in cls.STYLE_PREVIEW_EXTENSIONS
        }:
            raise ValueError("Invalid style preview path")
        if not candidate.is_file():
            raise ValueError("Custom style preview does not exist")
        return candidate.relative_to(root).as_posix()

    @staticmethod
    def resolve_username(
        username: str | None = None,
        project_dir: str | Path | None = None,
    ) -> str | None:
        if username:
            return username
        if project_dir:
            try:
                relative = Path(project_dir).resolve().relative_to(Path(OUTPUT_DIR).resolve())
                return relative.parts[0] if len(relative.parts) >= 2 else None
            except (OSError, ValueError):
                return None
        return None

    @classmethod
    def _load_custom_style_map(cls, username: str | None) -> dict[str, dict]:
        if not username:
            return {}
        path = cls._catalog_path(username)
        if not path.is_file():
            return {}
        payload = json.loads(path.read_text(encoding="utf-8"))
        styles = payload.get("styles") if isinstance(payload, dict) else None
        return styles if isinstance(styles, dict) else {}

    @classmethod
    def _save_custom_style_map(
        cls,
        styles: dict[str, dict],
        *,
        username: str,
    ) -> bool:
        path = cls._catalog_path(username)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        temporary.write_text(
            json.dumps({"styles": styles}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(temporary, path)
        return True

    @classmethod
    def get_preset(cls, style_id: str) -> Optional[StyleConfig]:
        """获取系统预设风格（从文件）。

        Args:
            style_id: 风格 ID，如 'chinese_period_drama'

        Returns:
            StyleConfig 实例，如果不存在返回 None
        """
        # 检查缓存
        if style_id in cls._preset_cache:
            return cls._preset_cache[style_id]

        # 从文件加载
        preset_file = cls.PRESETS_DIR / f"{style_id}.json"
        if not preset_file.exists():
            return None

        try:
            data = json.loads(preset_file.read_text(encoding="utf-8"))
            data["is_preset"] = True
            config = StyleConfig(**data)
            cls._preset_cache[style_id] = config
            return config
        except Exception as e:
            print(f"[StyleService] 加载预设失败: {style_id}, {e}")
            return None

    @classmethod
    def get_custom_style(
        cls,
        style_id: str,
        username: str | None = None,
        project_dir: str | Path | None = None,
    ) -> Optional[StyleConfig]:
        """获取账号级自定义风格。"""
        try:
            resolved_username = cls.resolve_username(username, project_dir)
            styles = cls._load_custom_style_map(resolved_username)
            config_data = styles.get(style_id)
            if isinstance(config_data, dict):
                return StyleConfig(**{**config_data, "is_preset": False})
        except Exception:
            logger.exception("加载自定义风格失败: %s", style_id)

        return None

    @classmethod
    def save_custom_style(
        cls,
        style_id: str,
        config: StyleConfig,
        username: str,
    ) -> bool:
        """保存账号级自定义风格。"""
        try:
            stored = config.model_copy(
                update={
                    "id": style_id,
                    "is_preset": False,
                    "created_at": config.created_at or datetime.now(),
                }
            )
            with cls._catalog_lock:
                styles = cls._load_custom_style_map(username)
                styles[style_id] = stored.model_dump(mode="json")
                cls._save_custom_style_map(styles, username=username)
            logger.info("账号级自定义风格已保存: %s/%s", username, style_id)
            return True
        except Exception:
            logger.exception("保存自定义风格失败: %s/%s", username, style_id)
            return False

    @classmethod
    def update_custom_style_preview(
        cls,
        style_id: str,
        preview_path: str,
        *,
        username: str,
    ) -> bool:
        """Atomically update only one custom style's preview path."""
        try:
            with cls._catalog_lock:
                styles = cls._load_custom_style_map(username)
                raw_style = styles.get(style_id)
                if not isinstance(raw_style, dict):
                    return False
                style = dict(raw_style)
                style["preview_path"] = preview_path
                styles[style_id] = style
                cls._save_custom_style_map(styles, username=username)
            return True
        except Exception:
            logger.exception("更新自定义风格参考图失败: %s/%s", username, style_id)
            return False

    @classmethod
    def delete_custom_style(
        cls,
        style_id: str,
        username: str,
    ) -> bool:
        """删除账号级自定义风格及其参考图。"""
        try:
            with cls._catalog_lock:
                styles = cls._load_custom_style_map(username)
                if style_id not in styles:
                    return False
                styles.pop(style_id)
                cls._save_custom_style_map(styles, username=username)
                cls.remove_style_previews(username, style_id)
            logger.info("账号级自定义风格已删除: %s/%s", username, style_id)
            return True
        except Exception:
            logger.exception("删除自定义风格失败: %s/%s", username, style_id)
            return False

    @classmethod
    def list_custom_styles(
        cls,
        username: str | None = None,
        project_dir: str | Path | None = None,
    ) -> list[str]:
        """列出所有自定义风格 ID。

        Returns:
            自定义风格 ID 列表
        """
        try:
            resolved_username = cls.resolve_username(username, project_dir)
            styles = cls._load_custom_style_map(resolved_username)
            return sorted(styles.keys())
        except Exception:
            logger.exception("列出账号级自定义风格失败")

        return []

    @classmethod
    def get_style(
        cls,
        style_id: str,
        username: str | None = None,
        project_dir: str | Path | None = None,
    ) -> Optional[StyleConfig]:
        """获取风格配置（统一入口）。

        自定义 ID 与系统预设 ID 不允许冲突。
        """
        custom = cls.get_custom_style(
            style_id,
            username=username,
            project_dir=project_dir,
        )
        if custom:
            return custom

        # 回退到系统预设
        preset = cls.get_preset(style_id)
        if preset:
            return preset

        return None

    @classmethod
    def get_style_or_default(
        cls,
        style_id: str,
        username: str | None = None,
        project_dir: str | Path | None = None,
    ) -> StyleConfig:
        """获取风格配置，如果不存在返回默认风格。

        Args:
            style_id: 风格 ID

        Returns:
            StyleConfig 实例（保证不为 None）
        """
        style = cls.get_style(style_id, username=username, project_dir=project_dir)
        if style:
            return style

        # 返回默认风格
        default = cls.get_preset("chinese_period_drama")
        if default:
            return default

        # 兜底：返回空配置
        return StyleConfig(id="unknown", name="Unknown Style")

    @classmethod
    def list_preset_styles(cls) -> list[dict]:
        """列出所有系统预设风格。

        Returns:
            预设风格列表，每项包含 {id, name, type}
        """
        styles = []
        if cls.PRESETS_DIR.exists():
            for f in sorted(cls.PRESETS_DIR.glob("*.json")):
                style_id = f.stem
                config = cls.get_preset(style_id)
                if config:
                    styles.append({
                        "id": style_id,
                        "name": config.name,
                        "label": config.label or config.name,
                        "type": "preset",
                        "style_family": config.style_family,
                        "animation_subtype": config.animation_subtype,
                    })
        return styles

    @classmethod
    def list_all_styles(
        cls,
        username: str | None = None,
        project_dir: str | Path | None = None,
    ) -> list[dict]:
        """列出所有可用风格（预设 + 自定义）。

        Returns:
            风格列表，每项包含 {id, name, label, type}
        """
        styles = []

        # 系统预设
        styles.extend(cls.list_preset_styles())

        # 自定义风格
        for style_id in cls.list_custom_styles(username=username, project_dir=project_dir):
            config = cls.get_custom_style(style_id, username=username, project_dir=project_dir)
            if config:
                styles.append({
                    "id": style_id,
                    "name": config.name,
                    "label": config.label or config.name,
                    "type": "custom",
                    "preview_path": config.preview_path,
                    "style_family": config.style_family,
                    "animation_subtype": config.animation_subtype,
                })

        return styles

    @classmethod
    def get_style_family(
        cls,
        style_id: str,
        username: str | None = None,
        project_dir: str | Path | None = None,
    ) -> str:
        config = cls.get_style_or_default(style_id, username=username, project_dir=project_dir)
        return config.style_family or "live_action"

    @classmethod
    def get_animation_subtype(
        cls,
        style_id: str,
        username: str | None = None,
        project_dir: str | Path | None = None,
    ) -> str:
        config = cls.get_style_or_default(style_id, username=username, project_dir=project_dir)
        return (config.animation_subtype or "").lower()

    @classmethod
    def get_style_branch(
        cls,
        style_id: str,
        username: str | None = None,
        project_dir: str | Path | None = None,
    ) -> tuple[str, str]:
        config = cls.get_style_or_default(style_id, username=username, project_dir=project_dir)
        return config.style_family or "live_action", (config.animation_subtype or "").lower()

    @classmethod
    def is_animation_style(
        cls,
        style_id: str,
        username: str | None = None,
        project_dir: str | Path | None = None,
    ) -> bool:
        return cls.get_style_family(style_id, username=username, project_dir=project_dir) == "animation"

    @classmethod
    def is_live_action_style(
        cls,
        style_id: str,
        username: str | None = None,
        project_dir: str | Path | None = None,
    ) -> bool:
        return not cls.is_animation_style(style_id, username=username, project_dir=project_dir)

    @classmethod
    def format_style_family_label(cls, family: str, subtype: str = "") -> str:
        base = cls.STYLE_FAMILY_LABELS.get(family or "live_action", "真人")
        subtype = (subtype or "").lower()
        if family == "animation" and subtype:
            return f"{base} · {cls.ANIMATION_SUBTYPE_LABELS.get(subtype, subtype.upper())}"
        return base

    @classmethod
    def list_styles_by_family(
        cls,
        username: str | None = None,
        project_dir: str | Path | None = None,
    ) -> dict[str, list[dict]]:
        grouped = {
            "live_action": [],
            "animation": [],
        }
        for style in cls.list_all_styles(username=username, project_dir=project_dir):
            family = style.get("style_family") or "live_action"
            grouped.setdefault(family, []).append(style)
        return grouped

    @classmethod
    def get_default_style_for_family(
        cls,
        family: str,
        *,
        animation_subtype: str | None = None,
        username: str | None = None,
        project_dir: str | Path | None = None,
    ) -> str:
        grouped = cls.list_styles_by_family(username=username, project_dir=project_dir)
        styles = grouped.get(family or "live_action", [])
        subtype = (animation_subtype or "").lower()
        if family == "animation" and subtype:
            for preferred in ("guoman_fantasy", "anime"):
                if any(
                    style["id"] == preferred and (style.get("animation_subtype") or "").lower() == subtype
                    for style in styles
                ):
                    return preferred
            for style in styles:
                if (style.get("animation_subtype") or "").lower() == subtype:
                    return style["id"]
        if family == "animation":
            for preferred in ("guoman_fantasy", "anime"):
                if any(style["id"] == preferred for style in styles):
                    return preferred
        for preferred in ("chinese_period_drama", "realistic"):
            if any(style["id"] == preferred for style in styles):
                return preferred
        return styles[0]["id"] if styles else "chinese_period_drama"

    @classmethod
    def get_style_labels(
        cls,
        username: str | None = None,
        project_dir: str | Path | None = None,
    ) -> dict[str, str]:
        """获取风格 ID -> 显示标签的映射。

        用于 UI 下拉菜单等场景，兼容旧版 STYLE_LABELS 用法。

        Returns:
            {style_id: label} 字典
        """
        labels = {}
        for style in cls.list_all_styles(username=username, project_dir=project_dir):
            labels[style["id"]] = style["label"]
        return labels

    @classmethod
    def clear_cache(cls):
        """清除预设缓存（用于热重载）。"""
        cls._preset_cache.clear()

    @classmethod
    def get_legacy_style_preset(
        cls,
        style_id: str,
        username: str | None = None,
        project_dir: str | Path | None = None,
    ) -> dict:
        """获取旧版格式的风格预设（向后兼容）。

        保持与 config.py 中 STYLE_PRESETS 相同的字典格式。

        Args:
            style_id: 风格 ID

        Returns:
            旧版格式的风格配置字典
        """
        config = cls.get_style_or_default(style_id, username=username, project_dir=project_dir)
        return config.to_legacy_dict()
