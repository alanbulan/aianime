"""Grid planning, render-mode selection, and sketch panel preparation."""

import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

from ai_anime.modules.narrative_planning.public import beat_order_value, beat_scene_id
from ai_anime.modules.production.domain.detected_refs import (
    authoritative_detected_refs_for_beat,
    extract_char_identities_from_markers,
    real_detected_identities,
)
from ai_anime.modules.production.infrastructure.media_generation.prompt_builder import (
    PromptComponents,
)


logger = logging.getLogger(__name__)
SINGLE_CELL_RENDER_MODE_KEY = "1x1_2-3"
SINGLE_CELL_RENDER_MODE_BY_ASPECT = {
    "1:1": "1x1_1-1",
    "9:16": "1x1_9-16",
    "16:9": "1x1_16-9",
}


def _beat_display_sort_key(beat: dict) -> tuple[int, int]:
    return beat_order_value(beat), int(beat.get("beat_number", 0) or 0)


# =============================================================================
# Sketch 模式配置
# =============================================================================
# Sketch 默认比例（向后兼容）
DEFAULT_SKETCH_ASPECT_RATIO = "2:3"

# =============================================================================
# 再生模式配置表（Regen Mode Configs）
# =============================================================================
# mode_key 格式: "{rows}x{cols}_{aspect_ratio_normalized}"
# 唯一全局配置表，所有 pool 引用此表
# 后续需要新比例时（如 1x1_16-9 横屏），直接在此表新增即可

REGEN_MODE_CONFIGS: Dict[str, dict] = {
    "1x1_1-1": {
        "rows": 1,
        "cols": 1,
        "aspect_ratio": "1:1",
        "image_size": "1K",
        "label": "1x1_1:1 1K",
        "capacity": 1,
    },
    "1x1_9-16": {
        "rows": 1,
        "cols": 1,
        "aspect_ratio": "9:16",
        "image_size": "1K",
        "label": "1x1_9:16 1K",
        "capacity": 1,
    },
    "1x1_2-3": {
        "rows": 1,
        "cols": 1,
        "aspect_ratio": "2:3",
        "image_size": "1K",
        "label": "1x1_2:3 1K",
        "capacity": 1,
    },
    "1x1_16-9": {
        "rows": 1,
        "cols": 1,
        "aspect_ratio": "16:9",
        "image_size": "1K",
        "label": "1x1_16:9 1K",
        "capacity": 1,
    },
    "1x2_4-3": {
        "rows": 1,
        "cols": 2,
        "aspect_ratio": "4:3",
        "image_size": "1K",
        "label": "1x2_4:3 1K",
        "capacity": 2,
    },
    "1x2_16-9": {
        "rows": 1,
        "cols": 2,
        "aspect_ratio": "16:9",
        "image_size": "1K",
        "label": "1x2_16:9 1K",
        "capacity": 2,
    },
    "1x3_16-9": {
        "rows": 1,
        "cols": 3,
        "aspect_ratio": "16:9",
        "image_size": "1K",
        "label": "1x3_16:9 1K",
        "capacity": 3,
    },
    "1x3_21-9": {
        "rows": 1,
        "cols": 3,
        "aspect_ratio": "21:9",
        "image_size": "1K",
        "label": "1x3_21:9 1K",
        "capacity": 3,
    },
    "1x4_21-9": {
        "rows": 1,
        "cols": 4,
        "aspect_ratio": "21:9",
        "image_size": "1K",
        "label": "1x4_21:9 1K",
        "capacity": 4,
    },
    "1x6_4-1": {
        "rows": 1,
        "cols": 6,
        "aspect_ratio": "4:1",
        "image_size": "1K",
        "label": "1x6_4:1 1K",
        "capacity": 6,
    },
    "2x2_1-1": {
        "rows": 2,
        "cols": 2,
        "aspect_ratio": "1:1",
        "image_size": "2K",
        "label": "2x2_1:1 2K",
        "capacity": 4,
    },
    "2x2_9-16": {
        "rows": 2,
        "cols": 2,
        "aspect_ratio": "9:16",
        "image_size": "2K",
        "label": "2x2_9:16 2K",
        "capacity": 4,
    },
    "2x3_1-1": {
        "rows": 2,
        "cols": 3,
        "aspect_ratio": "1:1",
        "image_size": "2K",
        "label": "2x3_1:1 2K",
        "capacity": 6,
    },
    "2x4_4-3": {
        "rows": 2,
        "cols": 4,
        "aspect_ratio": "4:3",
        "image_size": "2K",
        "label": "2x4_4:3 2K",
        "capacity": 8,
    },
    "2x2_2-3": {
        "rows": 2,
        "cols": 2,
        "aspect_ratio": "2:3",
        "image_size": "2K",
        "label": "2x2_2:3 2K",
        "capacity": 4,
    },
    "2x2_16-9": {
        "rows": 2,
        "cols": 2,
        "aspect_ratio": "16:9",
        "image_size": "2K",
        "label": "2x2_16:9 2K",
        "capacity": 4,
    },
    "3x2_9-16": {
        "rows": 3,
        "cols": 2,
        "aspect_ratio": "9:16",
        "image_size": "2K",
        "label": "3x2_9:16 2K",
        "capacity": 6,
    },
    "3x2_2-3": {
        "rows": 3,
        "cols": 2,
        "aspect_ratio": "2:3",
        "image_size": "2K",
        "label": "3x2_2:3 2K",
        "capacity": 6,
    },
    "3x3_1-1": {
        "rows": 3,
        "cols": 3,
        "aspect_ratio": "1:1",
        "image_size": "4K",
        "label": "3x3_1:1 4K",
        "capacity": 9,
    },
    "3x3_9-16": {
        "rows": 3,
        "cols": 3,
        "aspect_ratio": "9:16",
        "image_size": "4K",
        "label": "3x3_9:16 4K",
        "capacity": 9,
    },
    "3x3_2-3": {
        "rows": 3,
        "cols": 3,
        "aspect_ratio": "2:3",
        "image_size": "2K",
        "label": "3x3_2:3 2K",
        "capacity": 9,
    },
    "3x3_16-9": {
        "rows": 3,
        "cols": 3,
        "aspect_ratio": "16:9",
        "image_size": "4K",
        "label": "3x3_16:9 4K",
        "capacity": 9,
    },
    "4x3_9-16": {
        "rows": 4,
        "cols": 3,
        "aspect_ratio": "9:16",
        "image_size": "4K",
        "label": "4x3_9:16 4K",
        "capacity": 12,
    },
    "4x3_3-4": {
        "rows": 4,
        "cols": 3,
        "aspect_ratio": "3:4",
        "image_size": "4K",
        "label": "4x3_3:4 4K",
        "capacity": 12,
    },
    "4x4_1-1": {
        "rows": 4,
        "cols": 4,
        "aspect_ratio": "1:1",
        "image_size": "4K",
        "label": "4x4_1:1 4K",
        "capacity": 16,
    },
    "4x4_16-9": {
        "rows": 4,
        "cols": 4,
        "aspect_ratio": "16:9",
        "image_size": "4K",
        "label": "4x4_16:9 4K",
        "capacity": 16,
    },
    "5x4_9-16": {
        "rows": 5,
        "cols": 4,
        "aspect_ratio": "9:16",
        "image_size": "4K",
        "label": "5x4_9:16 4K",
        "capacity": 20,
    },
    "5x5_1-1": {
        "rows": 5,
        "cols": 5,
        "aspect_ratio": "1:1",
        "image_size": "4K",
        "label": "5x5_1:1 4K",
        "capacity": 25,
    },
    # Sketch 专用
    "1x1_1-1_sketch": {
        "rows": 1,
        "cols": 1,
        "aspect_ratio": "1:1",
        "image_size": "1K",
        "label": "1x1_1:1 Sketch",
        "capacity": 1,
    },
    "1x1_9-16_sketch": {
        "rows": 1,
        "cols": 1,
        "aspect_ratio": "9:16",
        "image_size": "1K",
        "label": "1x1_9:16 Sketch",
        "capacity": 1,
    },
    "1x1_2-3_sketch": {
        "rows": 1,
        "cols": 1,
        "aspect_ratio": "2:3",
        "image_size": "1K",
        "label": "1x1_2:3 Sketch",
        "capacity": 1,
    },
    "1x1_16-9_sketch": {
        "rows": 1,
        "cols": 1,
        "aspect_ratio": "16:9",
        "image_size": "1K",
        "label": "1x1_16:9 Sketch",
        "capacity": 1,
    },
    "1x2_4-3_sketch": {
        "rows": 1,
        "cols": 2,
        "aspect_ratio": "4:3",
        "image_size": "1K",
        "label": "1x2_4:3 Sketch",
        "capacity": 2,
    },
    "2x2_2-3_sketch": {
        "rows": 2,
        "cols": 2,
        "aspect_ratio": "2:3",
        "image_size": "1K",
        "label": "2x2_2:3 Sketch",
        "capacity": 4,
    },
    "2x2_16-9_sketch": {
        "rows": 2,
        "cols": 2,
        "aspect_ratio": "16:9",
        "image_size": "1K",
        "label": "2x2_16:9 Sketch",
        "capacity": 4,
    },
    "2x2_9-16_sketch": {
        "rows": 2,
        "cols": 2,
        "aspect_ratio": "9:16",
        "image_size": "1K",
        "label": "2x2_9:16 Sketch",
        "capacity": 4,
    },
    "3x3_1-1_sketch": {
        "rows": 3,
        "cols": 3,
        "aspect_ratio": "1:1",
        "image_size": "1K",
        "label": "3x3_1:1 Sketch",
        "capacity": 9,
    },
    "3x3_9-16_sketch": {
        "rows": 3,
        "cols": 3,
        "aspect_ratio": "9:16",
        "image_size": "1K",
        "label": "3x3_9:16 Sketch",
        "capacity": 9,
    },
    "3x3_3-4_sketch": {
        "rows": 3,
        "cols": 3,
        "aspect_ratio": "3:4",
        "image_size": "1K",
        "label": "3x3_3:4 Sketch",
        "capacity": 9,
    },
    "3x3_2-3_sketch": {
        "rows": 3,
        "cols": 3,
        "aspect_ratio": "2:3",
        "image_size": "1K",
        "label": "3x3_2:3 Sketch",
        "capacity": 9,
    },
    "3x3_16-9_sketch": {
        "rows": 3,
        "cols": 3,
        "aspect_ratio": "16:9",
        "image_size": "1K",
        "label": "3x3_16:9 Sketch",
        "capacity": 9,
    },
    "2x3_1-1_sketch": {
        "rows": 2,
        "cols": 3,
        "aspect_ratio": "1:1",
        "image_size": "1K",
        "label": "2x3_1:1 Sketch",
        "capacity": 6,
    },
    "2x4_4-3_sketch": {
        "rows": 2,
        "cols": 4,
        "aspect_ratio": "4:3",
        "image_size": "1K",
        "label": "2x4_4:3 Sketch",
        "capacity": 8,
    },
    "4x3_3-4_sketch": {
        "rows": 4,
        "cols": 3,
        "aspect_ratio": "3:4",
        "image_size": "1K",
        "label": "4x3_3:4 Sketch",
        "capacity": 12,
    },
    "4x4_1-1_sketch": {
        "rows": 4,
        "cols": 4,
        "aspect_ratio": "1:1",
        "image_size": "1K",
        "label": "4x4_1:1 Sketch",
        "capacity": 16,
    },
    "4x4_9-16_sketch": {
        "rows": 4,
        "cols": 4,
        "aspect_ratio": "9:16",
        "image_size": "1K",
        "label": "4x4_9:16 Sketch",
        "capacity": 16,
    },
    "4x4_2-3_sketch": {
        "rows": 4,
        "cols": 4,
        "aspect_ratio": "2:3",
        "image_size": "1K",
        "label": "4x4_2:3 Sketch",
        "capacity": 16,
    },
    "4x4_16-9_sketch": {
        "rows": 4,
        "cols": 4,
        "aspect_ratio": "16:9",
        "image_size": "1K",
        "label": "4x4_16:9 Sketch",
        "capacity": 16,
    },
    "5x5_1-1_sketch": {
        "rows": 5,
        "cols": 5,
        "aspect_ratio": "1:1",
        "image_size": "1K",
        "label": "5x5_1:1 Sketch",
        "capacity": 25,
    },
    "5x5_2-3_sketch": {
        "rows": 5,
        "cols": 5,
        "aspect_ratio": "2:3",
        "image_size": "1K",
        "label": "5x5_2:3 Sketch",
        "capacity": 25,
    },
    "5x5_16-9_sketch": {
        "rows": 5,
        "cols": 5,
        "aspect_ratio": "16:9",
        "image_size": "1K",
        "label": "5x5_16:9 Sketch",
        "capacity": 25,
    },
    "5x5_9-16_sketch": {
        "rows": 5,
        "cols": 5,
        "aspect_ratio": "9:16",
        "image_size": "1K",
        "label": "5x5_9:16 Sketch",
        "capacity": 25,
    },
}


