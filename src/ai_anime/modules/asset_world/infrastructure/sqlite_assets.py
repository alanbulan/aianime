"""SQLite repositories owned by Asset World."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, List, Optional

from ai_anime.modules.asset_world.application.character_models import (
    CharacterIdentity,
    NovelCharacter,
)
from ai_anime.modules.asset_world.application.prop_models import NovelProp
from ai_anime.modules.asset_world.application.scene_models import NovelScene
from ai_anime.modules.asset_world.domain.asset_names import (
    asset_dir_within,
    move_asset_dir,
    path_safe_asset_name,
)
from ai_anime.shared.infrastructure.project_sqlite_core import console
from ai_anime.shared.utils.identity_refs import (
    remap_character_asset_path,
    remap_default_map,
    remap_id_list,
    remap_identity_id,
    remap_identity_markers,
    remap_keyed_by_identity,
    remap_object_field,
)

class AssetWorldSQLiteRepositoryMixin:
    async def _update_character_field(self, name: str, field: str, value: Any) -> bool:
        try:
            db = await self._ensure_db()
            await db.execute(
                f"UPDATE characters SET {field} = ?, updated_at = datetime('now') WHERE name = ?",
                (value, name),
            )
            await db.commit()
            return True
        except Exception as e:
            console.print(f"[red]更新角色字段失败: {e}[/red]")
            return False

    async def add_character(self, character: NovelCharacter) -> None:
        db = await self._ensure_db()
        await db.execute(
            """INSERT INTO characters (name, aliases_json, role, is_main, gender, age_group,
               body_type, fish_voice_id, description, face_prompt, appearance_details, identities_json,
               reference_audio_path, reference_audio_sha256, reference_audio_updated_at,
               voice_samples_by_age_group_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(name) DO UPDATE SET
               aliases_json=excluded.aliases_json, role=excluded.role,
               is_main=excluded.is_main, gender=excluded.gender,
               age_group=excluded.age_group, body_type=excluded.body_type,
               fish_voice_id=excluded.fish_voice_id, description=excluded.description,
               face_prompt=excluded.face_prompt, appearance_details=excluded.appearance_details,
               identities_json=excluded.identities_json,
               reference_audio_path=excluded.reference_audio_path,
               reference_audio_sha256=excluded.reference_audio_sha256,
               reference_audio_updated_at=excluded.reference_audio_updated_at,
               voice_samples_by_age_group_json=excluded.voice_samples_by_age_group_json,
               updated_at=datetime('now')""",
            (
                character.name,
                json.dumps(character.aliases, ensure_ascii=False),
                character.role,
                1 if character.is_main else 0,
                character.gender,
                character.age_group,
                character.body_type,
                character.fish_voice_id,
                character.description,
                character.face_prompt,
                character.appearance_details,
                character.identities_json,
                character.reference_audio_path,
                character.reference_audio_sha256,
                character.reference_audio_updated_at,
                character.voice_samples_by_age_group_json,
            ),
        )
        await db.commit()
        self._characters[character.name] = character
        updated_alias_index = {k: v for k, v in self._alias_index.items() if v != character.name}
        self._alias_index.clear()
        self._alias_index.update(updated_alias_index)
        for alias in character.aliases:
            self._alias_index[alias] = character.name

    async def update_character(self, name: str, **updates) -> None:
        char = self.get_character(name)
        if not char:
            raise ValueError(f"角色 {name} 不存在")
        for key, value in updates.items():
            if hasattr(char, key):
                setattr(char, key, value)
        if "aliases" in updates:
            remove_keys = [k for k, v in self._alias_index.items() if v == name]
            for key in remove_keys:
                self._alias_index.pop(key, None)
            for alias in char.aliases:
                self._alias_index[alias] = name
        await self.add_character(char)
        console.print(f"[green]已更新角色: {name}[/green]")

    async def delete_all_characters(self) -> int:
        try:
            db = await self._ensure_db()
            cursor = await db.execute("DELETE FROM characters")
            await db.commit()
            self._characters.clear()
            self._alias_index.clear()
            deleted = cursor.rowcount
            console.print(f"[dim]已删除 {deleted} 个旧角色[/dim]")
            return deleted
        except Exception as e:
            console.print(f"[yellow]删除旧角色失败: {e}[/yellow]")
            return 0

    async def rename_character(self, old_name: str, new_name: str) -> None:
        new_name = path_safe_asset_name(new_name, kind="character")
        char = self.get_character(old_name)
        if not char:
            raise ValueError(f"角色 {old_name} 不存在")
        if old_name == new_name:
            return
        if self.get_character(new_name):
            raise ValueError(f"角色 {new_name} 已存在")
        assets_root = Path(self.project_dir) / "assets" / "characters"
        old_asset_dir = asset_dir_within(assets_root, old_name)
        new_asset_dir = asset_dir_within(assets_root, new_name)
        if old_asset_dir is not None and old_asset_dir.exists():
            if new_asset_dir is None:
                raise ValueError(f"Invalid target asset directory: {new_name}")
            if new_asset_dir.exists():
                raise ValueError(
                    f"Target asset directory already exists: {new_asset_dir}"
                )
        db = await self._ensure_db()
        await db.execute("DELETE FROM characters WHERE name = ?", (old_name,))
        identities = char.identities
        for identity in identities:
            identity.character_name = new_name
            identity.identity_id = f"{new_name}_{identity.identity_name}"
            identity.reference_audio_path = remap_character_asset_path(
                identity.reference_audio_path,
                old_name,
                new_name,
            )
            identity.reference_images = [
                remap_character_asset_path(path, old_name, new_name)
                for path in identity.reference_images
            ]
            identity.portrait_image = remap_character_asset_path(
                identity.portrait_image,
                old_name,
                new_name,
            )
            identity.costume_image = remap_character_asset_path(
                identity.costume_image,
                old_name,
                new_name,
            )
        char.identities = identities
        char.reference_audio_path = remap_character_asset_path(
            char.reference_audio_path,
            old_name,
            new_name,
        )
        voice_samples = char.voice_samples_by_age_group
        for sample in voice_samples.values():
            if isinstance(sample, dict) and "path" in sample:
                sample["path"] = remap_character_asset_path(
                    sample["path"],
                    old_name,
                    new_name,
                )
        char.voice_samples_by_age_group = voice_samples
        char.name = new_name
        await self.add_character(char)
        self._characters.pop(old_name, None)
        self._characters[new_name] = char
        new_alias_index = {}
        for key, value in self._alias_index.items():
            new_alias_index[key] = new_name if value == old_name else value
        self._alias_index.clear()
        self._alias_index.update(new_alias_index)
        await self._cascade_character_rename(old_name, new_name)
        move_asset_dir(assets_root, old_name, new_name)
        await self.load_graph_state()
        console.print(f"[green]已重命名角色: {old_name} → {new_name}[/green]")

    async def _cascade_character_rename(self, old_name: str, new_name: str) -> None:
        if not old_name or old_name == new_name:
            return

        db = await self._ensure_db()
        async with db.execute(
            "SELECT number, character_names, identity_ids, "
            "identity_default_map_json, sketch_colors_json, prop_menu_json "
            "FROM episodes"
        ) as cursor:
            episodes = await cursor.fetchall()
        for row in episodes:
            updates: dict[str, str] = {}
            for column, value in (
                (
                    "character_names",
                    remap_id_list(row["character_names"], old_name, new_name),
                ),
                (
                    "identity_ids",
                    remap_id_list(row["identity_ids"], old_name, new_name),
                ),
                (
                    "identity_default_map_json",
                    remap_default_map(
                        row["identity_default_map_json"],
                        old_name,
                        new_name,
                    ),
                ),
                (
                    "sketch_colors_json",
                    remap_keyed_by_identity(
                        row["sketch_colors_json"],
                        old_name,
                        new_name,
                    ),
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
            ):
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
            updates = {}
            detected = remap_id_list(
                row["detected_identities_json"],
                old_name,
                new_name,
            )
            if detected is not None:
                updates["detected_identities_json"] = detected
            description = remap_identity_markers(
                row["visual_description"],
                old_name,
                new_name,
            )
            if description is not None:
                updates["visual_description"] = description
            speaker = str(row["speaker"] or "")
            if str(row["speaker_kind"] or "character") == "character":
                remapped_speaker = remap_identity_id(speaker, old_name, new_name)
                if remapped_speaker != speaker:
                    updates["speaker"] = remapped_speaker
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
            remapped_owner = remap_identity_id(owner, old_name, new_name)
            if remapped_owner != owner:
                await db.execute(
                    "UPDATE props SET owner = ?, updated_at = datetime('now') "
                    "WHERE name = ?",
                    (remapped_owner, row["name"]),
                )

        await self._cascade_voice_record_speaker(db, old_name, new_name)
        await db.commit()

    @staticmethod
    async def _cascade_voice_record_speaker(db, old_name: str, new_name: str) -> None:
        table = "seedance2_voice_audio_records"
        async with db.execute(
            f"SELECT episode_number, beat_number, speaker FROM {table}"
        ) as cursor:
            rows = await cursor.fetchall()
        for row in rows:
            speaker = str(row["speaker"] or "")
            remapped = remap_identity_id(speaker, old_name, new_name)
            if remapped == speaker:
                continue
            key = (row["episode_number"], row["beat_number"])
            async with db.execute(
                f"SELECT 1 FROM {table} WHERE episode_number = ? "
                "AND beat_number = ? AND speaker = ?",
                (*key, remapped),
            ) as cursor:
                occupied = await cursor.fetchone() is not None
            if occupied:
                await db.execute(
                    f"DELETE FROM {table} WHERE episode_number = ? "
                    "AND beat_number = ? AND speaker = ?",
                    (*key, speaker),
                )
            else:
                await db.execute(
                    f"UPDATE {table} SET speaker = ? WHERE episode_number = ? "
                    "AND beat_number = ? AND speaker = ?",
                    (remapped, *key, speaker),
                )

    async def delete_character(self, name: str) -> None:
        char = self.get_character(name)
        if not char:
            console.print(f"[yellow]角色 {name} 不存在[/yellow]")
            return
        db = await self._ensure_db()
        await db.execute("DELETE FROM characters WHERE name = ?", (name,))
        await db.commit()
        self._characters.pop(name, None)
        remove_keys = [k for k, v in self._alias_index.items() if v == name]
        for key in remove_keys:
            self._alias_index.pop(key, None)
        console.print(f"[green]已删除角色: {name}[/green]")

    @staticmethod
    def _normalize_alias_lookup(value: str) -> str:
        """统一别名查找键，降低空格/大小写差异导致的失配。"""
        return " ".join((value or "").replace("\u3000", " ").strip().lower().split())

    async def add_scene(self, scene: NovelScene) -> None:
        """添加或更新场景。"""
        db = await self._ensure_db()
        await db.execute(
            """INSERT INTO scenes (name, aliases_json, scene_type,
               base_scene_id, variant_id, time_of_day,
               environment_prompt, variant_prompt, description, spatial_layout_image, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(name) DO UPDATE SET
               aliases_json=excluded.aliases_json,
               scene_type=excluded.scene_type,
               base_scene_id=excluded.base_scene_id,
               variant_id=excluded.variant_id,
               time_of_day=excluded.time_of_day,
               environment_prompt=excluded.environment_prompt,
               variant_prompt=excluded.variant_prompt,
               description=excluded.description,
               spatial_layout_image=excluded.spatial_layout_image,
               notes=excluded.notes,
               updated_at=datetime('now')""",
            (
                scene.name,
                json.dumps(scene.aliases, ensure_ascii=False),
                scene.scene_type,
                scene.base_scene_id,
                scene.variant_id,
                scene.time_of_day,
                scene.environment_prompt,
                scene.variant_prompt,
                scene.description,
                scene.spatial_layout_image,
                scene.notes,
            ),
        )
        await db.commit()

    async def get_scene(self, name: str) -> Optional[NovelScene]:
        """获取场景（支持别名查找）。"""
        db = await self._ensure_db()
        async with db.execute("SELECT * FROM scenes WHERE name = ?", (name,)) as cursor:
            row = await cursor.fetchone()
        if row:
            return self._row_to_scene(row)

        lookup = self._normalize_alias_lookup(name)
        async with db.execute("SELECT * FROM scenes") as cursor:
            rows = await cursor.fetchall()
        for row in rows:
            aliases = json.loads(row["aliases_json"] or "[]")
            if any(self._normalize_alias_lookup(alias) == lookup for alias in aliases):
                return self._row_to_scene(row)
        return None

    async def list_scenes(self) -> List[NovelScene]:
        """列出所有场景。"""
        db = await self._ensure_db()
        async with db.execute("SELECT * FROM scenes ORDER BY name") as cursor:
            rows = await cursor.fetchall()
        return [self._row_to_scene(row) for row in rows]

    async def update_scene(self, name: str, **updates) -> bool:
        """更新场景字段。"""
        allowed = {
            "aliases",
            "scene_type",
            "base_scene_id",
            "variant_id",
            "time_of_day",
            "environment_prompt",
            "variant_prompt",
            "description",
            "spatial_layout_image",
            "notes",
        }
        set_parts = []
        values = []
        for key, value in updates.items():
            if key not in allowed:
                continue
            if key == "aliases":
                set_parts.append("aliases_json = ?")
                values.append(json.dumps(value, ensure_ascii=False))
            else:
                set_parts.append(f"{key} = ?")
                values.append(value)
        if not set_parts:
            return False
        set_parts.append("updated_at = datetime('now')")
        values.append(name)
        db = await self._ensure_db()
        cursor = await db.execute(
            f"UPDATE scenes SET {', '.join(set_parts)} WHERE name = ?",
            values,
        )
        await db.commit()
        return (cursor.rowcount or 0) > 0

    async def rename_scene(self, old_name: str, new_name: str) -> bool:
        """重命名场景记录。资源目录迁移由调用方处理。"""
        old_name = str(old_name or "").strip()
        new_name = path_safe_asset_name(str(new_name or "").strip())
        if not old_name or not new_name or old_name == new_name:
            return False
        if await self.get_scene(new_name) is not None:
            return False
        db = await self._ensure_db()
        cursor = await db.execute(
            "UPDATE scenes SET name = ?, updated_at = datetime('now') WHERE name = ?",
            (new_name, old_name),
        )
        await db.commit()
        return (cursor.rowcount or 0) > 0

    async def delete_scene(self, name: str) -> bool:
        """删除场景。"""
        db = await self._ensure_db()
        cursor = await db.execute("DELETE FROM scenes WHERE name = ?", (name,))
        await db.commit()
        return (cursor.rowcount or 0) > 0

    @staticmethod
    def _row_to_scene(row) -> NovelScene:
        return NovelScene(
            name=row["name"],
            aliases=json.loads(row["aliases_json"] or "[]"),
            scene_type=row["scene_type"] or "interior",
            base_scene_id=(row["base_scene_id"] if "base_scene_id" in row.keys() else "") or "",
            variant_id=(row["variant_id"] if "variant_id" in row.keys() else "") or "",
            time_of_day=(row["time_of_day"] if "time_of_day" in row.keys() else "") or "",
            environment_prompt=row["environment_prompt"] or "",
            variant_prompt=(row["variant_prompt"] if "variant_prompt" in row.keys() else "") or "",
            description=row["description"] or "",
            spatial_layout_image=(
                row["spatial_layout_image"] if "spatial_layout_image" in row.keys() else ""
            )
            or "",
            notes=row["notes"] or "",
            updated_at=row["updated_at"] if "updated_at" in row.keys() else "",
        )

    async def add_prop(self, prop: NovelProp) -> None:
        """添加或更新道具。"""
        db = await self._ensure_db()
        await db.execute(
            """INSERT INTO props (name, aliases_json, prop_type, visual_prompt,
               description, owner, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(name) DO UPDATE SET
               aliases_json=excluded.aliases_json,
               prop_type=excluded.prop_type,
               visual_prompt=excluded.visual_prompt,
               description=excluded.description,
               owner=excluded.owner,
               notes=excluded.notes,
               updated_at=datetime('now')""",
            (
                prop.name,
                json.dumps(prop.aliases, ensure_ascii=False),
                prop.prop_type,
                prop.visual_prompt,
                prop.description,
                prop.owner,
                prop.notes,
            ),
        )
        await db.commit()
        self._props[prop.name] = prop

    async def get_prop(self, name: str) -> Optional[NovelProp]:
        """获取道具（支持别名查找）。"""
        db = await self._ensure_db()
        async with db.execute("SELECT * FROM props WHERE name = ?", (name,)) as cursor:
            row = await cursor.fetchone()
        if row:
            return self._row_to_prop(row)

        lookup = self._normalize_alias_lookup(name)
        async with db.execute("SELECT * FROM props") as cursor:
            rows = await cursor.fetchall()
        for row in rows:
            aliases = json.loads(row["aliases_json"] or "[]")
            if any(self._normalize_alias_lookup(alias) == lookup for alias in aliases):
                return self._row_to_prop(row)
        return None

    async def list_props(self) -> List[NovelProp]:
        """列出所有道具。"""
        db = await self._ensure_db()
        async with db.execute("SELECT * FROM props ORDER BY name") as cursor:
            rows = await cursor.fetchall()
        return [self._row_to_prop(row) for row in rows]

    async def update_prop(self, name: str, **updates) -> bool:
        """更新道具字段。"""
        allowed = {
            "aliases",
            "prop_type",
            "visual_prompt",
            "description",
            "owner",
            "notes",
        }
        set_parts = []
        values = []
        for key, value in updates.items():
            if key not in allowed:
                continue
            if key == "aliases":
                set_parts.append("aliases_json = ?")
                values.append(json.dumps(value, ensure_ascii=False))
            else:
                set_parts.append(f"{key} = ?")
                values.append(value)
        if not set_parts:
            return False
        set_parts.append("updated_at = datetime('now')")
        values.append(name)
        db = await self._ensure_db()
        cursor = await db.execute(
            f"UPDATE props SET {', '.join(set_parts)} WHERE name = ?",
            values,
        )
        await db.commit()
        if (cursor.rowcount or 0) > 0 and name in self._props:
            prop = self._props[name]
            for key, value in updates.items():
                if key == "aliases":
                    prop.aliases = value
                elif hasattr(prop, key):
                    setattr(prop, key, value)
        return (cursor.rowcount or 0) > 0

    async def rename_prop(self, old_name: str, new_name: str) -> bool:
        """重命名道具记录。资源目录迁移由调用方处理。"""
        old_name = str(old_name or "").strip()
        new_name = path_safe_asset_name(str(new_name or "").strip())
        if not old_name or not new_name or old_name == new_name:
            return False
        if await self.get_prop(new_name) is not None:
            return False
        db = await self._ensure_db()
        cursor = await db.execute(
            "UPDATE props SET name = ?, updated_at = datetime('now') WHERE name = ?",
            (new_name, old_name),
        )
        await db.commit()
        if (cursor.rowcount or 0) > 0:
            prop = self._props.pop(old_name, None)
            if prop is not None:
                prop.name = new_name
                self._props[new_name] = prop
        return (cursor.rowcount or 0) > 0

    async def delete_prop(self, name: str) -> bool:
        """删除道具。"""
        db = await self._ensure_db()
        cursor = await db.execute("DELETE FROM props WHERE name = ?", (name,))
        await db.commit()
        self._props.pop(name, None)
        return (cursor.rowcount or 0) > 0

    @staticmethod
    def _row_to_prop(row) -> NovelProp:
        return NovelProp(
            name=row["name"],
            aliases=json.loads(row["aliases_json"] or "[]"),
            prop_type=row["prop_type"] or "object",
            visual_prompt=row["visual_prompt"] or "",
            description=row["description"] or "",
            owner=row["owner"] or "",
            notes=row["notes"] or "",
            updated_at=row["updated_at"] if "updated_at" in row.keys() else "",
        )

    async def add_character_identity(
        self, character_name: str, identity: CharacterIdentity
    ) -> None:
        char = self.get_character(character_name)
        if not char:
            raise ValueError(f"角色 {character_name} 不存在")
        identity.character_name = char.name
        if not identity.identity_id:
            identity.identity_id = f"{char.name}_{identity.identity_name}"
        for existing in char.identities:
            if existing.identity_id == identity.identity_id:
                raise ValueError(f"身份 {identity.identity_id} 已存在")
        identities = char.identities
        identities.append(identity)
        char.identities = identities
        await self._update_character_field(char.name, "identities_json", char.identities_json)
        console.print(f"[green]已为 {char.name} 添加身份: {identity.identity_name}[/green]")

    async def _cascade_identity_change(self, old_id: str, new_id: str | None = None) -> None:
        for ep in self._episodes.values():
            ids = ep.identity_ids
            if old_id in ids:
                if new_id:
                    ids = [new_id if x == old_id else x for x in ids]
                else:
                    ids = [x for x in ids if x != old_id]
                await self.update_episode(ep.number, identity_ids=ids)

    async def update_character_identity(
        self,
        character_name: str,
        identity_id: str,
        **updates,
    ) -> None:
        char = self.get_character(character_name)
        if not char:
            raise ValueError(f"角色 {character_name} 不存在")
        identities = char.identities
        target_identity = None
        for identity in identities:
            if identity.identity_id == identity_id:
                target_identity = identity
                break
        if not target_identity:
            raise ValueError(f"身份 {identity_id} 不存在")
        for key, value in updates.items():
            if hasattr(target_identity, key):
                setattr(target_identity, key, value)
        if "identity_name" in updates:
            import re

            new_iname = updates["identity_name"]
            old_iname = identity_id.split("_", 1)[-1] if "_" in identity_id else identity_id
            target_identity.identity_id = f"{char.name}_{new_iname}"
            old_safe = re.sub(r'[/\\:*?"<>|]', "_", old_iname)
            new_safe = re.sub(r'[/\\:*?"<>|]', "_", new_iname)
            old_img = (
                Path(self.project_dir)
                / "assets"
                / "characters"
                / char.name
                / "identities"
                / f"{old_safe}.png"
            )
            new_img = (
                Path(self.project_dir)
                / "assets"
                / "characters"
                / char.name
                / "identities"
                / f"{new_safe}.png"
            )
            if old_img.exists() and not new_img.exists():
                old_img.replace(new_img)
        char.identities = identities
        if "identity_name" in updates:
            old_id = identity_id
            new_id = target_identity.identity_id
            if old_id != new_id:
                await self._cascade_identity_change(old_id, new_id)
        await self._update_character_field(char.name, "identities_json", char.identities_json)
        console.print(f"[green]已更新 {char.name} 的身份: {target_identity.identity_id}[/green]")

    async def delete_character_identity(self, character_name: str, identity_id: str) -> None:
        char = self.get_character(character_name)
        if not char:
            raise ValueError(f"角色 {character_name} 不存在")
        identities = char.identities
        target_identity = None
        for i, identity in enumerate(identities):
            if identity.identity_id == identity_id:
                target_identity = identities.pop(i)
                break
        if not target_identity:
            raise ValueError(f"身份 {identity_id} 不存在")
        char.identities = identities
        await self._cascade_identity_change(identity_id, None)
        await self._update_character_field(char.name, "identities_json", char.identities_json)
        console.print(f"[green]已删除 {char.name} 的身份: {identity_id}[/green]")

    async def list_characters(self) -> List[NovelCharacter]:
        db = await self._ensure_db()
        async with db.execute("SELECT * FROM characters") as cursor:
            rows = await cursor.fetchall()

        return [
            NovelCharacter(
                name=row["name"],
                aliases=json.loads(row["aliases_json"] or "[]"),
                role=row["role"] or "",
                is_main=bool(row["is_main"]),
                gender=row["gender"] or "",
                age_group=row["age_group"] if "age_group" in row.keys() else "youth",
                body_type=row["body_type"] or "",
                fish_voice_id=row["fish_voice_id"] if "fish_voice_id" in row.keys() else "",
                description=row["description"] or "",
                face_prompt=row["face_prompt"] or "",
                appearance_details=row["appearance_details"] or "",
                identities_json=row["identities_json"] or "[]",
                reference_audio_path=(
                    row["reference_audio_path"] if "reference_audio_path" in row.keys() else ""
                )
                or "",
                reference_audio_sha256=(
                    row["reference_audio_sha256"] if "reference_audio_sha256" in row.keys() else ""
                )
                or "",
                reference_audio_updated_at=(
                    row["reference_audio_updated_at"]
                    if "reference_audio_updated_at" in row.keys()
                    else ""
                )
                or "",
                voice_samples_by_age_group_json=(
                    row["voice_samples_by_age_group_json"]
                    if "voice_samples_by_age_group_json" in row.keys()
                    else "{}"
                )
                or "{}",
                updated_at=row["updated_at"] if "updated_at" in row.keys() else "",
            )
            for row in rows
        ]

    async def get_character_from_graph(self, name: str) -> Optional[NovelCharacter]:
        characters = await self.list_characters()
        for character in characters:
            if character.name == name or name in character.aliases:
                return character
        return None

    async def delete_all_scenes(self) -> int:
        """删除所有场景。"""
        db = await self._ensure_db()
        cursor = await db.execute("DELETE FROM scenes")
        await db.commit()
        return cursor.rowcount or 0

    async def delete_all_props(self) -> int:
        """删除所有道具。"""
        db = await self._ensure_db()
        cursor = await db.execute("DELETE FROM props")
        await db.commit()
        self._props.clear()
        return cursor.rowcount or 0


__all__ = ["AssetWorldSQLiteRepositoryMixin"]
