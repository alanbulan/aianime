"""Sketch scoring, comparison, selection, and color-check endpoints."""

import logging
import shutil

from fastapi import APIRouter, Depends

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.deps import make_sqlite_store_for_context
from ai_anime.api.routes.verification.dependencies import (
    load_beat_data,
    resolve_verification_project,
)
from ai_anime.modules.verification.public import (
    ColorVerifyRequest,
    CompareRequest,
    ScoreBatchRequest,
    SketchComparer,
    SketchScoreRequest,
    SketchScorer,
    SketchSelectRequest,
    find_sketch_for_beat,
    format_color_verify_report,
    load_all_beats,
    run_sketch_select,
    save_verify_report,
    verify_episode_sketch_colors,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/projects/{project}/episodes/{episode_num}/beats/{beat_num}/score")
async def score_beat(
    project: str,
    episode_num: int,
    beat_num: int,
    body: SketchScoreRequest = SketchScoreRequest(),
    user: dict = Depends(get_api_user),
):
    """T3: 对单个 beat 的草图进行内容匹配评分。"""
    resolved = await resolve_verification_project(project, user, required_role="viewer")
    project_dir = resolved.project_dir
    logger.info("score_beat: project=%s ep=%d beat=%d", project, episode_num, beat_num)
    store = await make_sqlite_store_for_context(resolved.ctx)

    try:
        beat = await load_beat_data(store, episode_num, beat_num)
    except (FileNotFoundError, IndexError) as e:
        return {"ok": False, "error": str(e)}

    # 找到草图（支持指定 pool_id）
    if body.pool_id:
        from ai_anime.modules.production.public import load_pool_index

        grids_dir = project_dir / "grids" / f"ep{episode_num:03d}"
        pool = load_pool_index(grids_dir)
        if not pool:
            return {"ok": False, "error": "No pool index found"}
        cell_path = pool.get_cell_path(body.pool_id)
        if not cell_path:
            return {"ok": False, "error": f"pool_id {body.pool_id} not found"}
        image_path = grids_dir / cell_path
        if not image_path.exists():
            return {"ok": False, "error": f"Image file not found: {cell_path}"}
    else:
        image_path = find_sketch_for_beat(project_dir, episode_num, beat_num)
        if not image_path:
            return {"ok": False, "error": f"No sketch found for beat {beat_num}"}

    # 路径安全检查
    if not image_path.resolve().is_relative_to(project_dir.resolve()):
        return {"ok": False, "error": "Image path outside project directory"}

    # 加载颜色映射
    color_mapping: dict[str, str] = {}
    try:
        color_mapping = store.get_sketch_colors(episode_num) or {}
    except Exception as e:
        logger.debug("score_beat: 颜色映射读取失败，使用空映射: %s", e)

    scorer = SketchScorer()
    try:
        result = await scorer.score_sketch(
            str(image_path),
            beat.get("visual_description", ""),
            color_mapping=color_mapping,
        )
    except Exception as e:
        logger.error("score_beat failed: %s", e, exc_info=True)
        return {"ok": False, "error": str(e)}

    data = {
        "beat_number": beat_num,
        "pool_id": body.pool_id or "latest",
        **result.model_dump(),
    }

    report_path = save_verify_report(project_dir, episode_num, beat_num, "score", data)
    data["report_path"] = report_path.relative_to(project_dir).as_posix()

    return {"ok": True, "data": data}


@router.post("/projects/{project}/episodes/{episode_num}/beats/score-batch")
async def score_batch(
    project: str,
    episode_num: int,
    body: ScoreBatchRequest = ScoreBatchRequest(),
    user: dict = Depends(get_api_user),
):
    """T3 批量: 对指定 beat 的所有候选草图打分。"""
    resolved = await resolve_verification_project(project, user, required_role="viewer")
    project_dir = resolved.project_dir
    logger.info(
        "score_batch: project=%s ep=%d beats=%s",
        project,
        episode_num,
        body.beat_numbers,
    )

    try:
        store = await make_sqlite_store_for_context(resolved.ctx)
        beats = await load_all_beats(project_dir, episode_num, sqlite_store=store)
    except FileNotFoundError as e:
        return {"ok": False, "error": str(e)}

    color_mapping: dict[str, str] = {}
    try:
        color_mapping = store.get_sketch_colors(episode_num) or {}
    except Exception as e:
        logger.debug("score_batch: 颜色映射读取失败，使用空映射: %s", e)

    from ai_anime.modules.production.public import load_pool_index

    grids_dir = project_dir / "grids" / f"ep{episode_num:03d}"
    pool = load_pool_index(grids_dir)
    if not pool:
        return {"ok": False, "error": "No pool index found"}

    target_beats = (
        body.beat_numbers if body.beat_numbers else list(range(1, len(beats) + 1))
    )
    scorer = SketchScorer()
    beat_results = []

    for beat_num in target_beats:
        if beat_num < 1 or beat_num > len(beats):
            continue
        beat = beats[beat_num - 1]
        visual_desc = beat.get("visual_description", "")

        # 获取候选
        if body.score_all_candidates:
            candidates = pool.filter_by_beat_and_type(beat_num, "sketch")
        else:
            candidates = []
            sketch_path = find_sketch_for_beat(project_dir, episode_num, beat_num)
            if sketch_path:
                candidates = [
                    type(
                        "Img",
                        (),
                        {
                            "id": "latest",
                            "cell_path": sketch_path.relative_to(grids_dir).as_posix(),
                        },
                    )()
                ]

        scored = []
        for img in candidates:
            cell_path = grids_dir / img.cell_path if img.cell_path else None
            if not cell_path or not cell_path.exists():
                continue
            try:
                result = await scorer.score_sketch(
                    str(cell_path), visual_desc, color_mapping=color_mapping
                )
                scored.append(
                    {
                        "pool_id": img.id,
                        **result.model_dump(),
                    }
                )
            except Exception as e:
                logger.warning(
                    "Score failed for pool %s beat %d: %s", img.id, beat_num, e
                )

        beat_results.append(
            {
                "beat_number": beat_num,
                "candidates": scored,
            }
        )

    return {"ok": True, "data": {"beat_results": beat_results}}


@router.post("/projects/{project}/episodes/{episode_num}/beats/{beat_num}/compare")
async def compare_beat(
    project: str,
    episode_num: int,
    beat_num: int,
    body: CompareRequest,
    user: dict = Depends(get_api_user),
):
    """T4: 对比多张候选草图，选择最佳。"""
    resolved = await resolve_verification_project(project, user, required_role="viewer")
    project_dir = resolved.project_dir
    logger.info(
        "compare_beat: project=%s ep=%d beat=%d pools=%s",
        project,
        episode_num,
        beat_num,
        body.pool_ids,
    )

    if len(body.pool_ids) < 2:
        return {"ok": False, "error": "At least 2 pool_ids required for comparison"}

    store = await make_sqlite_store_for_context(resolved.ctx)
    try:
        beat = await load_beat_data(store, episode_num, beat_num)
    except (FileNotFoundError, IndexError) as e:
        return {"ok": False, "error": str(e)}

    from ai_anime.modules.production.public import load_pool_index

    grids_dir = project_dir / "grids" / f"ep{episode_num:03d}"
    pool = load_pool_index(grids_dir)
    if not pool:
        return {"ok": False, "error": "No pool index found"}

    # 解析候选路径
    candidate_paths: list[tuple[str, str]] = []
    for pool_id in body.pool_ids:
        cell_path = pool.get_cell_path(pool_id)
        if not cell_path:
            return {"ok": False, "error": f"pool_id {pool_id} not found"}
        full_path = grids_dir / cell_path
        if not full_path.exists():
            return {"ok": False, "error": f"Image file not found: {cell_path}"}
        candidate_paths.append((pool_id, str(full_path)))

    # 解析参考图路径
    reference_paths: list[str] = []
    for ref_id in body.reference_pool_ids:
        cell_path = pool.get_cell_path(ref_id)
        if cell_path:
            full_path = grids_dir / cell_path
            if full_path.exists():
                reference_paths.append(str(full_path))

    comparer = SketchComparer()
    try:
        result = await comparer.compare_sketches(
            candidate_paths,
            beat.get("visual_description", ""),
            reference_paths=reference_paths if reference_paths else None,
        )
    except Exception as e:
        logger.error("compare_beat failed: %s", e, exc_info=True)
        return {"ok": False, "error": str(e)}

    # 映射 selected_index → selected_pool_id
    selected_pool_id = ""
    if 1 <= result.selected_index <= len(body.pool_ids):
        selected_pool_id = body.pool_ids[result.selected_index - 1]

    data = {
        "beat_number": beat_num,
        "selected_pool_id": selected_pool_id,
        "ranking": [r.model_dump() for r in result.ranking],
        "comparison_summary": result.comparison_summary,
    }

    return {"ok": True, "data": data}


@router.post("/projects/{project}/episodes/{episode_num}/verify/sketch-select")
async def sketch_select(
    project: str,
    episode_num: int,
    body: SketchSelectRequest = SketchSelectRequest(),
    user: dict = Depends(get_api_user),
):
    """编排端点: 一站式草图择优 — 加载候选 → T1/T2 淘汰 → T3 评分 → T4 对比 → 输出选择。"""
    resolved = await resolve_verification_project(project, user, required_role="viewer")
    project_dir = resolved.project_dir
    logger.info("sketch_select: project=%s ep=%d", project, episode_num)

    # 加载 beats
    try:
        store = await make_sqlite_store_for_context(resolved.ctx)
        beats = await load_all_beats(project_dir, episode_num, sqlite_store=store)
    except FileNotFoundError as e:
        return {"ok": False, "error": str(e)}

    # 加载 pool index
    from ai_anime.modules.production.public import load_pool_index

    grids_dir = project_dir / "grids" / f"ep{episode_num:03d}"
    pool = load_pool_index(grids_dir)
    if not pool:
        return {"ok": False, "error": "No pool index found. Generate sketches first."}

    # 加载颜色映射
    sketch_colors: dict[str, str] = {}
    try:
        sketch_colors = store.get_sketch_colors(episode_num) or {}
    except Exception:
        logger.exception("failed to load sketch_colors from SQLite")

    # 执行编排
    try:
        data = await run_sketch_select(
            project_dir=project_dir,
            episode_num=episode_num,
            beats=beats,
            pool_index=pool,
            sketch_colors=sketch_colors,
            quality_threshold=body.quality_threshold,
            score_gap_for_auto_select=body.score_gap_for_auto_select,
            color_prefilter=body.color_prefilter,
            fact_check=body.fact_check,
        )
    except Exception as e:
        logger.error("sketch_select failed: %s", e, exc_info=True)
        return {"ok": False, "error": str(e)}

    promoted = 0
    if body.promote_selected:
        sketches_dir = project_dir / "sketches" / f"ep{episode_num:03d}"
        sketches_dir.mkdir(parents=True, exist_ok=True)
        for br in data.get("beat_results", []):
            if br.get("recommended_action") != "accept":
                continue
            pool_id = br.get("selected_pool_id")
            if not pool_id:
                continue
            cell_path = pool.get_cell_path(pool_id)
            if not cell_path:
                continue
            src = grids_dir / cell_path
            if src.exists():
                dst = sketches_dir / f"beat_{br['beat_number']:02d}.png"
                shutil.copy2(str(src), str(dst))
                promoted += 1
        if promoted:
            logger.info(
                "sketch_select: promoted %d accepted sketches to %s",
                promoted,
                sketches_dir,
            )
    data["promoted_count"] = promoted

    report_path = save_verify_report(
        project_dir, episode_num, None, "sketch_select", data
    )
    data["report_path"] = report_path.relative_to(project_dir).as_posix()

    return {"ok": True, "data": data}


@router.post("/projects/{project}/episodes/{episode_num}/verify/sketch-colors")
async def verify_sketch_colors(
    project: str,
    episode_num: int,
    body: ColorVerifyRequest = ColorVerifyRequest(),
    user: dict = Depends(get_api_user),
):
    """Step 12.4: 草图颜色交叉验证 — 检测草图中角色颜色是否与剧本预期一致。"""
    resolved = await resolve_verification_project(project, user, required_role="viewer")
    project_dir = resolved.project_dir
    logger.info("verify_sketch_colors: project=%s ep=%d", project, episode_num)

    # 1. 加载 beats
    try:
        store = await make_sqlite_store_for_context(resolved.ctx)
        beats = await load_all_beats(project_dir, episode_num, sqlite_store=store)
    except FileNotFoundError as e:
        return {"ok": False, "error": str(e)}
    except Exception as e:
        logger.error("verify_sketch_colors: failed to load beats: %s", e, exc_info=True)
        return {"ok": False, "error": str(e)}

    # 2. 加载 sketch_colors
    sketch_colors: dict[str, str] = {}
    try:
        sketch_colors = store.get_sketch_colors(episode_num) or {}
    except Exception:
        logger.exception("failed to load sketch_colors from SQLite")

    if not sketch_colors:
        return {
            "ok": False,
            "error": "No sketch_colors found. Run Step 12.3 (assign-colors) first.",
        }

    # 3. 执行验证
    try:
        result = verify_episode_sketch_colors(
            project_dir,
            episode_num,
            beats,
            sketch_colors,
            missing_threshold=body.missing_threshold,
            extra_threshold=body.extra_threshold,
        )
    except Exception as e:
        logger.error("verify_sketch_colors failed: %s", e, exc_info=True)
        return {"ok": False, "error": str(e)}

    # 4. 格式化报告 + 持久化
    data = result.model_dump()
    data["report_text"] = format_color_verify_report(data, episode_num)
    report_path = save_verify_report(
        project_dir, episode_num, None, "sketch_colors", data
    )
    data["report_path"] = report_path.relative_to(project_dir).as_posix()

    return {"ok": True, "data": data}