def get_sketch_default_mode_key(aspect_ratio: str = DEFAULT_SKETCH_ASPECT_RATIO) -> str:
    target = aspect_ratio.replace(":", "-")
    candidate = f"1x1_{target}_sketch"
    if candidate in REGEN_MODE_CONFIGS:
        return candidate
    return "1x1_2-3_sketch"


def get_sketch_nxn_modes(
    aspect_ratio: str = DEFAULT_SKETCH_ASPECT_RATIO,
) -> list[tuple[int, str, int, int]]:
    result: list[tuple[int, str, int, int]] = []
    for cap, rows, cols in [(1, 1, 1), (4, 2, 2), (9, 3, 3), (16, 4, 4), (25, 5, 5)]:
        matches = [
            mode_key
            for mode_key, cfg in REGEN_MODE_CONFIGS.items()
            if mode_key.endswith("_sketch")
            and cfg.get("rows") == rows
            and cfg.get("cols") == cols
            and cfg.get("aspect_ratio") == aspect_ratio
        ]
        if matches:
            result.append((cap, matches[0], rows, cols))
            continue
        same_size_fallbacks = [
            mode_key
            for mode_key, cfg in REGEN_MODE_CONFIGS.items()
            if mode_key.endswith("_sketch")
            and cfg.get("rows") == rows
            and cfg.get("cols") == cols
        ]
        if same_size_fallbacks:
            preferred_same_size = next(
                (
                    mode_key
                    for mode_key in same_size_fallbacks
                    if REGEN_MODE_CONFIGS[mode_key].get("aspect_ratio")
                    == DEFAULT_SKETCH_ASPECT_RATIO
                ),
                same_size_fallbacks[0],
            )
            result.append((cap, preferred_same_size, rows, cols))
            continue
        raise ValueError(f"No sketch mode available for grid size {rows}x{cols}")
    return result


# Sketch 默认 mode_key，其余信息从 REGEN_MODE_CONFIGS 查表
SKETCH_DEFAULT_MODE_KEY = get_sketch_default_mode_key()
PLANNER_VERSION = "2026-08-28-single-sketch-v2"


@dataclass(frozen=True)
class PlanEntry:
    """Single grid entry in a server-authoritative render plan."""

    mode_key: str
    rows: int
    cols: int
    beat_numbers: tuple[int, ...]
    location: str = ""
    padding_count: int = 0
    reasons: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()


def hash_plan(plan: list[PlanEntry]) -> str:
    """Canonical SHA1 of plan shape, truncated for task identity."""
    payload = json.dumps(
        [(entry.mode_key, list(entry.beat_numbers)) for entry in plan],
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]


