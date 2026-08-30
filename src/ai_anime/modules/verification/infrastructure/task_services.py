"""Shared task helpers for verification episode-level jobs."""

from __future__ import annotations

import logging
import json
import re
import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Any

from ai_anime.sqlite_store import SQLiteStore
from ai_anime.modules.project_workspace.public import ProjectContext

from .report_formatter import save_verify_report
from .utils import load_all_beats

logger = logging.getLogger(__name__)


ProgressCallback = Callable[[float, str], None]
LogCallback = Callable[[str], None]


def _notify(progress_callback: ProgressCallback | None, progress: float, task: str) -> None:
    if progress_callback is not None:
        progress_callback(progress, task)


def _log(log_callback: LogCallback | None, message: str) -> None:
    if log_callback is not None:
        log_callback(message)


async def _make_sqlite_store(username: str, project: str, output_dir: str) -> SQLiteStore:
    store = SQLiteStore(f"{username}/{project}", output_dir=output_dir)
    await store.initialize()
    await store.load_graph_state()
    return store


def _load_sketch_colors(project_dir: Path, episode_num: int, store: SQLiteStore) -> dict[str, str]:
    del project_dir
    try:
        return store.get_sketch_colors(episode_num) or {}
    except Exception:
        logger.exception("failed to load sketch_colors from SQLite")
        return {}


def _promote_selected_sketches(
    *,
    project_dir: Path,
    episode_num: int,
    grids_dir: Path,
    pool: Any,
    beat_results: list[dict[str, Any]],
) -> int:
    sketches_dir = project_dir / "sketches" / f"ep{episode_num:03d}"
    sketches_dir.mkdir(parents=True, exist_ok=True)

    promoted = 0
    for row in beat_results:
        if row.get("recommended_action") != "accept":
            continue
        pool_id = row.get("selected_pool_id")
        if not pool_id:
            continue
        cell_path = pool.get_cell_path(pool_id)
        if not cell_path:
            continue
        src = grids_dir / cell_path
        if not src.exists():
            continue
        dst = sketches_dir / f"beat_{int(row['beat_number']):02d}.png"
        shutil.copy2(str(src), str(dst))
        promoted += 1
    return promoted


async def run_sketch_select_episode(
    *,
    username: str,
    project: str,
    project_dir: Path,
    output_dir: str,
    episode_num: int,
    quality_threshold: float,
    score_gap_for_auto_select: float,
    color_prefilter: bool,
    fact_check: bool,
    promote_selected: bool,
    progress_callback: ProgressCallback | None = None,
    log_callback: LogCallback | None = None,
) -> dict[str, Any]:
    """Run the full sketch-select pipeline and persist its verify report."""

    _notify(progress_callback, 0.05, "加载项目数据")
    _log(log_callback, "加载 SQLiteStore 与 beats")
    store = await _make_sqlite_store(username, project, output_dir)
    try:
        beats = await load_all_beats(project_dir, episode_num, sqlite_store=store)

        _notify(progress_callback, 0.18, "加载候选池")
        from ai_anime.modules.production.public import load_pool_index

        grids_dir = project_dir / "grids" / f"ep{episode_num:03d}"
        pool = load_pool_index(grids_dir)
        if not pool:
            raise FileNotFoundError("No pool index found. Generate sketches first.")

        _notify(progress_callback, 0.28, "读取颜色映射")
        sketch_colors = _load_sketch_colors(project_dir, episode_num, store)

        _notify(progress_callback, 0.38, "运行草图择优")
        _log(log_callback, f"开始草图择优: {len(beats)} beats")
        from .sketch_selector import run_sketch_select

        data = await run_sketch_select(
            project_dir=project_dir,
            episode_num=episode_num,
            beats=beats,
            pool_index=pool,
            sketch_colors=sketch_colors,
            quality_threshold=quality_threshold,
            score_gap_for_auto_select=score_gap_for_auto_select,
            color_prefilter=color_prefilter,
            fact_check=fact_check,
        )

        promoted = 0
        if promote_selected:
            _notify(progress_callback, 0.84, "提升已接受草图")
            promoted = _promote_selected_sketches(
                project_dir=project_dir,
                episode_num=episode_num,
                grids_dir=grids_dir,
                pool=pool,
                beat_results=data.get("beat_results", []),
            )
            if promoted:
                _log(log_callback, f"已提升 {promoted} 张 accept 草图到 sketches/")

        data["promoted_count"] = promoted

        _notify(progress_callback, 0.96, "保存验证报告")
        report_path = save_verify_report(
            project_dir, episode_num, None, "sketch_select", data
        )
        data["report_path"] = report_path.relative_to(project_dir).as_posix()
        _log(log_callback, f"草图择优完成，报告已保存: {data['report_path']}")

        _notify(progress_callback, 1.0, "完成")
        return data
    finally:
        await store.close()


