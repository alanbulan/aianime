"""SQLite repositories owned by Narrative Planning."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from ai_anime.modules.narrative_planning.application.beat_models import (
    NovelVisualBeat,
    sync_beat_asset_refs,
)
from ai_anime.modules.narrative_planning.application.episode_planning_models import (
    NovelEpisode,
)
from ai_anime.modules.production.public import (
    normalize_detected_identities,
    normalize_detected_props,
)
from ai_anime.shared.infrastructure.project_sqlite_core import (
    StoreClosedError,
    console,
)


class NarrativeSQLiteRepositoryMixin:
    def save_novel_content(self, content: str) -> None:
        novel_path = Path(self.project_dir) / "novel.txt"
        novel_path.write_text(content, encoding="utf-8")

    def load_novel_content(self) -> Optional[str]:
        novel_path = Path(self.project_dir) / "novel.txt"
        if novel_path.exists():
            return novel_path.read_text(encoding="utf-8")
        return None

    async def save_episode_content(self, ep_num: int, content: str) -> None:
        db = await self._ensure_db()
        await db.execute(
            "INSERT INTO episodes (number, raw_content) VALUES (?, ?) "
            "ON CONFLICT(number) DO UPDATE SET raw_content = excluded.raw_content, "
            "updated_at = datetime('now')",
            (ep_num, content),
        )
        await db.commit()

    async def load_episode_content(self, ep_num: int) -> Optional[str]:
        db = await self._ensure_db()
        async with db.execute(
            "SELECT raw_content FROM episodes WHERE number = ?",
            (ep_num,),
        ) as cursor:
            row = await cursor.fetchone()
            if row and row[0]:
                return row[0]
        return None

    async def save_adapted_content(self, ep_num: int, content: str) -> None:
        db = await self._ensure_db()
        cursor = await db.execute(
            "UPDATE episodes SET adapted_content = ?, updated_at = datetime('now') "
            "WHERE number = ?",
            (content, ep_num),
        )
        if cursor.rowcount == 0:
            raise ValueError(f"剧集 {ep_num} 不存在，无法保存改写稿")
        await db.commit()
        episode = self._episodes.get(ep_num)
        if episode is not None:
            episode.adapted_content = content

    async def load_adapted_content(self, ep_num: int) -> str:
        db = await self._ensure_db()
        async with db.execute(
            "SELECT adapted_content FROM episodes WHERE number = ?",
            (ep_num,),
        ) as cursor:
            row = await cursor.fetchone()
            if row and row[0]:
                return row[0]
        return ""

    async def load_working_content(self, ep_num: int) -> str:
        db = await self._ensure_db()
        async with db.execute(
            """
            SELECT
                CASE
                    WHEN adapted_content IS NOT NULL AND trim(adapted_content) != ''
                    THEN adapted_content
                    ELSE raw_content
                END AS working_content
            FROM episodes
            WHERE number = ?
            """,
            (ep_num,),
        ) as cursor:
            row = await cursor.fetchone()
            if row and row["working_content"]:
                return row["working_content"]
        return ""

    async def get_episode_content_count(self) -> int:
        db = await self._ensure_db()
        async with db.execute(
            "SELECT COUNT(*) FROM episodes WHERE raw_content != '' AND raw_content IS NOT NULL"
        ) as cursor:
            row = await cursor.fetchone()
            return row[0] if row else 0

    async def clear_episode_contents(self) -> int:
        db = await self._ensure_db()
        cursor = await db.execute(
            "UPDATE episodes SET raw_content = '', updated_at = datetime('now') "
            "WHERE raw_content != '' AND raw_content IS NOT NULL"
        )
        await db.commit()
        return cursor.rowcount

    async def add_episodes(self, episodes: List[NovelEpisode]) -> None:
        db = await self._ensure_db()
        for ep in episodes:
            await db.execute(
                """INSERT INTO episodes (number, title, chapter_start, chapter_end,
                   raw_content, beat_source_text, content_summary, main_conflict, cliffhanger, key_events,
                   character_names, identity_ids, event_ids, scene_menu_json, prop_menu_json,
                   identity_default_map_json, sketch_colors_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(number) DO UPDATE SET
                   title=excluded.title, chapter_start=excluded.chapter_start,
                   chapter_end=excluded.chapter_end, raw_content=excluded.raw_content,
                   beat_source_text=excluded.beat_source_text,
                   content_summary=excluded.content_summary,
                   main_conflict=excluded.main_conflict, cliffhanger=excluded.cliffhanger,
                   key_events=excluded.key_events, character_names=excluded.character_names,
                   identity_ids=excluded.identity_ids, event_ids=excluded.event_ids,
                   scene_menu_json=excluded.scene_menu_json, prop_menu_json=excluded.prop_menu_json,
                   identity_default_map_json=excluded.identity_default_map_json,
                   sketch_colors_json=excluded.sketch_colors_json,
                   updated_at=datetime('now')""",
                (
                    ep.number,
                    ep.title,
                    ep.chapter_start,
                    ep.chapter_end,
                    ep.raw_content,
                    ep.beat_source_text,
                    ep.content_summary,
                    ep.main_conflict,
                    ep.cliffhanger,
                    json.dumps(ep.key_events, ensure_ascii=False),
                    json.dumps(ep.character_names, ensure_ascii=False),
                    json.dumps(ep.identity_ids, ensure_ascii=False),
                    json.dumps(ep.event_ids, ensure_ascii=False),
                    ep.scene_menu_json,
                    ep.prop_menu_json,
                    ep.identity_default_map_json,
                    ep.sketch_colors_json,
                ),
            )
        await db.commit()

    async def add_episode(self, episode: NovelEpisode) -> None:
        await self.add_episodes([episode])
        self._episodes[episode.number] = episode

    async def update_episode(self, episode_number: int, **updates) -> None:
        episode = self.get_episode(episode_number)
        if not episode:
            raise ValueError(f"剧集 {episode_number} 不存在")
        old_number = episode.number
        for key, value in updates.items():
            if key == "scene_menu":
                episode.scene_menu = value or []
            elif key == "prop_menu":
                episode.prop_menu = value or []
            elif hasattr(episode, key):
                setattr(episode, key, value)
        new_number = updates.get("number", old_number)
        if new_number != old_number:
            self._episodes.pop(old_number, None)
            self._episodes[new_number] = episode
        await self.add_episodes([episode])
        console.print(f"[green]已更新剧集: 第{episode.number}集[/green]")

    async def delete_all_episodes(self) -> int:
        try:
            db = await self._ensure_db()
            cursor = await db.execute("DELETE FROM episodes")
            await db.commit()
            self._episodes.clear()
            deleted = cursor.rowcount
            console.print(f"[dim]已删除 {deleted} 个旧剧集[/dim]")
            return deleted
        except Exception as e:
            console.print(f"[yellow]删除旧剧集失败: {e}[/yellow]")
            return 0

    async def delete_episodes_by_numbers(self, episode_numbers: set[int] | list[int]) -> int:
        """按集数删除剧集。"""
        numbers = sorted({int(num) for num in episode_numbers if int(num) > 0})
        if not numbers:
            return 0
        db = await self._ensure_db()
        placeholders = ",".join("?" for _ in numbers)
        cursor = await db.execute(
            f"DELETE FROM episodes WHERE number IN ({placeholders})",
            numbers,
        )
        await db.commit()
        for number in numbers:
            self._episodes.pop(number, None)
        return cursor.rowcount or 0

    async def list_episodes(self) -> List[NovelEpisode]:
        db = await self._ensure_db()
        async with db.execute("SELECT * FROM episodes ORDER BY number") as cursor:
            rows = await cursor.fetchall()

        return [
            NovelEpisode(
                number=row["number"],
                title=row["title"] or "",
                chapter_start=row["chapter_start"] or 0,
                chapter_end=row["chapter_end"] or 0,
                raw_content=row["raw_content"] or "",
                adapted_content=row["adapted_content"] or "",
                beat_source_text=row["beat_source_text"] or "",
                content_summary=row["content_summary"] or "",
                main_conflict=row["main_conflict"] or "",
                cliffhanger=row["cliffhanger"] or "",
                key_events=json.loads(row["key_events"] or "[]"),
                character_names=json.loads(row["character_names"] or "[]"),
                identity_ids=json.loads(row["identity_ids"] or "[]"),
                event_ids=json.loads(row["event_ids"] or "[]"),
                scene_menu_json=row["scene_menu_json"] if "scene_menu_json" in row.keys() else "[]",
                prop_menu_json=row["prop_menu_json"] if "prop_menu_json" in row.keys() else "[]",
                identity_default_map_json=(
                    row["identity_default_map_json"]
                    if "identity_default_map_json" in row.keys()
                    else "{}"
                ),
                sketch_colors_json=row["sketch_colors_json"] or "{}",
                updated_at=row["updated_at"] if "updated_at" in row.keys() else "",
            )
            for row in rows
        ]

    async def get_episode_from_graph(self, number: int) -> Optional[NovelEpisode]:
        db = await self._ensure_db()
        async with db.execute("SELECT * FROM episodes WHERE number = ?", (number,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            return NovelEpisode(
                number=row["number"],
                title=row["title"] or "",
                chapter_start=row["chapter_start"] or 0,
                chapter_end=row["chapter_end"] or 0,
                raw_content=row["raw_content"] or "",
                adapted_content=row["adapted_content"] or "",
                beat_source_text=row["beat_source_text"] or "",
                content_summary=row["content_summary"] or "",
                main_conflict=row["main_conflict"] or "",
                cliffhanger=row["cliffhanger"] or "",
                key_events=json.loads(row["key_events"] or "[]"),
                character_names=json.loads(row["character_names"] or "[]"),
                identity_ids=json.loads(row["identity_ids"] or "[]"),
                event_ids=json.loads(row["event_ids"] or "[]"),
                scene_menu_json=row["scene_menu_json"] if "scene_menu_json" in row.keys() else "[]",
                prop_menu_json=row["prop_menu_json"] if "prop_menu_json" in row.keys() else "[]",
                identity_default_map_json=(
                    row["identity_default_map_json"]
                    if "identity_default_map_json" in row.keys()
                    else "{}"
                ),
                sketch_colors_json=row["sketch_colors_json"] or "{}",
                updated_at=row["updated_at"] if "updated_at" in row.keys() else "",
            )

    def get_sketch_colors(self, episode_number: int) -> dict:
        episode = self.get_episode(episode_number)
        if not episode:
            return {}
        try:
            return json.loads(episode.sketch_colors_json or "{}")
        except (json.JSONDecodeError, TypeError):
            return {}

    async def set_sketch_colors(self, episode_number: int, colors: dict) -> None:
        db = await self._ensure_db()
        colors_json = json.dumps(colors, ensure_ascii=False)
        await db.execute(
            "UPDATE episodes SET sketch_colors_json = ?, updated_at = datetime('now') "
            "WHERE number = ?",
            (colors_json, episode_number),
        )
        await db.commit()
        episode = self._episodes.get(episode_number)
        if episode:
            episode.sketch_colors_json = colors_json

    @staticmethod
    def _row_to_visual_beat(row) -> NovelVisualBeat:
        return NovelVisualBeat(
            beat_number=row["beat_number"],
            episode_number=row["episode_number"],
            narration=row["narration"] or "",
            visual_description=row["visual_description"] or "",
            detected_identities_json=row["detected_identities_json"] or "[]",
            detected_props_json=(
                row["detected_props_json"] if "detected_props_json" in row.keys() else "[]"
            )
            or "[]",
            scene_ref_json=row["scene_ref_json"] if "scene_ref_json" in row.keys() else "",
            audio_type=row["audio_type"] or "narration",
            speaker=row["speaker"] or "",
            speaker_kind=row["speaker_kind"] if "speaker_kind" in row.keys() else "character",
            video_mode=row["video_mode"] if "video_mode" in row.keys() else "first_frame",
            video_prompt=row["video_prompt"] if "video_prompt" in row.keys() else "",
            keyframe_prompt=row["keyframe_prompt"] if "keyframe_prompt" in row.keys() else "",
            seedance2_config_json=(
                row["seedance2_config_json"] if "seedance2_config_json" in row.keys() else "{}"
            ),
            time_of_day=row["time_of_day"] if "time_of_day" in row.keys() else "",
            shot_order=row["shot_order"] if "shot_order" in row.keys() else None,
            duration_seconds=row["duration_seconds"] if "duration_seconds" in row.keys() else None,
            is_manual_shot=(
                bool(row["is_manual_shot"])
                if "is_manual_shot" in row.keys() and row["is_manual_shot"] is not None
                else False
            ),
        )

    async def list_visual_beats(self) -> List[NovelVisualBeat]:
        db = await self._ensure_db()
        async with db.execute("SELECT * FROM beats ORDER BY episode_number, beat_number") as cursor:
            rows = await cursor.fetchall()
        return [self._row_to_visual_beat(row) for row in rows]

    async def get_beats_for_episode(self, number: int) -> List[NovelVisualBeat]:
        db = await self._ensure_db()
        async with db.execute(
            "SELECT * FROM beats WHERE episode_number = ? ORDER BY beat_number",
            (number,),
        ) as cursor:
            rows = await cursor.fetchall()
        return [self._row_to_visual_beat(row) for row in rows]

    async def get_beats_as_dicts(self, episode_number: int) -> List[Dict[str, Any]]:
        beats = await self.get_beats_for_episode(episode_number)
        result = []

        def _order_key(b):
            order = getattr(b, "shot_order", None)
            primary = int(order) if order is not None else int(b.beat_number) * 10
            return (primary, int(b.beat_number))

        for b in sorted(beats, key=_order_key):
            result.append(
                {
                    "beat_number": b.beat_number,
                    "narration_segment": b.narration,
                    "visual_description": b.visual_description,
                    "scene_ref": (
                        b.scene_ref.model_dump() if getattr(b, "scene_ref", None) else None
                    ),
                    "estimated_duration": len(b.narration or "") / 4.0,
                    "audio_type": b.audio_type,
                    "speaker": b.speaker,
                    "speaker_kind": getattr(b, "speaker_kind", "character"),
                    "video_mode": getattr(b, "video_mode", "first_frame"),
                    "video_prompt": getattr(b, "video_prompt", ""),
                    "keyframe_prompt": getattr(b, "keyframe_prompt", ""),
                    "seedance2_config_json": getattr(b, "seedance2_config_json", "{}"),
                    "detected_identities": normalize_detected_identities(
                        json.loads(b.detected_identities_json or "[]")
                    ),
                    "detected_props": normalize_detected_props(
                        json.loads(getattr(b, "detected_props_json", "[]") or "[]")
                    ),
                    "time_of_day": getattr(b, "time_of_day", ""),
                    "shot_order": getattr(b, "shot_order", None),
                    "duration_seconds": getattr(b, "duration_seconds", None),
                    "is_manual_shot": bool(getattr(b, "is_manual_shot", False)),
                }
            )
        return result

    async def get_script_as_dict(self, episode_number: int) -> Optional[Dict]:
        episode = self.get_episode(episode_number)
        if not episode:
            episode = await self.get_episode_from_graph(episode_number)
        if not episode:
            return None

        beats = await self.get_beats_as_dicts(episode_number)
        if not beats:
            return None

        return {
            "episode_number": episode_number,
            "title": episode.title,
            "beats": beats,
            "scene_menu": [item.model_dump() for item in (episode.scene_menu or [])],
            "prop_menu": [item.model_dump() for item in (episode.prop_menu or [])],
            "sketch_colors": self.get_sketch_colors(episode_number),
        }

    async def update_beat_asset(
        self,
        episode_number: int,
        beat_number: int | None = None,
        narration_segment: str | None = None,
        visual_description: str | None = None,
        audio_type: str | None = None,
        speaker: str | None = None,
        detected_identities: list | None = None,
        detected_props: list | None = None,
        scene_ref: dict | None = None,
        video_mode: str | None = None,
        video_prompt: str | None = None,
        keyframe_prompt: str | None = None,
        seedance2_config_json: str | None = None,
        time_of_day: str | None = None,
        shot_order: int | None = None,
        duration_seconds: float | None = None,
        is_manual_shot: bool | None = None,
    ) -> bool:
        bn = beat_number
        if bn is None:
            return False

        properties: dict[str, Any] = {}
        if narration_segment is not None:
            properties["narration"] = narration_segment
        if visual_description is not None:
            properties["visual_description"] = visual_description
        if audio_type is not None:
            properties["audio_type"] = audio_type
        if speaker is not None:
            properties["speaker"] = speaker
        if detected_identities is not None:
            properties["detected_identities_json"] = json.dumps(
                normalize_detected_identities(detected_identities),
                ensure_ascii=False,
            )
        if detected_props is not None:
            properties["detected_props_json"] = json.dumps(
                normalize_detected_props(detected_props),
                ensure_ascii=False,
            )
        if video_mode is not None:
            properties["video_mode"] = video_mode
        if video_prompt is not None:
            properties["video_prompt"] = video_prompt
        if keyframe_prompt is not None:
            properties["keyframe_prompt"] = keyframe_prompt
        if seedance2_config_json is not None:
            properties["seedance2_config_json"] = str(seedance2_config_json or "{}")
        if time_of_day is not None:
            properties["time_of_day"] = time_of_day
        if shot_order is not None:
            properties["shot_order"] = int(shot_order)
        if duration_seconds is not None:
            properties["duration_seconds"] = float(duration_seconds)
        if is_manual_shot is not None:
            properties["is_manual_shot"] = 1 if is_manual_shot else 0

        if scene_ref is not None:
            beat_payload = {"scene_ref": scene_ref}
            sync_beat_asset_refs(beat_payload)
            properties["scene_ref_json"] = (
                json.dumps(beat_payload.get("scene_ref"), ensure_ascii=False)
                if beat_payload.get("scene_ref")
                else ""
            )

        if not properties:
            return False

        try:
            db = await self._ensure_db()
            set_parts = [f"{key} = ?" for key in properties]
            set_parts.append("updated_at = datetime('now')")
            values = list(properties.values()) + [episode_number, bn]
            await db.execute(
                f"UPDATE beats SET {', '.join(set_parts)} "
                f"WHERE episode_number = ? AND beat_number = ?",
                values,
            )
            await db.commit()
            return True
        except Exception as e:
            console.print(f"[red]更新 Beat 资源字段失败: {e}[/red]")
            return False

    async def add_visual_beats(self, beats: List[NovelVisualBeat]) -> None:
        """添加视觉节拍到 SQLite。"""
        db = await self._ensure_db()
        for b in beats:
            await db.execute(
                """INSERT INTO beats (episode_number, beat_number, narration, visual_description,
                   detected_identities_json, detected_props_json, scene_ref_json,
                   audio_type, speaker, speaker_kind, time_of_day,
                   video_mode, video_prompt, keyframe_prompt,
                   shot_order, duration_seconds, is_manual_shot)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(episode_number, beat_number) DO UPDATE SET
                   narration=excluded.narration, visual_description=excluded.visual_description,
                   detected_identities_json=excluded.detected_identities_json,
                   detected_props_json=excluded.detected_props_json,
                   scene_ref_json=excluded.scene_ref_json,
                   audio_type=excluded.audio_type, speaker=excluded.speaker,
                   speaker_kind=excluded.speaker_kind,
                   time_of_day=excluded.time_of_day,
                   video_mode=excluded.video_mode,
                   video_prompt=excluded.video_prompt,
                   keyframe_prompt=excluded.keyframe_prompt,
                   shot_order=excluded.shot_order,
                   duration_seconds=excluded.duration_seconds,
                   is_manual_shot=excluded.is_manual_shot,
                   updated_at=datetime('now')""",
                (
                    b.episode_number,
                    b.beat_number,
                    b.narration,
                    b.visual_description,
                    b.detected_identities_json,
                    getattr(b, "detected_props_json", "[]") or "[]",
                    getattr(b, "scene_ref_json", "") or "",
                    b.audio_type,
                    b.speaker,
                    getattr(b, "speaker_kind", "character"),
                    getattr(b, "time_of_day", ""),
                    getattr(b, "video_mode", "first_frame"),
                    getattr(b, "video_prompt", ""),
                    getattr(b, "keyframe_prompt", ""),
                    getattr(b, "shot_order", None),
                    getattr(b, "duration_seconds", None),
                    1 if getattr(b, "is_manual_shot", False) else 0,
                ),
            )
        await db.commit()

    async def delete_manual_beat(self, episode_number: int, beat_number: int) -> bool:
        """删除单个手工分镜 beat（仅当 is_manual_shot=1）。"""
        try:
            db = await self._ensure_db()
            cursor = await db.execute(
                "DELETE FROM beats WHERE episode_number = ? AND beat_number = ? AND is_manual_shot = 1",
                (episode_number, beat_number),
            )
            await db.commit()
            return cursor.rowcount > 0
        except Exception as e:
            console.print(f"[red]删除手工分镜失败: {e}[/red]")
            return False

    async def get_beat_prompts(
        self,
        episode_number: int,
        beat_number: int | None = None,
    ) -> Dict[str, Optional[str]]:
        """Return persisted video prompt fields for one beat."""
        try:
            db = await self._ensure_db()
            async with db.execute(
                "SELECT video_prompt, video_mode, keyframe_prompt "
                "FROM beats WHERE episode_number = ? AND beat_number = ?",
                (episode_number, beat_number),
            ) as cursor:
                row = await cursor.fetchone()
                if row:
                    return {
                        "video_prompt": row["video_prompt"],
                        "video_mode": row["video_mode"] or "first_frame",
                        "keyframe_prompt": row["keyframe_prompt"],
                    }
            return {
                "video_prompt": None,
                "video_mode": "first_frame",
                "keyframe_prompt": None,
            }
        except StoreClosedError:
            raise
        except Exception as e:
            console.print(f"[red]获取 Beat 提示词失败: {e}[/red]")
            return {
                "video_prompt": None,
                "video_mode": "first_frame",
                "keyframe_prompt": None,
            }

    async def set_beat_detected_identities(
        self,
        episode_number: int,
        detections: dict[int, list[str]],
    ) -> int:
        """批量写入 per-beat 检测身份。"""
        if not detections:
            return 0
        db = await self._ensure_db()
        count = 0
        for beat_number, ids in detections.items():
            cursor = await db.execute(
                "UPDATE beats SET detected_identities_json = ?, updated_at = datetime('now') "
                "WHERE episode_number = ? AND beat_number = ?",
                (
                    json.dumps(normalize_detected_identities(ids), ensure_ascii=False),
                    episode_number,
                    beat_number,
                ),
            )
            count += cursor.rowcount or 0
        await db.commit()
        return count

    async def set_beat_detected_props(
        self,
        episode_number: int,
        detections: dict[int, list[str]],
    ) -> int:
        """批量写入 per-beat 检测道具。"""
        if not detections:
            return 0
        db = await self._ensure_db()
        count = 0
        for beat_number, ids in detections.items():
            cursor = await db.execute(
                "UPDATE beats SET detected_props_json = ?, updated_at = datetime('now') "
                "WHERE episode_number = ? AND beat_number = ?",
                (
                    json.dumps(normalize_detected_props(ids), ensure_ascii=False),
                    episode_number,
                    beat_number,
                ),
            )
            count += cursor.rowcount or 0
        await db.commit()
        return count

    async def delete_beats_for_episode(self, episode_number: int) -> int:
        """删除指定剧集的所有 beat。"""
        db = await self._ensure_db()
        cursor = await db.execute(
            "DELETE FROM beats WHERE episode_number = ?",
            (episode_number,),
        )
        await db.commit()
        return cursor.rowcount or 0

    async def delete_beats_except(self, episode_number: int, keep_numbers: set[int]) -> int:
        """删除指定剧集中不在 keep_numbers 里的 beat。"""
        keep_numbers = {int(num) for num in keep_numbers if int(num) > 0}
        if not keep_numbers:
            return await self.delete_beats_for_episode(episode_number)
        db = await self._ensure_db()
        placeholders = ",".join("?" for _ in keep_numbers)
        cursor = await db.execute(
            f"DELETE FROM beats WHERE episode_number = ? AND beat_number NOT IN ({placeholders})",
            [episode_number, *sorted(keep_numbers)],
        )
        await db.commit()
        return cursor.rowcount or 0

__all__ = ["NarrativeSQLiteRepositoryMixin"]