def compute_input_fingerprint(
    beats: list[dict],
    character_map: dict,
    sketch_colors: dict,
    strategy: str,
    aspect_mode: str,
    force_one_by_one: bool,
    ref_image_hasher: Callable[[str], str],
) -> str:
    """Fingerprint planning inputs that must stay stable between plan and execute."""
    beats_by_num = sorted(beats, key=_beat_display_sort_key)
    beats_payload = []
    for beat in beats_by_num:
        identities, _props = authoritative_detected_refs_for_beat(beat)
        beats_payload.append(
            {
                "beat_number": beat.get("beat_number"),
                "location": beat_scene_id(beat) or beat.get("location") or "",
                "detected_identities": sorted(real_detected_identities(identities)),
                "visual_description": beat.get("visual_description") or "",
            }
        )

    referenced_ids: set[str] = set()
    for beat in beats_by_num:
        identities, _props = authoritative_detected_refs_for_beat(beat)
        for identity_id in real_detected_identities(identities):
            referenced_ids.add(str(identity_id))

    character_payload = []
    for identity_id in sorted(referenced_ids):
        info = character_map.get(identity_id) or {}
        ref_path = info.get("ref_path") or info.get("primary_reference") or ""
        ref_mode = info.get("ref_mode") or info.get("mode") or ""
        content_hash = ref_image_hasher(ref_path) if ref_path else ""
        character_payload.append(
            {
                "id": identity_id,
                "ref_path": ref_path,
                "ref_mode": ref_mode,
                "content_hash": content_hash,
            }
        )

    sketch_color_payload = {
        identity_id: sketch_colors.get(identity_id, "")
        for identity_id in sorted(referenced_ids)
    }
    envelope = {
        "beats": beats_payload,
        "character_map": character_payload,
        "sketch_colors": sketch_color_payload,
        "strategy": strategy,
        "aspect_mode": aspect_mode,
        "force_one_by_one": bool(force_one_by_one),
        "planner_version": PLANNER_VERSION,
    }
    payload = json.dumps(
        envelope, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    )
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]


def cell_aspect_ratio(mode_key: str) -> Optional[str]:
    """计算 mode_key 中单个 cell 的实际宽高比字符串。

    公式: cell 比例 = (W × rows) : (H × cols)，其中 W:H 是 grid 整体比例。
    """
    from math import gcd

    cfg = REGEN_MODE_CONFIGS.get(mode_key)
    if not cfg or not cfg.get("aspect_ratio"):
        return None
    w, h = map(int, cfg["aspect_ratio"].split(":"))
    rows, cols = cfg["rows"], cfg["cols"]
    cell_w, cell_h = w * rows, h * cols
    g = gcd(cell_w, cell_h)
    return f"{cell_w // g}:{cell_h // g}"


def sketch_pass1_mode_key(target_mode_key: str) -> Optional[str]:
    """给定目标 sketch mode_key，返回同尺寸的 1:1 sketch mode_key（用于 two-pass）。

    已禁用 two-pass：所有比例（含 5x5 2:3）均直接 one-pass 生成。
    """
    return None


# 从 SKETCH_DEFAULT_MODE_KEY 派生（向后兼容）
_sketch_cfg = REGEN_MODE_CONFIGS[SKETCH_DEFAULT_MODE_KEY]
SKETCH_GRID_CONFIG = {
    "rows": _sketch_cfg["rows"],
    "cols": _sketch_cfg["cols"],
    "aspect_ratio": _sketch_cfg["aspect_ratio"],
    "image_size": _sketch_cfg["image_size"],
}
# Automatic production uses one image-model request per Beat. Larger modes
# remain available only for explicit contact-sheet experiments/history tools.
SKETCH_GRID_PLAN = [SKETCH_GRID_CONFIG] * 1

# 草图再生只允许 NxN + 1:1 模式
SKETCH_REGEN_MODE_KEYS = [
    "1x1_1-1",
    "1x1_1-1_sketch",
    "1x1_9-16_sketch",
    "1x1_2-3_sketch",
    "1x1_16-9_sketch",
    "1x2_4-3_sketch",
    "2x2_1-1",
    "2x2_2-3_sketch",
    "2x2_16-9_sketch",
    "2x2_9-16_sketch",
    "2x4_4-3_sketch",
    "3x2_2-3",
    "3x3_1-1_sketch",
    "3x3_9-16_sketch",
    "3x3_3-4_sketch",
    "3x3_2-3_sketch",
    "3x3_16-9_sketch",
    "4x3_3-4_sketch",
    "4x4_1-1_sketch",
    "4x4_16-9_sketch",
    "5x5_1-1_sketch",
    "5x5_2-3_sketch",
    "5x5_16-9_sketch",
    "5x5_9-16_sketch",
    "5x5_1-1",
]

# =============================================================================
# 统一积木池：pool 即资源清单，用完即止
# =============================================================================
# 预置池子模板（* N 生成实际资源清单）
LOCATION_POOL_TEMPLATE = ["2x4_4-3", "2x3_1-1", "2x2_2-3", "1x2_4-3", "1x1_2-3"]
LANDSCAPE_RENDER_POOL_TEMPLATE = [
    "4x4_16-9",
    "3x3_16-9",
    "2x2_16-9",
    "1x1_16-9",
]

# 默认模式 pool（与场景分组相同）
DEFAULT_POOL_TEMPLATE = ["2x4_4-3", "2x3_1-1", "2x2_2-3", "1x2_4-3", "1x1_2-3"]
# 角色分组 pool
CHARACTER_POOL_2 = ["2x4_4-3", "2x3_1-1", "2x2_2-3", "1x2_4-3", "1x1_2-3"]
CHARACTER_POOL_3 = ["2x4_4-3", "2x3_1-1", "2x2_2-3", "1x2_4-3", "1x1_2-3"]

# 铁律：>=3 个有参考图的角色引用时，只能用 1x1（不能用网格）
MANY_CHARS_REF_THRESHOLD = 3
MANY_CHARS_MAX_CAPACITY = 1


def _cap_pool_for_many_chars(pool: list, composite_count: int) -> list:
    """当 composite 角色数 >= 阈值时，过滤池子到 capacity <= 上限。"""
    if composite_count >= MANY_CHARS_REF_THRESHOLD:
        capped = [
            mk
            for mk in pool
            if REGEN_MODE_CONFIGS[mk]["capacity"] <= MANY_CHARS_MAX_CAPACITY
        ]
        return capped if capped else pool
    return pool


def _count_batch_composite_chars(beats: list, character_map: dict) -> int:
    """统计一批 beats 中出现的唯一 composite 角色数量。"""
    all_chars = set()
    for beat in beats:
        all_chars |= _get_beat_visual_composite_chars(beat, character_map)
    return len(all_chars)


def _smart_repack_beats(
    beats: List[dict],
    character_map: dict,
    pool_template: list,
    overrides: dict = None,
    loc: str = "",
) -> list:
    """智能拆分：将 beats 按 composite 角色数分成连续子组，每组 n_comp < 阈值。

    当一批 beats 合计 n_comp >= 3 时，不是一刀切全部 cap 到 1x2，
    而是贪心扫描：连续 beats 合并 composite 集合，只在真正达到阈值时断开。
    每个子组用完整 pool pack（因为子组内 n_comp < 3），
    只有单个 beat 本身 >= 3 时才用 capped pool。
    """
    if not beats:
        return []

    groups: List[List[dict]] = []
    current_group: List[dict] = []
    current_chars: set = set()

    for beat in beats:
        beat_chars = _get_beat_visual_composite_chars(beat, character_map)
        merged = current_chars | beat_chars

        if len(merged) >= MANY_CHARS_REF_THRESHOLD and current_group:
            # 当前 beat 会让 n_comp 超标，先 flush 已有组
            groups.append(current_group)
            current_group = [beat]
            current_chars = set(beat_chars)
        else:
            current_group.append(beat)
            current_chars = merged

    if current_group:
        groups.append(current_group)

    # 合并角色集相同的子组（如 B1-6{唐若瑜,陆洲} 和 B17-18{唐若瑜,陆洲}）
    merged_groups: List[List[dict]] = []
    merged_charsets: List[frozenset] = []
    for group in groups:
        chars = frozenset()
        for beat in group:
            chars = chars | _get_beat_visual_composite_chars(beat, character_map)
        # 找已有的同角色集组合并
        found = False
        for i, existing_chars in enumerate(merged_charsets):
            if (
                chars == existing_chars
                or (chars | existing_chars) == existing_chars
                or (chars | existing_chars) == chars
            ):
                # 角色集相同或是子集，检查合并后是否仍 < 阈值
                union = chars | existing_chars
                if len(union) < MANY_CHARS_REF_THRESHOLD:
                    merged_groups[i].extend(group)
                    merged_charsets[i] = union
                    found = True
                    break
        if not found:
            merged_groups.append(list(group))
            merged_charsets.append(chars)

    # 合并后按首 beat_number 排序每组内的 beats
    for group in merged_groups:
        group.sort(key=lambda b: b.get("beat_number", 0))

    # 对每个子组用合适的 pool pack
    result = []
    for group in merged_groups:
        n_comp = _count_batch_composite_chars(group, character_map)
        if n_comp >= MANY_CHARS_REF_THRESHOLD:
            # 单个 beat 本身就 >= 3 composite，用 capped pool
            capped = _cap_pool_for_many_chars(list(pool_template), n_comp)
            if loc:
                result.extend(_pack_location_beats(group, loc, capped, overrides or {}))
            else:
                pool = list(capped) * 100
                mode_keys = pack_beats(len(group), pool)
                result.extend(mode_keys)
        else:
            # n_comp < 3，用完整 pool
            if loc:
                result.extend(
                    _pack_location_beats(
                        group, loc, list(pool_template), overrides or {}
                    )
                )
            else:
                pool = list(pool_template) * 100
                mode_keys = pack_beats(len(group), pool)
                result.extend(mode_keys)

    return result


