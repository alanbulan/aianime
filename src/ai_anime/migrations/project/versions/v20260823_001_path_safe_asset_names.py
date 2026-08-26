"""Normalize path-hostile character, scene, and prop names.

Names are database keys, REST path segments, and asset directory names. This
migration keeps the original value as an alias, moves in-project asset trees,
and updates character identity references that embed the character name.
"""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Any

import aiosqlite

from ai_anime.modules.asset_world.public import (
    asset_dir_within,
    is_path_safe_asset_name,
    stage_manifest,
    unique_path_safe_asset_name,
)
from ai_anime.shared.utils.identity_refs import (
    remap_character_asset_path,
    remap_default_map,
    remap_id_list,
    remap_identity_id,
    remap_identity_markers,
    remap_keyed_by_identity,
    remap_object_field,
)

VERSION = "20260823_001_path_safe_asset_names"


def _load_list(raw: Any, *, field: str) -> list[Any]:
    value = json.loads(str(raw or "[]"))
    if not isinstance(value, list):
        raise ValueError(f"{field} must contain a JSON list")
    return value


def _load_dict(raw: Any, *, field: str) -> dict[str, Any]:
    value = json.loads(str(raw or "{}"))
    if not isinstance(value, dict):
        raise ValueError(f"{field} must contain a JSON object")
    return value


async def _name_plan(
    db: aiosqlite.Connection,
    table: str,
    *,
    kind: str,
) -> list[tuple[str, str]]:
    async with db.execute(f"SELECT name FROM {table} ORDER BY name") as cursor:
        rows = await cursor.fetchall()
    taken = {str(row["name"] or "") for row in rows}
    plan: list[tuple[str, str]] = []
    for row in rows:
        old_name = str(row["name"] or "")
        if is_path_safe_asset_name(old_name, kind=kind):
            continue
        taken.discard(old_name)
        new_name = unique_path_safe_asset_name(old_name, taken, kind=kind)
        if new_name and new_name != old_name:
            plan.append((old_name, new_name))
            taken.add(new_name)
        else:
            taken.add(old_name)
    return plan


def _move_asset_tree(
    root: Path,
    old_name: str,
    new_name: str,
    moved: list[tuple[Path, str, str]],
) -> None:
    old_dir = asset_dir_within(root, old_name)
    new_dir = asset_dir_within(root, new_name)
    if old_dir is None or new_dir is None or not old_dir.exists():
        return
    if new_dir.exists():
        raise ValueError(f"Target asset directory already exists: {new_dir}")
    new_dir.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(old_dir), str(new_dir))
    moved.append((root, old_name, new_name))


def _rollback_asset_moves(moved: list[tuple[Path, str, str]]) -> None:
    for root, old_name, new_name in reversed(moved):
        current = asset_dir_within(root, new_name)
        original = asset_dir_within(root, old_name)
        if current is None or original is None or not current.exists():
            continue
        if original.exists():
            continue
        original.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(current), str(original))


async def _cascade_voice_speakers(
    db: aiosqlite.Connection,
    old_name: str,
    new_name: str,
) -> None:
    async with db.execute(
        "SELECT episode_number, beat_number, speaker "
        "FROM seedance2_voice_audio_records"
    ) as cursor:
        rows = await cursor.fetchall()
    for row in rows:
        speaker = str(row["speaker"] or "")
        remapped = remap_identity_id(speaker, old_name, new_name)
        if remapped == speaker:
            continue
        key = (row["episode_number"], row["beat_number"])
        async with db.execute(
            "SELECT 1 FROM seedance2_voice_audio_records "
            "WHERE episode_number = ? AND beat_number = ? AND speaker = ?",
            (*key, remapped),
        ) as cursor:
            occupied = await cursor.fetchone() is not None
        if occupied:
            await db.execute(
                "DELETE FROM seedance2_voice_audio_records "
                "WHERE episode_number = ? AND beat_number = ? AND speaker = ?",
                (*key, speaker),
            )
        else:
            await db.execute(
                "UPDATE seedance2_voice_audio_records SET speaker = ? "
                "WHERE episode_number = ? AND beat_number = ? AND speaker = ?",
                (remapped, *key, speaker),
            )