async def _context_store(context: ProjectContext) -> SQLiteStore:
    from ai_anime.shared.infrastructure.project_stores import (
        make_sqlite_store_for_context,
    )

    return await make_sqlite_store_for_context(context)


async def _beat(store: SQLiteStore, episode: int, beat_num: int) -> dict[str, Any]:
    beats = await store.get_beats_as_dicts(episode)
    for beat in beats:
        if int(beat.get("beat_number") or 0) == beat_num:
            return beat
    raise IndexError(f"Beat {beat_num} not found in episode {episode}")


async def run_verification_model_operation(
    *,
    context: ProjectContext,
    operation: str,
    episode: int,
    beat_num: int | None,
    payload: dict[str, Any],
    progress_callback: ProgressCallback | None = None,
    log_callback: LogCallback | None = None,
) -> dict[str, Any]:
    """Execute one queued visual/text verification operation."""

    project_dir = Path(context.output_dir)
    if operation == "sketch_select":
        return await run_sketch_select_episode(
            username=context.owner_username,
            project=context.project_name,
            project_dir=project_dir,
            output_dir=str(context.output_dir),
            episode_num=episode,
            quality_threshold=float(payload.get("quality_threshold") or 7.0),
            score_gap_for_auto_select=float(
                payload.get("score_gap_for_auto_select") or 1.0
            ),
            color_prefilter=bool(payload.get("color_prefilter", True)),
            fact_check=bool(payload.get("fact_check", True)),
            promote_selected=bool(payload.get("promote_selected", False)),
            progress_callback=progress_callback,
            log_callback=log_callback,
        )

    store = await _context_store(context)
    try:
        _notify(progress_callback, 0.08, "加载验证素材")
        if operation == "beat_verify":
            return await _run_beat_verify(
                project_dir, store, episode, int(beat_num or 0), payload
            )
        if operation == "frame_verify":
            return await _run_frame_verify(
                project_dir, store, episode, int(beat_num or 0)
            )
        if operation == "score_beat":
            return await _run_score_beat(
                project_dir, store, episode, int(beat_num or 0), payload
            )
        if operation == "score_batch":
            return await _run_score_batch(project_dir, store, episode, payload)
        if operation == "compare_beat":
            return await _run_compare_beat(
                project_dir, store, episode, int(beat_num or 0), payload
            )
        if operation == "consistency":
            return await _run_consistency(project_dir, store, episode, payload)
        if operation == "continuity":
            return await _run_continuity(project_dir, store, episode, payload)
        if operation == "episode_overview":
            return await _run_episode_overview(project_dir, store, episode)
        raise ValueError(f"Unsupported verification operation: {operation}")
    finally:
        await store.close()


async def _run_beat_verify(
    project_dir: Path,
    store: SQLiteStore,
    episode: int,
    beat_num: int,
    payload: dict[str, Any],
) -> dict[str, Any]:
    from .image_verifier import ImageVerifier, resolve_verification_scene_context
    from .report_formatter import format_verification_report
    from .utils import find_frame_for_beat, find_sketch_for_beat

    beat = await _beat(store, episode, beat_num)
    verify_type = str(payload.get("verify_type") or "sketch")
    image_path = (
        find_sketch_for_beat(project_dir, episode, beat_num)
        if verify_type == "sketch"
        else find_frame_for_beat(project_dir, episode, beat_num)
    )
    if image_path is None:
        raise FileNotFoundError(f"No {verify_type} image found for beat {beat_num}")
    color_mapping = store.get_sketch_colors(episode) or {}
    scenes = await store.list_scenes()
    visual_desc = str(beat.get("visual_description") or "")
    scene_context = resolve_verification_scene_context(
        project_dir,
        beat,
        episode_number=episode,
        scenes=scenes,
    )
    result = await ImageVerifier().verify_sketch(
        str(image_path),
        visual_desc,
        re.findall(r"\{\{([^}]+)\}\}", visual_desc),
        scene_context["scene_id"],
        beat.get("time_of_day", ""),
        beat.get("keyframe_prompt") or beat.get("video_prompt", ""),
        color_mapping=color_mapping,
        resolved_scene_name=scene_context["resolved_scene_name"],
        time_baked=scene_context["time_baked"],
        prompt_time_of_day=scene_context["prompt_time_of_day"],
    )
    data = {
        **result.model_dump(),
        "beat_number": beat_num,
        "verify_type": verify_type,
        "image_path": image_path.relative_to(project_dir).as_posix(),
        "description_used": visual_desc,
    }
    data["report_text"] = format_verification_report(
        result.model_dump(), beat_num, verify_type
    )
    report_path = save_verify_report(
        project_dir, episode, beat_num, verify_type, data
    )
    data["report_path"] = report_path.relative_to(project_dir).as_posix()
    return data