def pad_to_aspect_ratio(panel, target_aspect: str, fill_color=(220, 220, 220)):
    """panel 上下/左右补白到目标比例。不裁剪、不拉伸。
    如果 panel 已经比目标更宽/更高，原样返回（不裁剪）。
    白色填充，并向内覆盖几像素盖住 AI 生成的边框线。"""
    from PIL import Image, ImageDraw

    w, h = panel.size
    aw, ah = map(int, target_aspect.replace(":", "x").split("x"))
    target_ratio = aw / ah
    current_ratio = w / h

    if abs(current_ratio - target_ratio) < 0.08:
        return panel  # 已匹配（0.5K 小 panel trim 后比例会有几 % 偏移）

    white = (255, 255, 255)
    # 向内覆盖像素数：盖住原图边缘的边框线
    overlap = max(6, min(w, h) // 60)

    if current_ratio > target_ratio:
        # panel 更宽 → 需要加高（上下补白）
        new_h = int(w / target_ratio)
        result = Image.new("RGB", (w, new_h), white)
        py = (new_h - h) // 2
        result.paste(panel, (0, py))
        # 白色覆盖原图顶部 / 底部 overlap 行
        draw = ImageDraw.Draw(result)
        draw.rectangle([0, py, w - 1, py + overlap - 1], fill=white)
        draw.rectangle([0, py + h - overlap, w - 1, py + h - 1], fill=white)
        return result
    else:
        # panel 更高 → 需要加宽（左右补白）
        new_w = int(h * target_ratio)
        result = Image.new("RGB", (new_w, h), white)
        px = (new_w - w) // 2
        result.paste(panel, (px, 0))
        # 白色覆盖原图左侧 / 右侧 overlap 列
        draw = ImageDraw.Draw(result)
        draw.rectangle([px, 0, px + overlap - 1, h - 1], fill=white)
        draw.rectangle([px + w - overlap, 0, px + w - 1, h - 1], fill=white)
        return result


def pack_beats(total_beats: int, pool: list[str]) -> list[str]:
    """贪心 bin-pack：优先减少网格数量。

    策略：先尝试找一个能装下所有 beats 的最小网格；
    找不到时取最大网格装满，剩余递归。
    """
    if total_beats <= 0:
        return [pool[0]] if pool else []

    # 去重并按容量从小到大排序
    unique_modes = list(dict.fromkeys(pool))  # 保序去重
    by_cap_asc = sorted(unique_modes, key=lambda mk: REGEN_MODE_CONFIGS[mk]["capacity"])

    # 1. 尝试用单个网格装下所有 beats（选最小能装下的）
    for mk in by_cap_asc:
        if REGEN_MODE_CONFIGS[mk]["capacity"] >= total_beats:
            return [mk]

    # 2. 装不下 → 取最大网格，剩余递归
    largest = by_cap_asc[-1]
    largest_cap = REGEN_MODE_CONFIGS[largest]["capacity"]
    remaining = total_beats - largest_cap
    return [largest] + pack_beats(remaining, pool)


# =============================================================================
# 场景分组比例覆盖表
# =============================================================================
# aspect_mode → {(rows, cols): (aspect_ratio, image_size)}
# 只列出需要覆盖默认查找的 grid size
LOCATION_ASPECT_CONFIGS = {
    "9:16": {
        # 2x2 不覆盖，走 SQUARE 默认 1:1
    },
    "1:1": {
        (2, 2): ("1:1", "2K"),
        (1, 1): ("1:1", "1K"),
    },
}


def parse_regen_mode(mode_key: str) -> tuple:
    """解析再生模式 key，返回 (rows, cols, aspect_ratio, image_size)。

    Args:
        mode_key: 如 '1x1_9-16', '2x2_1-1'

    Returns:
        (rows, cols, aspect_ratio, image_size)
    """
    cfg = REGEN_MODE_CONFIGS[mode_key]
    return cfg["rows"], cfg["cols"], cfg["aspect_ratio"], cfg["image_size"]


def get_default_mode_for_grid(grid_size: str) -> str:
    """Return the default mode key for a grid size like 1x1 / 2x2 / 3x3."""
    for key in REGEN_MODE_CONFIGS:
        if key.startswith(grid_size + "_"):
            return key
    raise ValueError(f"No regen mode for grid size: {grid_size}")


def get_regen_modes_for_grid(grid_size: str) -> list:
    """获取指定 grid_size 的所有模式 key 列表。

    Args:
        grid_size: 如 '1x1', '2x2'

    Returns:
        [mode_key, ...]
    """
    return [k for k in REGEN_MODE_CONFIGS if k.startswith(grid_size + "_")]


def grid_mode_to_mode_key(grid_mode: str) -> str:
    """将简单 grid_mode (如 '3x3') 转换为带比例的 mode_key (如 '3x3_1-1')。

    从 REGEN_MODE_CONFIGS 查找匹配的 mode_key。
    已经是 mode_key 格式的（含 '_'）直接返回。
    """
    # 已经包含比例信息（如 '3x3_1-1'），直接返回
    if "_" in grid_mode:
        return grid_mode
    parts = grid_mode.split("x")
    if len(parts) != 2:
        return grid_mode  # loc 等特殊模式
    try:
        rows, cols = int(parts[0]), int(parts[1])
    except ValueError:
        return grid_mode
    # 从 REGEN_MODE_CONFIGS 查找第一个匹配 (rows, cols) 的 mode_key
    for mk, cfg in REGEN_MODE_CONFIGS.items():
        if cfg["rows"] == rows and cfg["cols"] == cols:
            return mk
    return grid_mode  # fallback


def _single_cell_render_mode_key(aspect_mode: str) -> str:
    return SINGLE_CELL_RENDER_MODE_BY_ASPECT.get(
        str(aspect_mode or "").strip(),
        SINGLE_CELL_RENDER_MODE_KEY,
    )


def _render_pool_template_for_aspect(aspect_mode: str) -> list[str]:
    if str(aspect_mode or "").strip() == "16:9":
        # Square 16:9 grids keep every split cell at 16:9 while still combining beats.
        return list(LANDSCAPE_RENDER_POOL_TEMPLATE)
    return list(LOCATION_POOL_TEMPLATE)


# =============================================================================
# Shot-Level Grid 配置（v2.0 Shot-Centric）
# =============================================================================
# Shot 内 N 个 beats → 1 个 Grid，作为高级参考视频工作流的分镜参考。
# 仅使用已验证的网格布局。

SHOT_GRID_CONFIGS: Dict[int, dict] = {
    1: {
        "rows": 1,
        "cols": 1,
        "aspect_ratio": "9:16",
        "image_size": "1K",
        "order_hint": "",
    },
    2: {
        "rows": 1,
        "cols": 2,
        "aspect_ratio": "16:9",
        "image_size": "2K",
        "order_hint": "从左到右",
    },
    3: {
        "rows": 1,
        "cols": 3,
        "aspect_ratio": "21:9",
        "image_size": "2K",
        "order_hint": "从左到右",
    },
    4: {
        "rows": 2,
        "cols": 2,
        "aspect_ratio": "1:1",
        "image_size": "2K",
        "order_hint": "从左到右从上到下",
    },
    5: {
        "rows": 3,
        "cols": 3,
        "aspect_ratio": "1:1",
        "image_size": "4K",
        "order_hint": "从左到右从上到下，前5格",
    },
}


def get_shot_grid_config(beat_count: int) -> dict:
    """获取 Shot 级 Grid 配置。

    Args:
        beat_count: Shot 内 beat 数量（1-5）

    Returns:
        {"rows", "cols", "aspect_ratio", "image_size", "order_hint"}
    """
    beat_count = max(1, min(5, beat_count))
    return SHOT_GRID_CONFIGS[beat_count]


class GridGenerationRequest(BaseModel):
    """网格生成请求。

    参考模式由上游 build_character_map_for_grid() 决定：
    - composite: 复合参考图（Portrait + Fullbody 拼接），锁脸 + 锁服装
    - portrait_only: 仅面部特写，锁脸，服装由 appearance_details 文字控制
    - prompt_only: 无参考图，完全由提示词控制
    """

    beats: List[dict] = Field(
        description="Beats 数据列表（每张网格最多25个，不足留空）"
    )
    character_map: Dict[str, dict] = Field(
        default_factory=dict,
        description="""角色映射 {角色名: {
            'character_tag': ...,
            'base_prompt': ...,
            'appearance_details': ...,
            'portrait_path': ...,  # 面部特写图（用于锁脸）
            'ref_path': ...,  # 参考图路径
            'reference_mode': ...,  # composite / portrait_only / prompt_only
        }}""",
    )
    style: str = Field(
        default=None,
        description="全局风格 (chinese_period_drama, anime, realistic)，默认使用 IMAGE_DEFAULT_STYLE",
    )
    episode: int = Field(description="集数")
    ethnicity: str = Field(
        default="Chinese",
        description="角色默认种族 (Chinese, Korean, Japanese, Western, etc.)",
    )


class GridGenerationResult(BaseModel):
    """网格生成结果。"""

    success: bool
    grid_image_path: Optional[str] = None
    grid_image_bytes: Optional[bytes] = None
    error: Optional[str] = None
    generation_time: float = 0.0
    # 用于单网格重新生成时的元数据
    beat_start_index: Optional[int] = None  # 该网格对应的起始 beat 索引 (0-based)
    beat_count: Optional[int] = None  # 该网格实际的 beat 数量（不含填充）
    grid_rows: Optional[int] = None  # 网格行数
    grid_cols: Optional[int] = None  # 网格列数


def filter_character_map_for_beats(
    character_map: dict,
    beats: list,
    scene_refs: dict[int, list[Any]] | None = None,
) -> dict:
    """过滤角色映射为当前 beats 中实际出场角色。

    只保留在 beats visual_description 中 {{角色名}} 出现的角色。

    Returns:
        过滤后的 character_map（新 dict，不修改原始数据）
    """
    panel_chars = PromptComponents.extract_panel_characters(beats, character_map)

    # 只保留出场角色
    filtered = {k: dict(v) for k, v in character_map.items() if k in panel_chars}

    non_panel = [c for c in character_map if c not in filtered]
    if non_panel:
        logger.info(f"[filter_character_map] 过滤非出场角色: {non_panel}")

    return filtered


def _has_director_image_ref(
    scene_refs: dict[int, list[Any]], panel_idx: int = 1
) -> bool:
    for ref in scene_refs.get(panel_idx, []) or []:
        if str(getattr(ref, "source_level", "") or "").strip() != "director_image":
            continue
        image_paths = list(getattr(ref, "image_paths", []) or [])
        if image_paths and all(os.path.exists(path) for path in image_paths):
            return True
    return False


def build_color_map_from_character_map(
    character_map: dict,
    sketch_colors: dict[str, str] | None = None,
) -> dict[str, str]:
    """从 character_map + sketch_colors 构建 {key: "#HEX COLOR_NAME"} 颜色映射。

    Returns:
        {identity_key: "#HEX COLOR_NAME"}。
        角色 key 格式为 "char_name_suffix" 或 "char_name"。
    """
    color_map = {}
    for char_name, info in character_map.items():
        identity_colors = info.get("identity_sketch_colors", {})
        if identity_colors:
            for suffix, color_str in identity_colors.items():
                color_map[f"{char_name}_{suffix}"] = color_str
        elif info.get("sketch_color"):
            color_map[char_name] = info["sketch_color"]
    return color_map


def detect_panel_characters(
    character_map: dict,
    sketch_image_path: str,
    rows: int,
    cols: int,
    sketch_colors: dict[str, str] | None = None,
) -> dict[int, set[str]]:
    """Per-panel 颜色检测，返回每个 panel 检测到的角色 key。

    Returns:
        {panel_index(0-based): set of detected color_map keys}
    """
    from ai_anime.modules.production.infrastructure.media_generation.sketch_color_detector import (
        detect_sketch_colors_per_panel,
    )

    color_map = build_color_map_from_character_map(character_map, sketch_colors)
    if not color_map:
        return {}

    return detect_sketch_colors_per_panel(
        sketch_image_path, color_map, rows=rows, cols=cols
    )


def filter_character_map_by_sketch(
    character_map: dict,
    sketch_image_path: str,
    sketch_colors: dict[str, str] | None = None,
) -> dict:
    """检测草图颜色，过滤不存在的角色。

    保留 prompt_only 和无 sketch_color 的角色（无法通过颜色判断）。
    仅过滤有 sketch_color 但颜色在草图中不存在的角色。

    Returns:
        过滤后的 character_map（新 dict）
    """
    from ai_anime.modules.production.infrastructure.media_generation.sketch_color_detector import (
        detect_sketch_colors,
    )

    color_map = build_color_map_from_character_map(character_map, sketch_colors)
    if not color_map:
        return dict(character_map)

    # 构建 char_to_keys 映射
    char_to_keys = {}
    for char_name, info in character_map.items():
        keys = []
        identity_colors = info.get("identity_sketch_colors", {})
        if identity_colors:
            keys = [f"{char_name}_{suffix}" for suffix in identity_colors]
        elif info.get("sketch_color"):
            keys = [char_name]
        char_to_keys[char_name] = keys

    detected = detect_sketch_colors(sketch_image_path, color_map, verbose=True)

    filtered = {}
    removed = []
    for char_name, info in character_map.items():
        keys = char_to_keys.get(char_name, [])
        if not keys:
            filtered[char_name] = dict(info)
        elif any(k in detected for k in keys):
            filtered[char_name] = dict(info)
        else:
            removed.append(char_name)

    if removed:
        logger.info(f"[filter_by_sketch] 草图中未检测到颜色，移除角色: {removed}")

    return filtered


def load_precomputed_panel_detected(
    beat_numbers: list[int],
    beats_data: list[dict],
) -> dict[int, set[str] | None]:
    """从 beat 数据中读取 detected_identities，转换为 panel_detected 格式。

    Returns:
        {panel_index(0-based): set of identity keys}，未检测的 panel 值为 None
    """
    beat_map = {b.get("beat_number"): b for b in (beats_data or [])}
    result = {}
    for panel_idx, bn in enumerate(beat_numbers):
        beat = beat_map.get(bn, {})
        identities, _props = authoritative_detected_refs_for_beat(beat)
        ids = real_detected_identities(identities)
        result[panel_idx] = set(ids) if ids else None
    return result


def filter_character_map_by_precomputed(
    character_map: dict,
    panel_detected: dict[int, set[str] | None],
) -> dict:
    """根据预计算结果过滤 character_map：只保留在任一 panel 中出现的角色。"""
    if not panel_detected or all(v is None for v in panel_detected.values()):
        return {}

    all_detected = set()
    for ids in panel_detected.values():
        if ids is not None:
            all_detected.update(ids)

    if not all_detected:
        return {}

    filtered = {}
    removed = []
    for char_name, info in character_map.items():
        identity_colors = info.get("identity_sketch_colors", {})
        keys = []
        if identity_colors:
            keys = [f"{char_name}_{suffix}" for suffix in identity_colors]
        elif info.get("sketch_color"):
            keys = [char_name]

        if not keys or any(k in all_detected for k in keys):
            filtered[char_name] = dict(info)
        else:
            removed.append(char_name)

    if removed:
        logger.info(f"[filter_by_precomputed] 预计算未检测到，移除角色: {removed}")

    return filtered


def resolve_render_reference_order(
    ctx,
    beats: list[dict],
    grid_capacity: int,
    valid_character_map: dict,
) -> list[str]:
    """统一 Render 模式参考图顺序。

    Single source of truth:
    1. 只复用 prompt_builder 在 build() 阶段解析出的顺序
    2. 缺失即报错，禁止运行时重新推导导致所见非所得
    """
    if not valid_character_map:
        return []

    ordered_chars = list(getattr(ctx, "resolved_render_chars", []) or [])
    if ordered_chars:
        return ordered_chars

    raise RuntimeError(
        "Render reference order missing: ctx.resolved_render_chars was not populated "
        "by prompt_builder. Refusing to recompute attachment order at runtime."
    )


def crop_sketch_panels(
    sketch_path: str,
    beat_numbers: List[int],
    target_rows: int,
    target_cols: int,
    output_path: str,
    label_beats: bool = False,
    beat_sketch_paths: Dict[int, str] = None,
    target_aspect: str = None,
) -> str:
    """从草图中按 beat 编号提取 panel，拼接成目标布局。

    导出和生成共用此函数，确保所见即所得（WYSIWYG）。

    Args:
        sketch_path: 草图文件路径或草图目录路径
        beat_numbers: 实际 beat 编号列表（1-based），如 [2, 5, 8]
        target_rows: 目标网格行数
        target_cols: 目标网格列数
        output_path: 输出文件路径
        label_beats: 是否在每个 panel 左上角标注 beat 编号
        beat_sketch_paths: {beat_num: full_path} 从图片池取的 per-beat 草图路径
        target_aspect: 目标比例（如 "9:16"），非空时补白到该比例

    Returns:
        保存后的图片路径
    """
    from PIL import Image
    from ai_anime.modules.production.infrastructure.media_generation.grid_splitter import (
        _trim_outer_border,
    )
    import numpy as np

    def _trim_panel(panel_img):
        """裁掉单个 panel 的白边。"""
        gray_arr = np.array(panel_img.convert("L"))
        trimmed, _ = _trim_outer_border(panel_img, gray_arr)
        return trimmed

    panels = []
    panel_width = None
    panel_height = None
    pool_hit = 0

    for beat_num in beat_numbers:
        # 优先从图片池取单个 beat 草图
        if beat_sketch_paths and beat_num in beat_sketch_paths:
            pool_img = Image.open(beat_sketch_paths[beat_num])
            pool_img = _trim_panel(pool_img)
            if target_aspect:
                pool_img = pad_to_aspect_ratio(pool_img, target_aspect)
            if panel_width is None:
                panel_width = pool_img.width
                panel_height = pool_img.height
            else:
                if pool_img.size != (panel_width, panel_height):
                    pool_img = pool_img.resize(
                        (panel_width, panel_height), Image.LANCZOS
                    )
            panels.append(pool_img)
            pool_hit += 1
        else:
            # 无草图 → 灰色占位
            if panel_width:
                panels.append(
                    Image.new("RGB", (panel_width, panel_height), (128, 128, 128))
                )

    if pool_hit > 0:
        now = time.time()
        if now - getattr(crop_sketch_panels, "_last_log_t", 0.0) >= 5.0:
            logger.info(
                f"[crop_sketch_panels] 从图片池取 {pool_hit}/{len(beat_numbers)} 个 beat 草图"
            )
            crop_sketch_panels._last_log_t = now

    if not panels or panel_width is None:
        raise ValueError(f"无法从草图中提取 beat {beat_numbers}")

    target_width = target_cols * panel_width
    target_height = target_rows * panel_height
    result_img = Image.new("RGB", (target_width, target_height), (255, 255, 255))

    for i, panel in enumerate(panels):
        if i >= target_rows * target_cols:
            break
        r = i // target_cols
        c = i % target_cols
        x = c * panel_width
        y = r * panel_height
        result_img.paste(panel, (x, y))

    # 画面板间分割线
    if target_rows > 1 or target_cols > 1:
        from PIL import ImageDraw as _ImageDraw

        _draw = _ImageDraw.Draw(result_img)
        _line_w = max(1, min(panel_width, panel_height) // 200)
        _line_color = (180, 180, 180)
        for c in range(1, target_cols):
            _x = c * panel_width
            _draw.line([(_x, 0), (_x, target_height)], fill=_line_color, width=_line_w)
        for r in range(1, target_rows):
            _y = r * panel_height
            _draw.line([(0, _y), (target_width, _y)], fill=_line_color, width=_line_w)

    # 在每个 panel 左上角标注 beat 编号
    if label_beats and beat_numbers:
        from PIL import ImageDraw, ImageFont

        draw = ImageDraw.Draw(result_img)
        font_size = max(16, min(panel_width, panel_height) // 6)
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
        except (OSError, IOError):
            font = ImageFont.load_default()
        for i, beat_num in enumerate(beat_numbers):
            if i >= target_rows * target_cols:
                break
            r = i // target_cols
            c = i % target_cols
            x = c * panel_width + 4
            y = r * panel_height + 2
            label = f"B{beat_num}"
            # 黑色描边 + 白色文字，确保可读
            for dx, dy in [
                (-1, -1),
                (-1, 1),
                (1, -1),
                (1, 1),
                (-2, 0),
                (2, 0),
                (0, -2),
                (0, 2),
            ]:
                draw.text((x + dx, y + dy), label, fill="black", font=font)
            draw.text((x, y), label, fill="white", font=font)

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    result_img.save(output_path, quality=85)
    return output_path


def get_optimal_grid_size(beat_count: int, max_grid: int = 16) -> tuple[int, int]:
    """根据 beat 数量选择最优网格大小，最小化黑色填充。

    注意：此函数已被 perfect_grid_split() 替代用于批量生成。
    保留此函数用于向后兼容和单网格重新生成。

    Args:
        beat_count: 需要填充的 beat 数量
        max_grid: 最大网格容量

    Returns:
        (rows, cols) 元组
    """
    if beat_count <= 0:
        return (1, 1)  # 最小网格：单张

    # 可用网格（按容量从小到大排列）
    # 包含竖屏 Panel 模式: 1x4=4, 3x2=6, 4x3=12, 5x4=20
    grid_options = [
        (1, 1),  # 1
        (1, 3),  # 3
        (1, 4),  # 4  竖屏 panel (21:9 宽屏)
        (2, 2),  # 4
        (3, 2),  # 6  竖屏 panel
        (3, 3),  # 9
        (4, 3),  # 12 竖屏 panel
        (5, 3),  # 15 竖屏 panel
        (4, 4),  # 16
        (5, 4),  # 20 竖屏 panel
        (5, 5),  # 25
    ]

    for rows, cols in grid_options:
        capacity = rows * cols
        # 跳过超过最大限制的网格
        if capacity > max_grid:
            continue
        if beat_count <= capacity:
            return (rows, cols)

    # 超过所有可用网格，返回最大允许的网格
    for rows, cols in reversed(grid_options):
        if rows * cols <= max_grid:
            return (rows, cols)

    # 默认返回 1x1
    return (1, 1)


def perfect_grid_split(total_beats: int, max_grid: int = 12) -> list[str]:
    """完美分割 beats，使每个网格都正好填满，不需要任何填充 panel。

    内部代理到 pack_beats，使用无限池。

    Args:
        total_beats: 总 beat 数量
        max_grid: 最大网格容量（如 12 表示最大 4x3）

    Returns:
        mode_key 列表，如 ["3x2_9-16", "1x1_9-16"]
    """
    template = DEFAULT_POOL_TEMPLATE
    # 过滤超过 max_grid 的，然后 * 100 生成无限池
    pool = [
        mk for mk in template if REGEN_MODE_CONFIGS[mk]["capacity"] <= max_grid
    ] * 100
    if not pool:
        smallest = min(template, key=lambda mk: REGEN_MODE_CONFIGS[mk]["capacity"])
        pool = [smallest] * 100
    return pack_beats(total_beats, pool)


def scene_grid_split(
    all_beats: List[dict],
    aspect_mode: str = "9:16",
    pool_template: List[str] | None = None,
    character_map: Dict[str, dict] | None = None,
) -> List[dict]:
    """按 scene_id 分组 beats，每组用最少网格数覆盖。

    将同一 scene_id 的 beat 聚合到同一网格，减少跨网格场景漂移。
    每个 scene_id 组根据 beat 数量自动选择最优网格尺寸。

    积木块序列: 2x2(4), 1x3(3), 1x2(2), 1x1(1)
    2x2 是最大网格，与 2K 1:1 配合效果最佳。

    Args:
        all_beats: 所有 beat 数据（含 scene_id / beat_number 字段）
        aspect_mode: 比例模式（"9:16", "1:1" 等），用于覆盖特定网格尺寸的比例
        pool_template: 自定义积木池模板，优先于 aspect_mode 选择

    Returns:
        网格计划列表，每项：
        {
            "scene_id": "家·餐厅",
            "rows": 2, "cols": 2,
            "mode_key": "2x2_1-1",
            "beats": [beat_dict, ...],
            "beat_numbers": [4, 5, 6, ...],
            "padding_count": 0,
        }
    """
    from collections import OrderedDict

    if pool_template:
        template = pool_template
    else:
        template = LOCATION_POOL_TEMPLATE
    overrides = LOCATION_ASPECT_CONFIGS.get(aspect_mode, {})

    # 1. 按 scene_id 聚合，保持首次出现顺序
    location_groups: OrderedDict[str, List[dict]] = OrderedDict()
    for beat in all_beats:
        loc = beat_scene_id(beat) or "未知场景"
        if loc not in location_groups:
            location_groups[loc] = []
        location_groups[loc].append(beat)

    # 1.5 粗粒度合并（家·客厅 + 家·餐厅 → 家）
    location_groups = _coalesce_locations(location_groups)

    # 2. 对每个 scene_id 组，按 per-beat composite 数细分后分别 pack
    result = []
    for loc, beats in location_groups.items():
        if character_map:
            # 按 per-beat composite 角色数分成轻量组（<= 2）和重量组（>= 3）
            light_beats = []  # <= 2 composite → 先用完整 pool，再 post-process
            heavy_beats = []  # >= 3 composite → cap 到 2x2
            for beat in beats:
                n = len(_get_beat_visual_composite_chars(beat, character_map))
                if n >= MANY_CHARS_REF_THRESHOLD:
                    heavy_beats.append(beat)
                else:
                    light_beats.append(beat)

            # 轻量组：智能 repack（按 composite 连续分组，尽量用大网格）
            if light_beats:
                light_entries = _pack_location_beats(
                    light_beats,
                    loc,
                    list(template),
                    overrides,
                )
                for entry in light_entries:
                    grid_cc = _count_batch_composite_chars(
                        entry["beats"], character_map
                    )
                    if (
                        grid_cc >= MANY_CHARS_REF_THRESHOLD
                        and len(entry["beats"]) > MANY_CHARS_MAX_CAPACITY
                    ):
                        # 智能拆分：按 composite 连续分组，≤2 的子组用完整 pool
                        result.extend(
                            _smart_repack_beats(
                                entry["beats"],
                                character_map,
                                list(template),
                                overrides,
                                loc,
                            )
                        )
                    else:
                        result.append(entry)
            # 重量组：智能 repack
            if heavy_beats:
                result.extend(
                    _smart_repack_beats(
                        heavy_beats,
                        character_map,
                        list(template),
                        overrides,
                        loc,
                    )
                )
        else:
            result.extend(
                _pack_location_beats(
                    beats,
                    loc,
                    list(template),
                    overrides,
                )
            )

    # 3. 合并小网格：连续的 1-beat 网格合并成更大的网格
    result = _merge_small_grids(result, template, character_map)

    return result


def _merge_small_grids(
    entries: List[dict],
    pool_template: List[str],
    character_map: Dict[str, dict] | None = None,
) -> List[dict]:
    """合并连续的小网格（1-2 beat）为更大的网格，减少 1x1 碎片。

    策略：扫描连续的小网格（capacity <= 2），累积 beats 后用 pack_beats
    重新分配到更大的网格（优先 2x3、2x2、1x2）。
    合并后仍遵守铁律：>= 3 composite 角色时 capacity <= 2。
    """
    merged = []
    small_buffer = []  # 暂存同 scene_id 的连续小网格

    def flush_buffer():
        """将累积的小网格 beats 重新 pack 成更大的网格。"""
        if not small_buffer:
            return
        all_beats = []
        for entry in small_buffer:
            all_beats.extend(entry["beats"])

        combined_loc = small_buffer[0].get("scene_id", "")

        # 铁律检查：合并后的 beats 如果 composite 角色 >= 阈值，用 smart_repack
        if character_map:
            n_comp = _count_batch_composite_chars(all_beats, character_map)
            if n_comp >= MANY_CHARS_REF_THRESHOLD:
                merged.extend(
                    _smart_repack_beats(
                        all_beats,
                        character_map,
                        list(pool_template),
                        overrides={},
                        loc=combined_loc,
                    )
                )
                return

        # 正常合并：用 pack_beats 重新分配
        pool = pool_template * 100
        mode_keys = pack_beats(len(all_beats), pool)

        offset = 0
        for mk in mode_keys:
            cfg = REGEN_MODE_CONFIGS[mk]
            rows, cols = cfg["rows"], cfg["cols"]
            capacity = cfg["capacity"]
            batch = all_beats[offset : offset + capacity]
            beat_numbers = [b.get("beat_number", i + 1) for i, b in enumerate(batch)]
            merged.append(
                {
                    "scene_id": combined_loc,
                    "rows": rows,
                    "cols": cols,
                    "mode_key": mk,
                    "beats": batch,
                    "beat_numbers": beat_numbers,
                    "padding_count": capacity - len(batch),
                }
            )
            offset += capacity

    for entry in entries:
        n_beats = len(entry["beats"])
        entry_scene = entry.get("scene_id", "")
        buffer_scene = small_buffer[0].get("scene_id", "") if small_buffer else None
        if n_beats <= 2:
            if small_buffer and entry_scene != buffer_scene:
                flush_buffer()
                small_buffer = []
            small_buffer.append(entry)
        else:
            # 遇到大网格，先 flush 之前的小网格
            flush_buffer()
            small_buffer = []
            merged.append(entry)

    # flush 尾部
    flush_buffer()

    return merged


def _pack_location_beats(
    beats: List[dict],
    loc: str,
    pool_template: List[str],
    overrides: dict,
) -> List[dict]:
    """将一个场景子组的 beats pack 成网格 entries。"""
    pool = pool_template * 100
    mode_keys = pack_beats(len(beats), pool)
    entries = []
    offset = 0
    for mk in mode_keys:
        cfg = REGEN_MODE_CONFIGS[mk]
        rows, cols = cfg["rows"], cfg["cols"]
        capacity = cfg["capacity"]
        batch = beats[offset : offset + capacity]
        beat_numbers = [b.get("beat_number", i + 1) for i, b in enumerate(batch)]
        entry = {
            "scene_id": loc,
            "rows": rows,
            "cols": cols,
            "mode_key": mk,
            "beats": batch,
            "beat_numbers": beat_numbers,
            "padding_count": capacity - len(batch),
        }
        grid_key = (rows, cols)
        if grid_key in overrides:
            ar, isz = overrides[grid_key]
            entry["mode_key"] = f"{rows}x{cols}_{ar.replace(':', '-')}"
        entries.append(entry)
        offset += capacity
    return entries


def build_regen_plan(
    selected_beats: list[dict],
    strategy: str,
    aspect_mode: str,
    character_map: dict | None = None,
    force_one_by_one: bool = False,
) -> list[PlanEntry]:
    """Build the canonical render plan for a selected beat set."""
    if force_one_by_one:
        mode_key = _single_cell_render_mode_key(aspect_mode)
        return [
            PlanEntry(
                mode_key=mode_key,
                rows=1,
                cols=1,
                beat_numbers=(int(beat["beat_number"]),),
                location=str(beat_scene_id(beat) or beat.get("location") or ""),
                reasons=("force-1x1",),
            )
            for beat in selected_beats
        ]

    pool_template = _render_pool_template_for_aspect(aspect_mode)

    if strategy == "location":
        raw_plan = scene_grid_split(
            list(selected_beats),
            aspect_mode=aspect_mode,
            pool_template=pool_template,
            character_map=character_map if character_map else None,
        )
        return [
            PlanEntry(
                mode_key=entry["mode_key"],
                rows=int(entry["rows"]),
                cols=int(entry["cols"]),
                beat_numbers=tuple(int(n) for n in entry["beat_numbers"]),
                location=str(entry.get("scene_id") or entry.get("location") or ""),
                padding_count=int(entry.get("padding_count") or 0),
                reasons=tuple(entry.get("reasons") or ()),
                warnings=tuple(entry.get("warnings") or ()),
            )
            for entry in raw_plan
        ]

    if strategy == "naive":
        mode_keys = pack_beats(len(selected_beats), list(pool_template))
        entries: list[PlanEntry] = []
        offset = 0
        for mode_key in mode_keys:
            cfg = REGEN_MODE_CONFIGS[mode_key]
            capacity = cfg["capacity"]
            batch = selected_beats[offset : offset + capacity]
            if not batch:
                break
            entries.append(
                PlanEntry(
                    mode_key=mode_key,
                    rows=int(cfg["rows"]),
                    cols=int(cfg["cols"]),
                    beat_numbers=tuple(int(beat["beat_number"]) for beat in batch),
                    padding_count=capacity - len(batch),
                )
            )
            offset += capacity
        return entries

    raise ValueError(f"unknown strategy: {strategy!r}")


def _get_beat_visual_composite_chars(beat: dict, character_map: dict) -> frozenset:
    """从 visual_description 的 {{}} 标记提取实际绘制的有参考图角色。

    Render 场景优先使用 detected_identities，确保铁律拆分与上色/导出使用同一套角色来源。
    若无 detected_identities，再回退到 visual_description 的 {{}} 标记。
    包括 composite 和 portrait_only 模式（都有参考图占 image slot）。
    """
    ref_names = sorted(
        [
            name
            for name, info in character_map.items()
            if info.get("reference_mode") != "prompt_only"
            and (
                info.get("reference_path")
                or info.get("ref_path")
                or info.get("portrait_path")
            )
        ],
        key=len,
        reverse=True,
    )
    visual = beat.get("visual_description", "")
    explicit = list(extract_char_identities_from_markers(visual, strict=False).values())
    detected = real_detected_identities(beat.get("detected_identities") or [])
    markers = explicit or list(detected)
    result = set()
    for marker in markers:
        for char_name in ref_names:
            if marker == char_name or marker.startswith(char_name + "_"):
                result.add(char_name)
                break
    return frozenset(result)


def _flush_to_grids(
    beats: List[dict],
    composite_count: int,
) -> List[dict]:
    """将一组 beats 打包为一个或多个网格 entry。"""
    if not beats:
        return []
    if composite_count <= 2:
        template = CHARACTER_POOL_2  # 最大 2x2
    else:
        template = CHARACTER_POOL_3  # 最大 2x2
    # 铁律
    template = _cap_pool_for_many_chars(template, composite_count)
    pool = list(template) * 100
    mode_keys = pack_beats(len(beats), pool)

    entries = []
    offset = 0
    for mk in mode_keys:
        cfg = REGEN_MODE_CONFIGS[mk]
        capacity = cfg["capacity"]
        batch = beats[offset : offset + capacity]
        beat_numbers = [b.get("beat_number", i + 1) for i, b in enumerate(batch)]
        entries.append(
            {
                "rows": cfg["rows"],
                "cols": cfg["cols"],
                "mode_key": mk,
                "beats": batch,
                "beat_numbers": beat_numbers,
                "padding_count": capacity - len(batch),
                "composite_count": composite_count,
            }
        )
        offset += capacity
    return entries


def character_grid_split(
    all_beats: List[dict],
    character_map: Dict[str, dict],
) -> List[dict]:
    """按 composite 角色全局分组 beats，自动选择网格尺寸。

    三阶段算法：
    1. 分类：按 visual_description 的 {{}} 标记提取 composite 角色数
       - >2 chars → overflow（≤2x2 pool）
       - 0 chars  → empty（就近吸收）
       - 1-2 chars → normal（配对分组）
    2. 贪心 set-cover 配对：全局聚合同角色对的所有 beats
    3. pack 到网格：≤2 chars → CHARACTER_POOL_2（最大2x2），>2 chars → CHARACTER_POOL_3（最大2x2）

    Args:
        all_beats: 所有 beat 数据（含 visual_description / beat_number 字段）
        character_map: 角色映射 {角色名: {reference_mode, ...}}

    Returns:
        网格计划列表，格式与 scene_grid_split 对齐
    """
    if not all_beats:
        return []

    # ── 阶段 1：分类 ──
    overflow_beats: List[dict] = []  # >2 composite chars
    empty_beats: List[dict] = []  # 0 composite chars
    normal_beats: List[Tuple[int, dict, frozenset]] = []  # (index, beat, chars)

    for idx, beat in enumerate(all_beats):
        chars = _get_beat_visual_composite_chars(beat, character_map)
        if len(chars) > 2:
            overflow_beats.append(beat)
        elif len(chars) == 0:
            empty_beats.append(beat)
        else:
            normal_beats.append((idx, beat, chars))

    # ── 阶段 2：贪心 set-cover 配对 ──
    # 收集所有出现过的 1-char 和 2-char 候选对
    all_char_sets: set = set()
    for _, _, chars in normal_beats:
        all_char_sets.add(chars)

    # 枚举所有可能的 pair（1 或 2 个角色的组合）
    all_single_chars = set()
    for cs in all_char_sets:
        all_single_chars |= cs
    candidate_pairs: List[frozenset] = []
    single_list = sorted(all_single_chars)
    for i, c1 in enumerate(single_list):
        candidate_pairs.append(frozenset({c1}))
        for c2 in single_list[i + 1 :]:
            candidate_pairs.append(frozenset({c1, c2}))

    assigned = [False] * len(normal_beats)
    pair_groups: List[Tuple[frozenset, List[dict]]] = []  # (pair, beats)

    while True:
        # 找覆盖最多未分配 beats 的 pair
        best_pair = None
        best_indices = []
        for pair in candidate_pairs:
            indices = [
                i
                for i, (_, _, chars) in enumerate(normal_beats)
                if not assigned[i] and chars <= pair
            ]
            if len(indices) > len(best_indices):
                best_pair = pair
                best_indices = indices
        if not best_indices:
            break
        for i in best_indices:
            assigned[i] = True
        group_beats = [normal_beats[i][1] for i in best_indices]
        pair_groups.append((best_pair, group_beats))

    # ── empty beats 就近吸收到最近的 pair group ──
    if empty_beats and pair_groups:
        for eb in empty_beats:
            eb_num = eb.get("beat_number", 0)
            best_group_idx = 0
            best_dist = float("inf")
            for gi, (_, group_beats) in enumerate(pair_groups):
                for gb in group_beats:
                    dist = abs(gb.get("beat_number", 0) - eb_num)
                    if dist < best_dist:
                        best_dist = dist
                        best_group_idx = gi
            pair_groups[best_group_idx][1].append(eb)
    elif empty_beats:
        # 没有 pair group，empty beats 自成一组
        pair_groups.append((frozenset(), empty_beats))

    # ── 阶段 3：pack 到网格 ──
    result: List[dict] = []

    # pair groups → 4x4
    for pair, beats in pair_groups:
        # 按 beat_number 排序保持顺序
        beats.sort(key=lambda b: b.get("beat_number", 0))
        result.extend(_flush_to_grids(beats, len(pair)))

    # overflow → 批量 flush，让 pack_beats 自动打包
    if overflow_beats:
        overflow_beats.sort(key=lambda b: b.get("beat_number", 0))
        max_cc = max(
            len(_get_beat_visual_composite_chars(ob, character_map))
            for ob in overflow_beats
        )
        result.extend(_flush_to_grids(overflow_beats, max_cc))

    # 按首个 beat_number 排序
    result.sort(key=lambda g: g["beat_numbers"][0] if g["beat_numbers"] else 0)

    return result


def sketch_grid_split(total_beats: int) -> list[tuple[int, int]]:
    """Return one independent 1x1 generation unit for every Beat."""

    return [(1, 1)] * max(1, int(total_beats or 0))


def _coalesce_locations(location_groups):
    """按 · 前缀合并细粒度场景组为粗粒度。

    "家·客厅", "家·餐厅" → "家"
    无 · 的场景保持原样。保持首次出现顺序。
    """
    from collections import OrderedDict

    coarse: OrderedDict[str, list] = OrderedDict()
    for fine_loc, beats in location_groups.items():
        prefix = fine_loc.split("·")[0].split("・")[0].strip()
        if not prefix:
            prefix = fine_loc
        if prefix not in coarse:
            coarse[prefix] = []
        coarse[prefix].extend(beats)
    return coarse


# (capacity, mode_key, rows, cols) — 按 capacity 升序
SKETCH_NXN_MODES = get_sketch_nxn_modes()
