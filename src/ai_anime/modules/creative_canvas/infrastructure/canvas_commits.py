"""Local canonical-slot persistence for Creative Canvas."""

from __future__ import annotations

import inspect
import json
import logging
import shutil
from collections.abc import Awaitable, Callable, Mapping, Sequence
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter, ValidationError

from ai_anime.freezone.paths import freezone_root, resolve_static_url_to_path
from ai_anime.freezone.slots import (
    SlotTarget,
    backup_slot_if_exists,
    slot_target_path,
    sync_slot_after_write,
    validate_source_for_slot,
)
from ai_anime.models import beat_scene_id
from ai_anime.modules.creative_canvas.application.canvas_commits import (
    CopyCreativeCanvasSlotCommand,
    CreativeCanvasSlotBeatNotFound,
    CreativeCanvasSlotCopyResult,
    CreativeCanvasSlotSourceNotFound,
    InvalidCreativeCanvasSlotCommit,
)
from ai_anime.modules.creative_canvas.domain.canvas_commits import (
    CreativeCanvasImpactBeat,
    compute_creative_canvas_slot_impact,
    creative_canvas_slot_asset_key,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared.infrastructure.project_stores import (
    make_cognee_store_for_context,
    make_sqlite_store_for_context,
)
from ai_anime.shared.project_media import make_static_url_for_context


logger = logging.getLogger(__name__)

StoreFactory = Callable[[ProjectContext], Awaitable[Any]]
StaticUrlBuilder = Callable[[ProjectContext, str, Path | None], str]
UtcNow = Callable[[], str]

_SLOT_TARGET_ADAPTER = TypeAdapter(SlotTarget)


class LocalCreativeCanvasSlotCommitGateway:
    def __init__(
        self,
        *,
        store_factory: StoreFactory | None = None,
        cognee_store_factory: StoreFactory | None = None,
        static_url_builder: StaticUrlBuilder | None = None,
        utc_now: UtcNow | None = None,
    ) -> None:
        self._store_factory = store_factory
        self._cognee_store_factory = cognee_store_factory
        self._static_url_builder = static_url_builder
        self._utc_now = utc_now

    def copy(
        self,
        command: CopyCreativeCanvasSlotCommand,
    ) -> CreativeCanvasSlotCopyResult:
        target = self._target(command.target)
        try:
            source_path = resolve_static_url_to_path(
                command.source_url,
                command.project_dir,
            )
        except ValueError as exc:
            raise InvalidCreativeCanvasSlotCommit(str(exc)) from exc
        if not source_path.exists():
            raise CreativeCanvasSlotSourceNotFound(
                f"source file not found: {source_path}"
            )

        try:
            validate_source_for_slot(source_path, target)
            target_path = slot_target_path(command.project_dir, target)
        except ValueError as exc:
            raise InvalidCreativeCanvasSlotCommit(str(exc)) from exc
        if target.kind == "scene_3gs_custom_scene":
            target_path = target_path.with_suffix(source_path.suffix.lower())
        target_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            same_file = source_path.resolve() == target_path.resolve()
        except OSError:
            same_file = False
        should_match_existing_size = (
            target_path.exists()
            and not same_file
            and target.kind in {"frame", "sketch", "director_render"}
            and source_path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
            and target_path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
        )
        backup = None if same_file else backup_slot_if_exists(target_path)
        if same_file:
            image_adaptation = {"adapted": False, "same_file": True}
        elif should_match_existing_size:
            image_adaptation = _copy_image_matching_existing_target(
                source_path,
                target_path,
            )
        else:
            image_adaptation = {"adapted": False}
            shutil.copy2(source_path, target_path)

        sync_slot_after_write(command.project_dir, target, target_path)
        relative_path = target_path.relative_to(command.project_dir).as_posix()
        target_url = (self._static_url_builder or make_static_url_for_context)(
            command.context,
            relative_path,
            target_path,
        )
        return CreativeCanvasSlotCopyResult(
            target_path=target_path,
            target_url=target_url,
            backup_path=backup,
            image_adaptation=image_adaptation,
        )

    async def impact(
        self,
        *,
        context: ProjectContext,
        target: Mapping[str, Any],
    ) -> Sequence[Mapping[str, Any]]:
        target_payload = self._target(target).model_dump(mode="json")
        store = await (self._store_factory or make_sqlite_store_for_context)(context)
        try:
            beats = await store.list_visual_beats()
        finally:
            await _close_store(store)
        snapshots = [
            CreativeCanvasImpactBeat(
                episode=int(getattr(beat, "episode_number", 0)),
                beat=int(getattr(beat, "beat_number", 0)),
                visual_description=str(getattr(beat, "visual_description", "") or ""),
                scene_id=str(getattr(beat, "scene_id", "") or ""),
                detected_identities=_json_string_tuple(
                    getattr(beat, "detected_identities_json", "[]")
                ),
                detected_props=_json_string_tuple(
                    getattr(beat, "detected_props_json", "[]")
                ),
            )
            for beat in beats
        ]
        return compute_creative_canvas_slot_impact(snapshots, target_payload)

    def record_stale_marks(
        self,
        *,
        project_dir: Path,
        target: Mapping[str, Any],
        impacted: Sequence[Mapping[str, Any]],
        source_url: str,
    ) -> int:
        if not impacted:
            return 0
        target_payload = self._target(target).model_dump(mode="json")
        path = freezone_root(project_dir) / "stale_marks.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            existing = (
                json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
            )
        except (OSError, ValueError):
            existing = {}
        marks = existing.get("marks") if isinstance(existing, dict) else None
        if not isinstance(marks, list):
            marks = []

        asset_key = creative_canvas_slot_asset_key(target_payload) or str(
            target_payload["kind"]
        )
        created_at = self._now()
        existing_keys = {
            (mark.get("asset_key"), mark.get("episode"), mark.get("beat"))
            for mark in marks
            if isinstance(mark, dict)
        }
        added = 0
        for item in impacted:
            key = (asset_key, item.get("episode"), item.get("beat"))
            payload = {
                "asset_key": asset_key,
                "target": target_payload,
                "episode": item.get("episode"),
                "beat": item.get("beat"),
                "reason": f"{asset_key} changed from Freezone",
                "source_url": source_url,
                "created_at": created_at,
            }
            if key in existing_keys:
                for index, mark in enumerate(marks):
                    if (
                        isinstance(mark, dict)
                        and mark.get("asset_key") == key[0]
                        and mark.get("episode") == key[1]
                        and mark.get("beat") == key[2]
                    ):
                        marks[index] = payload
                        break
            else:
                marks.append(payload)
                existing_keys.add(key)
                added += 1
        path.write_text(
            json.dumps(
                {"updated_at": created_at, "marks": marks},
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        return added

    async def sync_selected_background(
        self,
        *,
        context: ProjectContext,
        target: Mapping[str, Any],
    ) -> None:
        target_payload = self._target(target).model_dump(mode="json")
        episode = int(target_payload["episode"])
        beat = int(target_payload["beat"])
        store = await (self._store_factory or make_sqlite_store_for_context)(context)
        try:
            beats = await store.get_beats_as_dicts(episode)
            selected = next(
                (item for item in beats if int(item.get("beat_number") or 0) == beat),
                None,
            )
            if not selected:
                raise CreativeCanvasSlotBeatNotFound(
                    f"beat not found: ep{episode} beat{beat}"
                )
            scene_ref = dict(selected.get("scene_ref") or {})
            scene_id = beat_scene_id(selected)
            if scene_id:
                scene_ref["scene_id"] = scene_id
            scene_ref["render_anchor_id"] = "selected_background"
            scene_ref["render_anchor_source_id"] = "freezone_commit"
            scene_ref.pop("render_anchor_path", None)
            await store.update_beat_asset(
                episode_number=episode,
                beat_number=beat,
                scene_ref=scene_ref,
            )
        finally:
            await _close_store(store)

    async def sync_identity_metadata(
        self,
        *,
        context: ProjectContext,
        target: Mapping[str, Any],
        target_path: Path,
    ) -> None:
        target_payload = self._target(target).model_dump(mode="json")
        try:
            store = await (self._cognee_store_factory or make_cognee_store_for_context)(
                context
            )
            character = str(target_payload["character"])
            identity_id = str(target_payload["identity_id"])
            if target_payload["kind"] == "identity_costume":
                try:
                    await store.update_character_identity(
                        character,
                        identity_id,
                        costume_image=str(target_path),
                    )
                except AttributeError:
                    logger.info(
                        "cognee_store.update_character_identity not available; "
                        "skipping costume metadata sync (file is updated)"
                    )
            if target_payload["kind"] == "identity_portrait":
                try:
                    await store.update_character_identity(
                        character,
                        identity_id,
                        portrait_image=str(target_path),
                    )
                except AttributeError:
                    logger.info(
                        "cognee_store.update_character_identity not available; "
                        "skipping identity portrait metadata sync (file is updated)"
                    )
            try:
                await store.touch_identity(character, identity_id)
            except AttributeError:
                logger.info(
                    "cognee_store.touch_identity not available; "
                    "skipping metadata sync (file is updated)"
                )
        except Exception as exc:  # noqa: BLE001 - metadata sync is best effort
            logger.warning("identity cognee sync best-effort failed: %s", exc)

    @staticmethod
    def _target(target: Mapping[str, Any]) -> SlotTarget:
        try:
            return _SLOT_TARGET_ADAPTER.validate_python(dict(target))
        except ValidationError as exc:
            raise InvalidCreativeCanvasSlotCommit("invalid slot target") from exc

    def _now(self) -> str:
        return (self._utc_now or (lambda: datetime.now().isoformat()))()


async def _close_store(store: Any) -> None:
    close = getattr(store, "close", None)
    if not close:
        return
    closed = close()
    if inspect.isawaitable(closed):
        await closed


def _json_string_tuple(raw: Any) -> tuple[str, ...]:
    try:
        values = json.loads(raw or "[]")
    except (TypeError, ValueError):
        values = []
    if not isinstance(values, list):
        return ()
    return tuple(str(value) for value in values if value)


def _copy_image_matching_existing_target(
    source_path: Path,
    target_path: Path,
) -> dict[str, Any]:
    from PIL import Image, ImageOps

    with Image.open(target_path) as target_image:
        target_size = target_image.size
        target_mode = target_image.mode
    with Image.open(source_path) as source_image:
        source = ImageOps.exif_transpose(source_image)
        source_size = source.size
        if source_size == target_size:
            shutil.copy2(source_path, target_path)
            return {
                "adapted": False,
                "source_size": list(source_size),
                "target_size": list(target_size),
            }

        if target_mode in {"RGBA", "LA"}:
            canvas_mode = "RGBA"
            background = (255, 255, 255, 0)
            source = source.convert("RGBA")
        else:
            canvas_mode = "RGB"
            background = (255, 255, 255)
            source = source.convert("RGB")

        fitted = ImageOps.contain(source, target_size, Image.Resampling.LANCZOS)
        canvas = Image.new(canvas_mode, target_size, background)
        offset = (
            (target_size[0] - fitted.size[0]) // 2,
            (target_size[1] - fitted.size[1]) // 2,
        )
        canvas.paste(fitted, offset, fitted if fitted.mode == "RGBA" else None)
        save_kwargs = {"format": "PNG"} if target_path.suffix.lower() == ".png" else {}
        canvas.save(target_path, **save_kwargs)
        return {
            "adapted": True,
            "source_size": list(source_size),
            "target_size": list(target_size),
            "fitted_size": list(fitted.size),
        }


__all__ = ["LocalCreativeCanvasSlotCommitGateway"]