async def _run_frame_verify(
    project_dir: Path,
    store: SQLiteStore,
    episode: int,
    beat_num: int,
) -> dict[str, Any]:
    from .frame_verifier import FrameVerifier
    from .report_formatter import format_verification_report
    from .utils import find_frame_for_beat, find_sketch_for_beat

    beat = await _beat(store, episode, beat_num)
    frame_path = find_frame_for_beat(project_dir, episode, beat_num)
    sketch_path = find_sketch_for_beat(project_dir, episode, beat_num)
    if frame_path is None or sketch_path is None:
        raise FileNotFoundError("首帧验证需要首帧和草图")
    project_style = ""
    config_path = project_dir / "config.json"
    if config_path.exists():
        project_style = str(
            json.loads(config_path.read_text(encoding="utf-8")).get(
                "visual_style", ""
            )
        )
    visual_desc = str(beat.get("visual_description") or "")
    result = await FrameVerifier().verify_frame(
        str(frame_path), str(sketch_path), visual_desc, project_style
    )
    data = {
        **result.model_dump(),
        "beat_number": beat_num,
        "verify_type": "frame",
        "frame_path": frame_path.relative_to(project_dir).as_posix(),
        "sketch_path": sketch_path.relative_to(project_dir).as_posix(),
        "description_used": visual_desc,
    }
    data["report_text"] = format_verification_report(
        result.model_dump(), beat_num, "frame"
    )
    report_path = save_verify_report(project_dir, episode, beat_num, "frame", data)
    data["report_path"] = report_path.relative_to(project_dir).as_posix()
    return data


def _pool(project_dir: Path, episode: int):
    from ai_anime.modules.production.public import load_pool_index

    grids_dir = project_dir / "grids" / f"ep{episode:03d}"
    pool = load_pool_index(grids_dir)
    if not pool:
        raise FileNotFoundError("No pool index found")
    return grids_dir, pool


async def _run_score_beat(
    project_dir: Path,
    store: SQLiteStore,
    episode: int,
    beat_num: int,
    payload: dict[str, Any],
) -> dict[str, Any]:
    from .sketch_scorer import SketchScorer
    from .utils import find_sketch_for_beat

    beat = await _beat(store, episode, beat_num)
    pool_id = str(payload.get("pool_id") or "")
    if pool_id:
        grids_dir, pool = _pool(project_dir, episode)
        cell_path = pool.get_cell_path(pool_id)
        image_path = grids_dir / cell_path if cell_path else None
    else:
        image_path = find_sketch_for_beat(project_dir, episode, beat_num)
    if image_path is None or not image_path.exists():
        raise FileNotFoundError(f"No sketch found for beat {beat_num}")
    result = await SketchScorer().score_sketch(
        str(image_path),
        beat.get("visual_description", ""),
        color_mapping=store.get_sketch_colors(episode) or {},
    )
    data = {
        "beat_number": beat_num,
        "pool_id": pool_id or "latest",
        **result.model_dump(),
    }
    report_path = save_verify_report(project_dir, episode, beat_num, "score", data)
    data["report_path"] = report_path.relative_to(project_dir).as_posix()
    return data