async def _cascade_character_references(
    db: aiosqlite.Connection,
    old_name: str,
    new_name: str,
) -> None:
    async with db.execute(
        "SELECT number, character_names, identity_ids, "
        "identity_default_map_json, sketch_colors_json, prop_menu_json "
        "FROM episodes"
    ) as cursor:
        episodes = await cursor.fetchall()
    for row in episodes:
        updates: dict[str, str] = {}
        candidates = (
            ("character_names", remap_id_list(row["character_names"], old_name, new_name)),
            ("identity_ids", remap_id_list(row["identity_ids"], old_name, new_name)),
            (
                "identity_default_map_json",
                remap_default_map(row["identity_default_map_json"], old_name, new_name),
            ),
            (
                "sketch_colors_json",
                remap_keyed_by_identity(row["sketch_colors_json"], old_name, new_name),
            ),
            (
                "prop_menu_json",
                remap_object_field(
                    row["prop_menu_json"],
                    "owner_identity_id",
                    old_name,
                    new_name,
                ),
            ),
        )
        for column, value in candidates:
            if value is not None:
                updates[column] = value
        if updates:
            assignments = ", ".join(f"{column} = ?" for column in updates)
            await db.execute(
                f"UPDATE episodes SET {assignments}, updated_at = datetime('now') "
                "WHERE number = ?",
                (*updates.values(), row["number"]),
            )

    async with db.execute(
        "SELECT episode_number, beat_number, detected_identities_json, "
        "visual_description, speaker, speaker_kind FROM beats"
    ) as cursor:
        beats = await cursor.fetchall()
    for row in beats:
        updates: dict[str, str] = {}
        detected = remap_id_list(
            row["detected_identities_json"], old_name, new_name
        )
        if detected is not None:
            updates["detected_identities_json"] = detected
        description = remap_identity_markers(
            row["visual_description"], old_name, new_name
        )
        if description is not None:
            updates["visual_description"] = description
        if str(row["speaker_kind"] or "character") == "character":
            speaker = str(row["speaker"] or "")
            remapped = remap_identity_id(speaker, old_name, new_name)
            if remapped != speaker:
                updates["speaker"] = remapped
        if updates:
            assignments = ", ".join(f"{column} = ?" for column in updates)
            await db.execute(
                f"UPDATE beats SET {assignments}, updated_at = datetime('now') "
                "WHERE episode_number = ? AND beat_number = ?",
                (*updates.values(), row["episode_number"], row["beat_number"]),
            )

    async with db.execute("SELECT name, owner FROM props") as cursor:
        props = await cursor.fetchall()
    for row in props:
        owner = str(row["owner"] or "")
        remapped = remap_identity_id(owner, old_name, new_name)
        if remapped != owner:
            await db.execute(
                "UPDATE props SET owner = ?, updated_at = datetime('now') "
                "WHERE name = ?",
                (remapped, row["name"]),
            )
    await _cascade_voice_speakers(db, old_name, new_name)