async def _run_score_batch(
    project_dir: Path,
    store: SQLiteStore,
    episode: int,
    payload: dict[str, Any],
) -> dict[str, Any]:
    from .sketch_scorer import SketchScorer
    from .utils import find_sketch_for_beat, load_all_beats

    beats = await load_all_beats(project_dir, episode, sqlite_store=store)
    grids_dir, pool = _pool(project_dir, episode)
    requested = payload.get("beat_numbers") or []
    target_beats = requested or list(range(1, len(beats) + 1))
    color_mapping = store.get_sketch_colors(episode) or {}
    scorer = SketchScorer()
    beat_results: list[dict[str, Any]] = []
    for number in target_beats:
        beat_number = int(number)
        if beat_number < 1 or beat_number > len(beats):
            continue
        if bool(payload.get("score_all_candidates", True)):
            candidates = pool.filter_by_beat_and_type(beat_number, "sketch")
        else:
            selected = find_sketch_for_beat(project_dir, episode, beat_number)
            candidates = [("latest", selected)] if selected else []
        scored: list[dict[str, Any]] = []
        for candidate in candidates:
            if isinstance(candidate, tuple):
                candidate_id, path = candidate
            else:
                candidate_id = candidate.id
                path = grids_dir / candidate.cell_path if candidate.cell_path else None
            if path is None or not path.exists():
                continue
            result = await scorer.score_sketch(
                str(path),
                beats[beat_number - 1].get("visual_description", ""),
                color_mapping=color_mapping,
            )
            scored.append({"pool_id": candidate_id, **result.model_dump()})
        beat_results.append({"beat_number": beat_number, "candidates": scored})
    return {"beat_results": beat_results}


async def _run_compare_beat(
    project_dir: Path,
    store: SQLiteStore,
    episode: int,
    beat_num: int,
    payload: dict[str, Any],
) -> dict[str, Any]:
    from .sketch_comparer import SketchComparer

    pool_ids = [str(value) for value in payload.get("pool_ids") or []]
    if len(pool_ids) < 2:
        raise ValueError("At least 2 pool_ids required for comparison")
    beat = await _beat(store, episode, beat_num)
    grids_dir, pool = _pool(project_dir, episode)

    def path_for(pool_id: str) -> Path:
        cell_path = pool.get_cell_path(pool_id)
        if not cell_path:
            raise FileNotFoundError(f"pool_id {pool_id} not found")
        return grids_dir / cell_path

    candidates = [(pool_id, str(path_for(pool_id))) for pool_id in pool_ids]
    references = [
        str(path_for(str(pool_id)))
        for pool_id in payload.get("reference_pool_ids") or []
    ]
    result = await SketchComparer().compare_sketches(
        candidates,
        beat.get("visual_description", ""),
        reference_paths=references or None,
    )
    selected = (
        pool_ids[result.selected_index - 1]
        if 1 <= result.selected_index <= len(pool_ids)
        else ""
    )
    return {
        "beat_number": beat_num,
        "selected_pool_id": selected,
        "ranking": [row.model_dump() for row in result.ranking],
        "comparison_summary": result.comparison_summary,
    }


async def _run_consistency(
    project_dir: Path,
    store: SQLiteStore,
    episode: int,
    payload: dict[str, Any],
) -> dict[str, Any]:
    from .consistency_verifier import ConsistencyVerifier
    from .report_formatter import format_consistency_report

    verify_type = str(payload.get("verify_type") or "sketch")
    data = await ConsistencyVerifier().verify_consistency(
        project_dir, episode, verify_type=verify_type, sqlite_store=store
    )
    report_type = "frame_consistency" if verify_type == "frame" else "consistency"
    data["report_text"] = format_consistency_report(data, episode)
    report_path = save_verify_report(project_dir, episode, None, report_type, data)
    data["report_path"] = report_path.relative_to(project_dir).as_posix()
    return data


async def _run_continuity(
    project_dir: Path,
    store: SQLiteStore,
    episode: int,
    payload: dict[str, Any],
) -> dict[str, Any]:
    from .continuity_verifier import ContinuityVerifier

    beat_range = payload.get("beat_range") or []
    data = await ContinuityVerifier().verify_continuity(
        project_dir,
        episode,
        beat_range=beat_range or None,
        window_size=int(payload.get("window_size") or 2),
        sqlite_store=store,
    )
    report_path = save_verify_report(project_dir, episode, None, "continuity", data)
    data["report_path"] = report_path.relative_to(project_dir).as_posix()
    return data


async def _run_episode_overview(
    project_dir: Path,
    store: SQLiteStore,
    episode: int,
) -> dict[str, Any]:
    from .episode_reviewer import EpisodeReviewer
    from .report_formatter import format_episode_overview_report

    data = await EpisodeReviewer().review_episode(
        project_dir, episode, sqlite_store=store
    )
    data["report_text"] = format_episode_overview_report(data, episode)
    report_path = save_verify_report(
        project_dir, episode, None, "episode_overview", data
    )
    data["report_path"] = report_path.relative_to(project_dir).as_posix()
    return data