async def _migrate_character(
    db: aiosqlite.Connection,
    old_name: str,
    new_name: str,
) -> None:
    async with db.execute(
        "SELECT aliases_json, identities_json, reference_audio_path, "
        "voice_samples_by_age_group_json FROM characters WHERE name = ?",
        (old_name,),
    ) as cursor:
        row = await cursor.fetchone()
    if row is None:
        return
    aliases = _load_list(row["aliases_json"], field="characters.aliases_json")
    if old_name not in aliases:
        aliases.append(old_name)
    identities = _load_list(
        row["identities_json"], field="characters.identities_json"
    )
    for identity in identities:
        if not isinstance(identity, dict):
            continue
        identity["character_name"] = new_name
        identity_name = str(identity.get("identity_name") or "")
        if identity_name:
            identity["identity_id"] = f"{new_name}_{identity_name}"
        for field in ("reference_audio_path", "portrait_image", "costume_image"):
            identity[field] = remap_character_asset_path(
                identity.get(field, ""), old_name, new_name
            )
        reference_images = identity.get("reference_images", [])
        if isinstance(reference_images, list):
            identity["reference_images"] = [
                remap_character_asset_path(path, old_name, new_name)
                for path in reference_images
            ]
    voice_samples = _load_dict(
        row["voice_samples_by_age_group_json"],
        field="characters.voice_samples_by_age_group_json",
    )
    for sample in voice_samples.values():
        if isinstance(sample, dict) and "path" in sample:
            sample["path"] = remap_character_asset_path(
                sample.get("path", ""), old_name, new_name
            )
    await db.execute(
        "UPDATE characters SET name = ?, aliases_json = ?, identities_json = ?, "
        "reference_audio_path = ?, voice_samples_by_age_group_json = ?, "
        "updated_at = datetime('now') WHERE name = ?",
        (
            new_name,
            json.dumps(aliases, ensure_ascii=False),
            json.dumps(identities, ensure_ascii=False),
            remap_character_asset_path(
                row["reference_audio_path"], old_name, new_name
            ),
            json.dumps(voice_samples, ensure_ascii=False),
            old_name,
        ),
    )
    await _cascade_character_references(db, old_name, new_name)


async def _migrate_simple_asset(
    db: aiosqlite.Connection,
    table: str,
    old_name: str,
    new_name: str,
) -> None:
    async with db.execute(
        f"SELECT aliases_json FROM {table} WHERE name = ?",
        (old_name,),
    ) as cursor:
        row = await cursor.fetchone()
    if row is None:
        return
    aliases = _load_list(row["aliases_json"], field=f"{table}.aliases_json")
    if old_name not in aliases:
        aliases.append(old_name)
    await db.execute(
        f"UPDATE {table} SET name = ?, aliases_json = ?, "
        "updated_at = datetime('now') WHERE name = ?",
        (new_name, json.dumps(aliases, ensure_ascii=False), old_name),
    )
    if table == "scenes":
        await db.execute(
            "UPDATE scenes SET base_scene_id = ?, updated_at = datetime('now') "
            "WHERE base_scene_id = ?",
            (new_name, old_name),
        )


def _update_scene_manifest(
    project_dir: Path,
    old_name: str,
    new_name: str,
    backups: list[tuple[Path, bytes]],
) -> None:
    path = stage_manifest.manifest_path(project_dir, new_name)
    if not path.exists():
        return
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or payload.get("scene_id") == new_name:
        return
    backups.append((path, path.read_bytes()))
    payload["scene_id"] = new_name
    tmp = path.with_suffix(path.suffix + ".migration.tmp")
    tmp.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    os.replace(tmp, path)


async def apply(db: aiosqlite.Connection, project_dir: Path):
    plans = {
        "character": await _name_plan(db, "characters", kind="character"),
        "scene": await _name_plan(db, "scenes", kind="scene"),
        "prop": await _name_plan(db, "props", kind="prop"),
    }
    moved: list[tuple[Path, str, str]] = []
    manifest_backups: list[tuple[Path, bytes]] = []
    roots = {
        "character": project_dir / "assets" / "characters",
        "scene": project_dir / "assets" / "scenes",
        "prop": project_dir / "assets" / "props",
    }
    try:
        for kind, plan in plans.items():
            for old_name, new_name in plan:
                _move_asset_tree(roots[kind], old_name, new_name, moved)
                if kind == "character":
                    await _migrate_character(db, old_name, new_name)
                elif kind == "scene":
                    await _migrate_simple_asset(
                        db, "scenes", old_name, new_name
                    )
                    _update_scene_manifest(
                        project_dir,
                        old_name,
                        new_name,
                        manifest_backups,
                    )
                else:
                    await _migrate_simple_asset(db, "props", old_name, new_name)
    except BaseException:
        for path, content in reversed(manifest_backups):
            path.write_bytes(content)
        _rollback_asset_moves(moved)
        raise

    def rollback_external() -> None:
        for path, content in reversed(manifest_backups):
            path.write_bytes(content)
        _rollback_asset_moves(moved)

    return rollback_external


__all__ = ["VERSION", "apply"]
