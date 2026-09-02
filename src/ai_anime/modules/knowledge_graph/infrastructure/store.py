"""AI anime 统一存储层 - SQLite + Cognee。

核心理念：
- 结构化数据（Character, Episode, VisualBeat）存入 SQLite
- 知识图谱 + 向量检索由 Cognee（Kuzu）管理
- 每个项目 = 文件系统上的一个目录，零远程依赖
"""

import asyncio
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date, datetime
from pathlib import Path
from threading import Lock
from typing import Awaitable, Callable, Dict, List, Optional, Any, Iterable
import json
from importlib import import_module
from uuid import UUID

# 重要：必须先导入 config，在 cognee 被导入之前设置环境变量
from .config import (  # noqa: F401
    apply_cognee_project_storage_context,
    init_cognee,
    reset_cognee_model_call_activity_callback,
    set_cognee_model_call_activity_callback,
)

from ai_anime.shared.env_guard import preserve_st_env

with preserve_st_env():
    import cognee
    from cognee.api.v1.search import SearchType
    from cognee.modules.engine.operations.setup import setup
    from cognee.modules.migrations.startup import apply_all_migrations
from rich.console import Console
from ai_anime.modules.model_usage.public import get_model_reasoning_kwargs
from ai_anime.modules.model_usage.public import DEFAULT_COGNEE_EMBEDDING_DIM
from ai_anime.sqlite_store import SQLiteStore
from ai_anime.shared.infrastructure.project_sqlite_graph_state import (
    ProjectSQLiteGraphStateMixin,
)
from ai_anime.shared.utils.document_parsers import load_novel_text

from ai_anime.modules.production.public import (
    build_episode_identity_alias_map,
    canonicalize_visual_identity_markers,
    complete_detected_refs_from_visual_description,
    normalize_detected_identities,
    normalize_detected_props,
)
from ai_anime.modules.asset_world.public import (
    CharacterIdentity,
    NovelCharacter,
    NovelProp,
    NovelScene,
)
from ai_anime.modules.narrative_planning.public import (
    NovelEpisode,
    NovelEvent,
    NovelVisualBeat,
    PropMenuItem,
    SceneMenuItem,
    build_prop_menu,
    build_scene_menu,
    sync_beat_asset_refs,
)

console = Console()
logger = logging.getLogger(__name__)
_cognee_initialized_state_dirs: set[str] = set()
_cognee_initialization_lock = Lock()


@asynccontextmanager
async def _cognee_initialization_guard() -> AsyncIterator[None]:
    """Serialize Cognee setup across worker threads and event loops."""
    while not _cognee_initialization_lock.acquire(blocking=False):
        await asyncio.sleep(0.01)

    try:
        yield
    finally:
        _cognee_initialization_lock.release()


def _json_list_payload(values: list[str]) -> str:
    return json.dumps(list(values or []), ensure_ascii=False)


# ============================================================
# 路径计算工具函数 — canonical implementation lives in utils.path_resolver.
# ============================================================
from ai_anime.shared.utils.path_resolver import (  # noqa: F401
    compute_portrait_path,
    compute_scene_reference_path,
    compute_prop_reference_path,
)


class CogneeStore(ProjectSQLiteGraphStateMixin):
    """统一存储层 - SQLite + Cognee。

    使用方式：
        store = CogneeStore("hongloumeng")
        await store.initialize()

        # 导入小说并提取角色
        await store.ingest_and_extract(novel_path)

        # 查询角色（支持别名）
        char = await store.get_character("皇后")  # 返回姜裳宁
        prompt = char.face_prompt  # 直接获取面部 Prompt
    """

    def __init__(
        self,
        project_name: str,
        output_dir: str | None = None,
        state_dir: str | None = None,
        sqlite_store: SQLiteStore | None = None,
        embedding_dimensions: int | None = None,
    ):
        self.project_name = project_name
        self.dataset_name = f"ai_anime_{project_name}"
        self._owns_sqlite_store = sqlite_store is None

        # 缓存（从 SQLite 加载）
        self._characters: Dict[str, NovelCharacter] = {}
        self._episodes: Dict[int, NovelEpisode] = {}
        self._props: Dict[str, NovelProp] = {}
        self._alias_index: Dict[str, str] = {}  # alias -> primary_name

        # 项目目录
        sqlite_project_dir = (
            str(getattr(sqlite_store, "project_dir", "") or "") if sqlite_store else ""
        )
        sqlite_state_dir = str(getattr(sqlite_store, "state_dir", "") or "") if sqlite_store else ""
        if output_dir:
            self.project_dir = output_dir
            if (
                sqlite_project_dir
                and Path(output_dir).resolve() != Path(sqlite_project_dir).resolve()
            ):
                raise ValueError(
                    "CogneeStore output_dir must match injected SQLiteStore project_dir: "
                    f"output_dir={output_dir}, sqlite_store.project_dir={sqlite_project_dir}"
                )
            os.makedirs(output_dir, exist_ok=True)
        elif sqlite_project_dir:
            self.project_dir = sqlite_project_dir
        else:
            from ai_anime.modules.project_workspace.public import ensure_project_dirs

            self.project_dir = ensure_project_dirs(project_name)["base"]

        if sqlite_state_dir:
            default_state_dir = Path(sqlite_state_dir)
        elif "/" in project_name:
            from ai_anime.shared.utils.project_paths import ProjectPaths

            parts = project_name.split("/", 1)
            paths = ProjectPaths(parts[0], parts[1])
            paths.bootstrap_from_legacy_output()
            default_state_dir = paths.state_dir
        else:
            default_state_dir = Path(self.project_dir)

        if (
            state_dir
            and sqlite_state_dir
            and Path(state_dir).resolve() != Path(sqlite_state_dir).resolve()
        ):
            raise ValueError(
                "CogneeStore state_dir must match injected SQLiteStore state_dir: "
                f"state_dir={state_dir}, sqlite_store.state_dir={sqlite_state_dir}"
            )
        if state_dir:
            resolved_state_dir = Path(state_dir)
        else:
            resolved_state_dir = default_state_dir

        resolved_state_dir.mkdir(parents=True, exist_ok=True)
        self.state_dir = str(resolved_state_dir)
        self.db_path = str(resolved_state_dir / "data.db")
        from ai_anime.modules.project_workspace.public import (
            load_project_config_file_from_state_dir,
        )

        project_config = load_project_config_file_from_state_dir(resolved_state_dir)
        configured_dimensions = (
            embedding_dimensions
            if embedding_dimensions is not None
            else project_config.get("knowledge_embedding_dimensions")
        )
        self.embedding_dimensions = int(
            configured_dimensions or DEFAULT_COGNEE_EMBEDDING_DIM
        )
        self.sqlite_store = sqlite_store or SQLiteStore(
            project_name,
            output_dir=str(self.project_dir),
            state_dir=self.state_dir,
        )
        self._share_sqlite_caches()

        # 立即设置 Cognee 上下文
        self._set_cognee_context()

    def __getattr__(self, name: str):
        """Lazily restore SQLiteStore for legacy/test objects built via __new__."""
        # TODO: remove this legacy __new__ compatibility path after old tests and
        # ad-hoc scripts construct CogneeStore through __init__ consistently.
        if name == "sqlite_store":
            return self._ensure_sqlite_store()
        raise AttributeError(f"{type(self).__name__!s} object has no attribute {name!r}")

    @property
    def _db(self):
        """Legacy read-only alias; the connection is owned by SQLiteStore."""
        return getattr(self._ensure_sqlite_store(), "_db", None)

    @_db.setter
    def _db(self, value) -> None:
        """Legacy assignment sink for tests/scripts that construct via __new__."""
        if value is not None:
            self._ensure_sqlite_store()._db = value

    def _ensure_sqlite_store(self) -> SQLiteStore:
        """Return the project SQLiteStore, creating it for legacy objects if needed."""
        if "_characters" not in self.__dict__:
            self._characters = {}
        if "_episodes" not in self.__dict__:
            self._episodes = {}
        if "_props" not in self.__dict__:
            self._props = {}
        if "_alias_index" not in self.__dict__:
            self._alias_index = {}
        if "_owns_sqlite_store" not in self.__dict__:
            self._owns_sqlite_store = True
        store = self.__dict__.get("sqlite_store")
        if store is not None:
            return store

        project_name = self.__dict__.get("project_name", "")
        project_dir = self.__dict__.get("project_dir", "")
        if not project_dir:
            from ai_anime.modules.project_workspace.public import ensure_project_dirs

            project_dir = ensure_project_dirs(project_name)["base"]
            self.project_dir = project_dir

        state_dir = self.__dict__.get("state_dir")
        if not state_dir:
            db_path = self.__dict__.get("db_path")
            state_dir = str(Path(db_path).parent) if db_path else str(project_dir)
            self.state_dir = state_dir
        if "db_path" not in self.__dict__:
            self.db_path = str(Path(state_dir) / "data.db")

        store = SQLiteStore(project_name, output_dir=str(project_dir), state_dir=str(state_dir))
        self.__dict__["sqlite_store"] = store
        self._share_sqlite_caches()
        return store

    def _share_sqlite_caches(self) -> None:
        """让 SQLiteStore 和当前 store 共享同一组内存缓存。"""
        store = self.__dict__.get("sqlite_store")
        if store is None:
            return
        store._characters = self._characters
        store._episodes = self._episodes
        store._props = self._props
        store._alias_index = self._alias_index

    def _sync_sqlite_caches(self) -> None:
        """Restore shared cache references if a legacy caller replaced one."""
        store = self._ensure_sqlite_store()
        if self._characters is not store._characters:
            self._characters = store._characters
        if self._episodes is not store._episodes:
            self._episodes = store._episodes
        if self._props is not store._props:
            self._props = store._props
        if self._alias_index is not store._alias_index:
            self._alias_index = store._alias_index

    def _set_cognee_context(self, verbose: bool = False) -> None:
        """设置 Cognee 的数据库上下文为当前项目。

        切换 Cognee system/data 路径，
        确保多项目切换时 search() 和 cognify() 都指向正确的项目。
        """
        cognee_system_dir, cognee_data_dir = apply_cognee_project_storage_context(
            self.state_dir,
            cognee,
        )
        if verbose:
            logger.debug(
                "Cognee context：project=%s project_dir=%s system_root=%s data_root=%s",
                self.project_name,
                self.project_dir,
                cognee_system_dir,
                cognee_data_dir,
            )

    @staticmethod
    def _ensure_pipeline_run_succeeded(result, stage_name: str) -> None:
        """Treat Cognee pipeline Errored/Failed results as task failures."""

        def truncate(value: Any, limit: int = 400) -> str:
            detail = str(value or "").strip() or "unknown error"
            if len(detail) > limit:
                detail = detail[:limit] + "..."
            return detail

        def read_field(value: Any, field_name: str, default: Any = None) -> Any:
            if isinstance(value, dict):
                return value.get(field_name, default)
            return getattr(value, field_name, default)

        def nested_pipeline_errors(run: Any) -> List[str]:
            nested_errors: List[str] = []
            data_ingestion_info = read_field(run, "data_ingestion_info") or []
            if not isinstance(data_ingestion_info, Iterable) or isinstance(
                data_ingestion_info, (str, bytes)
            ):
                return nested_errors

            for item in data_ingestion_info:
                run_info = read_field(item, "run_info")
                if run_info is None:
                    continue
                status = read_field(run_info, "status")
                status_text = str(getattr(status, "value", status) or "")
                if "error" not in status_text.lower() and "fail" not in status_text.lower():
                    continue
                payload = read_field(run_info, "payload")
                nested_errors.append(truncate(payload, limit=600))
            return nested_errors

        if isinstance(result, dict):
            runs = list(result.values())
        elif isinstance(result, (list, tuple, set)):
            runs = list(result)
        else:
            runs = [result]

        errors: List[str] = []
        for run in runs:
            if run is None:
                errors.append(f"{stage_name} 返回空结果")
                continue

            status = getattr(run, "status", None)
            payload = getattr(run, "payload", None)
            status_text = str(getattr(status, "value", status) or "")
            if "error" in status_text.lower() or "fail" in status_text.lower():
                detail = truncate(payload)
                nested = nested_pipeline_errors(run)
                if nested:
                    detail = f"{detail}; data item errors: " + " | ".join(nested[:3])
                errors.append(f"{stage_name}失败({status_text}): {detail}")

        if errors:
            raise RuntimeError("；".join(errors))

    async def _run_cognee_pipeline_with_retry(
        self,
        *,
        stage_name: str,
        operation: Callable[[], Awaitable[Any]],
        log: Callable[[str], None],
        report: Callable[[float, str], None] | None = None,
        progress_start: float = 0.0,
        progress_end: float = 1.0,
    ) -> Any:
        """Run one pipeline attempt without replaying remote model writes."""
        self._set_cognee_context()
        loop = asyncio.get_running_loop()
        started_at = loop.time()
        last_reported_at = 0.0
        current_progress = progress_start
        activity = {
            "text_completed": 0,
            "embedding_batches": 0,
            "embedding_items": 0,
            "in_flight": 0,
            "peak_in_flight": 0,
            "failed_calls": 0,
        }

        def publish_progress(*, force: bool = False) -> None:
            nonlocal last_reported_at, current_progress
            if report is None:
                return
            now = loop.time()
            if not force and now - last_reported_at < 1.0:
                return
            elapsed = max(0, int(now - started_at))
            completed_calls = activity["text_completed"] + activity["embedding_batches"]
            span = max(0.0, progress_end - progress_start)
            activity_gain = min(span * 0.72, completed_calls * 0.012)
            heartbeat_gain = min(span * 0.18, (elapsed // 5) * 0.004)
            current_progress = min(
                max(progress_start, progress_end - 0.01),
                max(current_progress, progress_start + 0.02 + activity_gain + heartbeat_gain),
            )
            report(
                current_progress,
                f"{stage_name}（阶段进度估算）：文本模型已完成 "
                f"{activity['text_completed']} 次，向量已完成 "
                f"{activity['embedding_batches']} 批/{activity['embedding_items']} 条，"
                f"活跃请求 {activity['in_flight']} 路，本阶段峰值并发 "
                f"{activity['peak_in_flight']} 路，失败请求 {activity['failed_calls']} 次",
            )
            last_reported_at = now

        def on_model_activity(kind: str, status: str, item_count: int) -> None:
            if status == "started":
                activity["in_flight"] += 1
                activity["peak_in_flight"] = max(
                    activity["peak_in_flight"],
                    activity["in_flight"],
                )
            else:
                activity["in_flight"] = max(0, activity["in_flight"] - 1)
            if status == "failed":
                activity["failed_calls"] += 1
            if status == "completed":
                if kind == "embedding":
                    activity["embedding_batches"] += 1
                    activity["embedding_items"] += item_count
                else:
                    activity["text_completed"] += 1
            first_completed_kind = status == "completed" and (
                (kind == "text" and activity["text_completed"] == 1)
                or (kind == "embedding" and activity["embedding_batches"] == 1)
            )
            publish_progress(force=first_completed_kind or status == "failed")

        async def publish_heartbeat() -> None:
            while True:
                await asyncio.sleep(5)
                publish_progress(force=True)

        activity_token = set_cognee_model_call_activity_callback(on_model_activity)
        heartbeat_task = asyncio.create_task(publish_heartbeat()) if report else None
        try:
            publish_progress(force=True)
            result = await operation()
            self._ensure_pipeline_run_succeeded(result, stage_name)
            return result
        finally:
            reset_cognee_model_call_activity_callback(activity_token)
            if heartbeat_task is not None:
                heartbeat_task.cancel()
                try:
                    await heartbeat_task
                except asyncio.CancelledError:
                    pass

    async def _ensure_db(self):
        """确保数据库连接已建立。

        SQLite lifecycle and project-fact schema are owned by SQLiteStore.
        CogneeStore does not hold a raw SQLite connection.
        """
        store = self._ensure_sqlite_store()
        return await store._ensure_db()

    async def _initialize_cognee_storage(self) -> None:
        """Migrate and initialize the current project-local Cognee database."""
        state_key = str(Path(self.state_dir).resolve())
        async with _cognee_initialization_guard():
            # Cognee keeps storage paths in process-global configuration. Apply
            # the project context while holding the initialization lock so a
            # concurrent project cannot redirect Alembic midway through setup.
            self._set_cognee_context(verbose=True)
            if state_key not in _cognee_initialized_state_dirs:
                await apply_all_migrations("head")
                _cognee_initialized_state_dirs.add(state_key)

            try:
                await setup()
            except Exception as exc:
                # Cognee 0.5.3 could race on repeated CREATE TABLE data calls.
                if "already exists" not in str(exc):
                    raise

    async def initialize(self):
        """初始化 SQLite 数据库和 Cognee 配置。"""
        self._init_cognee()

        # 初始化项目 SQLite；Cognee 图谱上下文独立设置。
        await self._ensure_db()

        # 先升级已有 Cognee schema，再执行幂等 setup。create_all 只能创建表，
        # 无法为旧表补列；Cognee 1.5.x 的 dataset_database 新字段必须走 Alembic。
        await self._initialize_cognee_storage()

        # 确保当前用户拥有该 dataset
        with preserve_st_env():
            from cognee.modules.pipelines.layers.resolve_authorized_user_datasets import (
                resolve_authorized_user_datasets,
            )

        try:
            await resolve_authorized_user_datasets(datasets=self.dataset_name)
        except Exception as e:
            if "UNIQUE constraint failed: datasets.id" in str(e):
                pass
            else:
                console.print(f"[yellow]⚠️ dataset 权限注册失败（非致命）: {e}[/yellow]")

        console.print(
            f"[dim]存储层已初始化 (dataset: {self.dataset_name}, db: {self.db_path})[/dim]"
        )

    def _init_cognee(self) -> None:
        init_cognee(
            embedding_dimensions=self.embedding_dimensions,
        )

    def _configured_text_transport_model(self) -> str:
        self._init_cognee()
        model = os.environ.get("LLM_MODEL", "").strip()
        if not model:
            raise RuntimeError("Cognee text model was not configured")
        return model

    async def close(self) -> None:
        """Release project-scoped SQLite and Cognee graph resources."""
        if self.__dict__.get("_owns_sqlite_store", True):
            await self._ensure_sqlite_store().close()
        self._release_cognee_graph_engine()

    @staticmethod
    def _release_cognee_graph_engine() -> None:
        """Close Cognee's cached graph engine so worker processes release file locks."""
        try:
            graph_engine_module = import_module(
                "cognee.infrastructure.databases.graph.get_graph_engine"
            )
        except Exception:
            return

        cached_factory = getattr(graph_engine_module, "_create_graph_engine", None)
        cache_clear = getattr(cached_factory, "cache_clear", None)
        if callable(cache_clear):
            # closing_lru_cache owns async adapter shutdown. On a running API
            # loop cache_clear schedules it safely in the background; waiting
            # here would hold the HTTP dependency teardown (and /healthz) for
            # tens of seconds after the response data is already ready.
            cache_clear()

    # ============================================================
    # 内容存储（替代 Redis）
    # ============================================================

    def save_novel_content(self, content: str) -> None:
        """将小说原文保存到文件。"""
        self.sqlite_store.save_novel_content(content)
        novel_path = Path(self.project_dir) / "novel.txt"
        logger.info("原文已保存：%s（%s 字符）", novel_path, len(content))

    def load_novel_content(self) -> Optional[str]:
        """从文件加载小说原文。"""
        return self.sqlite_store.load_novel_content()

    async def save_episode_content(self, ep_num: int, content: str) -> None:
        """保存单集内容到 SQLite episodes.raw_content。"""
        await self.sqlite_store.save_episode_content(ep_num, content)

    async def load_episode_content(self, ep_num: int) -> Optional[str]:
        """从 SQLite 加载单集内容。"""
        return await self.sqlite_store.load_episode_content(ep_num)

    async def get_episode_content_count(self) -> int:
        """获取有原文内容的剧集数量。"""
        return await self.sqlite_store.get_episode_content_count()

    async def clear_episode_contents(self) -> int:
        """清除所有剧集的原文内容。"""
        return await self.sqlite_store.clear_episode_contents()

    # ============================================================
    # 导入和提取
    # ============================================================

    async def ingest_novel_fast(
        self,
        novel_path: str,
        rebuild: bool = False,
        on_progress: Optional[Callable[[float, str], None]] = None,
        on_log: Optional[Callable[[str], None]] = None,
    ) -> dict:
        """快速导入：只构建 Cognee 图谱，不提取角色/剧集。"""

        def report(progress: float, task: str):
            if on_progress:
                on_progress(progress, task)

        def log(message: str):
            if on_log:
                on_log(message)
            console.print(f"[dim]{message}[/dim]")

        if not Path(novel_path).exists():
            raise FileNotFoundError(f"文件不存在: {novel_path}")

        if rebuild:
            report(0.05, "重建图谱...")
            log("清除 cognee 图谱数据...")
            await self._prune_cognee_only()


        self._init_cognee()

        log(f"读取文件: {novel_path}")
        content = load_novel_text(novel_path)
        if not content.strip():
            raise ValueError("小说内容为空，无法导入")
        log(f"文件读取完成: {len(content)} 字符")
        self._novel_content = content

        os.environ["COGNEE_TELEMETRY_ENABLED"] = "false"

        # Step 1: 添加原文到 Cognee
        report(0.1, "解析原文...")
        log("Step 1/2: 导入原文到 Cognee...")
        self._set_cognee_context()
        await cognee.add(content, dataset_name=self.dataset_name)
        log("原文导入完成")
        await asyncio.sleep(0)

        # Step 2: 构建知识图谱
        report(0.3, "构建知识图谱...")
        log("Step 2/3: 构建知识图谱（这可能需要几分钟）...")
        await self._run_cognee_pipeline_with_retry(
            stage_name="知识图谱构建",
            operation=lambda: cognee.cognify(datasets=[self.dataset_name]),
            log=log,
            report=report,
            progress_start=0.3,
            progress_end=0.7,
        )
        log("知识图谱构建完成")

        # Step 3: 创建向量索引（memify）
        report(0.7, "创建向量索引...")
        log("Step 3/3: 创建向量索引（用于三元组检索）...")
        await self._run_cognee_pipeline_with_retry(
            stage_name="向量索引创建",
            operation=lambda: cognee.memify(dataset=self.dataset_name),
            log=log,
            report=report,
            progress_start=0.7,
            progress_end=0.98,
        )
        log("向量索引创建完成")

        # 原文落库放在图谱构建成功之后：失败时不留下"已导入"的痕迹。
        # /chapters 仅凭已存原文判定"导入完成"，若提前落库，cognify/memify 失败
        # 仍会让界面误报导入成功且锁死重新上传入口。
        self.save_novel_content(content)
        log("原文已保存到文件")

        report(1.0, "导入完成")

        return {
            "char_count": len(content),
            "dataset": self.dataset_name,
            "status": "graph_ready",
        }

    async def get_graph_snapshot(self, max_nodes: int = 160) -> dict:
        """返回适合前端查看的有限、可 JSON 序列化图谱快照。"""

        raw_nodes, raw_edges = await self._get_dataset_graph_data()

        max_nodes = max(20, min(int(max_nodes), 240))
        degree: Dict[str, int] = {}
        for source, target, _relation, _properties in raw_edges:
            source_id = str(source)
            target_id = str(target)
            degree[source_id] = degree.get(source_id, 0) + 1
            degree[target_id] = degree.get(target_id, 0) + 1

        type_priority = {
            "Entity": 6,
            "EntityType": 5,
            "TextSummary": 4,
            "Document": 3,
            "DocumentChunk": 1,
        }
        ranked_nodes = sorted(
            raw_nodes,
            key=lambda item: (
                degree.get(str(item[0]), 0) * 10
                + type_priority.get(str((item[1] or {}).get("type") or ""), 2) * 3
                + int(bool((item[1] or {}).get("name")))
            ),
            reverse=True,
        )[:max_nodes]
        selected_ids = {str(node_id) for node_id, _properties in ranked_nodes}

        def compact(value: Any, *, depth: int = 0) -> Any:
            if value is None or isinstance(value, (bool, int, float)):
                return value
            if isinstance(value, (UUID, date, datetime)):
                return str(value)
            if isinstance(value, str):
                return value if len(value) <= 500 else value[:497] + "..."
            if depth >= 2:
                return str(value)[:500]
            if isinstance(value, (list, tuple, set)):
                return [compact(item, depth=depth + 1) for item in list(value)[:12]]
            if isinstance(value, dict):
                result = {}
                for key, item in list(value.items())[:16]:
                    key_text = str(key)
                    if any(token in key_text.lower() for token in ("embedding", "vector")):
                        continue
                    result[key_text] = compact(item, depth=depth + 1)
                return result
            return str(value)[:500]

        nodes = []
        for node_id, properties in ranked_nodes:
            props = dict(properties or {})
            node_type = str(props.pop("type", "Unknown") or "Unknown")
            label = str(props.pop("name", "") or node_id)
            nodes.append(
                {
                    "id": str(node_id),
                    "label": label[:160],
                    "type": node_type[:80],
                    "degree": degree.get(str(node_id), 0),
                    "properties": compact(props),
                }
            )

        edges = []
        for index, (source, target, relation, properties) in enumerate(raw_edges):
            source_id = str(source)
            target_id = str(target)
            if source_id not in selected_ids or target_id not in selected_ids:
                continue
            edges.append(
                {
                    "id": f"{source_id}:{target_id}:{index}",
                    "source": source_id,
                    "target": target_id,
                    "relation": str(relation or "related_to")[:120],
                    "properties": compact(properties or {}),
                }
            )
            if len(edges) >= 600:
                break

        return {
            "nodes": nodes,
            "edges": edges,
            "total_nodes": len(raw_nodes),
            "total_edges": len(raw_edges),
            "truncated": len(raw_nodes) > len(nodes) or len(raw_edges) > len(edges),
        }

    async def _get_dataset_graph_data(self) -> tuple[list, list]:
        """在当前项目的数据集上下文中读取 Cognee 图数据。"""

        self._set_cognee_context()
        with preserve_st_env():
            from cognee.context_global_variables import (
                set_database_global_context_variables,
            )
            from cognee.infrastructure.databases.graph import get_graph_engine
            from cognee.modules.data.methods import get_datasets_by_name
            from cognee.modules.users.methods import get_default_user

        user = await get_default_user()
        datasets = await get_datasets_by_name(self.dataset_name, user.id)
        if not datasets:
            return [], []

        dataset = datasets[0]
        async with set_database_global_context_variables(dataset.id, dataset.owner_id):
            graph_engine = await get_graph_engine()
            return await graph_engine.get_graph_data()

    async def build_characters_from_graph(
        self,
        on_progress: Optional[Callable[[float, str], None]] = None,
        on_log: Optional[Callable[[str], None]] = None,
    ) -> List[NovelCharacter]:
        """从图谱补充角色（分阶段架构第二步）。

        图谱构建只负责发现缺失的基础角色。已有角色可能已经有用户编辑、
        身份图、声线和资产配置，不能被一次图谱重扫覆盖。
        """
        from .pipeline import extract_characters_from_graph

        def report(progress: float, task: str):
            if on_progress:
                on_progress(progress, task)

        def log(message: str):
            if on_log:
                on_log(message)
            console.print(f"[dim]{message}[/dim]")

        report(0.1, "从图谱提取人物节点...")
        log("从图谱提取角色候选...")
        self._set_cognee_context()
        novel_text = self.load_novel_content()
        characters = await extract_characters_from_graph(
            dataset_name=self.dataset_name,
            project_name=self.project_name,
            project_dir=str(self.project_dir),
            novel_text=novel_text,
            on_progress=lambda p, t: report(0.1 + p * 0.6, t),
        )

        if not characters:
            log("⚠️ 图谱提取无结果，保留现有角色数据")
            report(1.0, "提取无结果")
            return []

        log(f"从图谱提取了 {len(characters)} 个角色")

        report(0.8, "保存新增角色...")
        log("保存新增角色到数据库...")
        added: list[NovelCharacter] = []
        skipped = 0
        for char in characters:
            if self.get_character(char.name):
                skipped += 1
                continue
            await self.add_character(char)
            added.append(char)
        log(f"已新增 {len(added)} 个角色，跳过已有 {skipped} 个")

        report(1.0, "角色提取完成")
        log(f"角色提取完成: 新增 {len(added)} 个，已有 {skipped} 个")

        return added

    async def _delete_old_episodes(self) -> int:
        """删除所有剧集。"""
        await self._ensure_db()
        return await self.sqlite_store.delete_all_episodes()

    async def build_episodes(
        self,
        target_episodes: int = 10,
        on_progress: Optional[Callable[[float, str], None]] = None,
        on_log: Optional[Callable[[str], None]] = None,
    ) -> List[NovelEpisode]:
        """规划剧集（分阶段架构第三步）。"""
        from .pipeline import extract_episodes_with_characters

        def report(progress: float, task: str):
            if on_progress:
                on_progress(progress, task)

        def log(message: str):
            if on_log:
                on_log(message)
            console.print(f"[dim]{message}[/dim]")

        # 获取原文内容
        log("从文件加载原文...")
        novel_content = self.load_novel_content()
        if novel_content:
            log(f"原文加载完成: {len(novel_content)} 字符")
        else:
            raise ValueError("请先导入小说（调用 ingest_novel_fast）")

        # 获取已确认的角色列表
        character_names = list(self._characters.keys())
        log(f"已知角色: {len(character_names)} 个")

        # P1: 规划
        report(0.1, "规划剧集...")
        log(f"开始规划 {target_episodes} 集...")

        episodes = await extract_episodes_with_characters(
            novel_content,
            target_episodes=target_episodes,
            known_characters=character_names,
            dataset_name=self.dataset_name,
            project_name=self.project_name,
        )

        log(f"LLM 返回 {len(episodes)} 集")

        # P2: 删除旧剧集
        report(0.8, "清理旧剧集数据...")
        log("清理旧剧集数据...")
        deleted = await self._delete_old_episodes()
        log(f"已删除 {deleted} 个旧剧集")
        self._episodes.clear()

        # P3: 保存新剧集
        report(0.85, "保存新剧集...")
        log("保存新剧集到数据库...")
        await self.add_episodes(episodes)

        # P4: 更新内存缓存
        for ep in episodes:
            self._episodes[ep.number] = ep

        if len(self._episodes) != len(episodes):
            log(f"⚠️ 警告：内存缓存 ({len(self._episodes)}) 与返回结果 ({len(episodes)}) 不一致")

        report(1.0, "剧集规划完成")
        log(f"剧集规划完成: {len(episodes)} 集，编号: {list(self._episodes.keys())}")

        return episodes

    async def build_episodes_from_chapters(
        self,
        novel_text: str = None,
        generate_metadata: bool = False,
        on_progress: Optional[Callable[[float, str], None]] = None,
        on_log: Optional[Callable[[str], None]] = None,
    ) -> List[NovelEpisode]:
        """从小说章节结构创建剧集（章节映射模式）。"""
        from ai_anime.modules.knowledge_graph.domain.chapter_detector import ChapterDetector

        def report(progress: float, task: str):
            if on_progress:
                on_progress(progress, task)

        def log(message: str):
            if on_log:
                on_log(message)
            console.print(f"[dim]{message}[/dim]")

        # 获取小说原文
        if novel_text is None:
            log("从文件加载原文...")
            novel_text = self.load_novel_content()
            if not novel_text:
                raise ValueError("请先导入小说（调用 ingest_novel_fast）")
            log(f"原文加载完成: {len(novel_text)} 字符")

        # 清理剧集内容
        await self.clear_episode_contents()

        # P1: 检测章节
        report(0.1, "检测章节结构...")
        log("检测章节结构...")
        detector = ChapterDetector()
        chapters = detector.detect(novel_text)

        if not chapters:
            raise ValueError("未检测到章节标记，请使用 AI 规划模式")

        log(f"检测到 {len(chapters)} 个章节")

        episodes = []
        chapter_contents = {}  # 收集章节内容，最后统一写入
        total = len(chapters)

        for i, chapter in enumerate(chapters):
            progress = 0.1 + (i / total) * 0.7
            report(progress, f"处理第 {chapter.number} 章...")

            # 收集章节内容（稍后写入，避免与 _delete_old_episodes 冲突）
            chapter_contents[chapter.number] = chapter.content

            if generate_metadata:
                log(f"为第 {chapter.number} 章生成元数据...")
                metadata = await self._generate_episode_metadata(chapter.number, chapter.content)
            else:
                summary = chapter.content[:200].strip()
                if len(chapter.content) > 200:
                    summary += "..."
                metadata = {
                    "title": f"第{chapter.number}集",
                    "summary": summary,
                    "conflict": "",
                    "cliffhanger": "",
                    "key_events": [],
                    "characters": [],
                }

            episode = NovelEpisode(
                number=chapter.number,
                title=metadata.get("title", f"第{chapter.number}集"),
                chapter_start=chapter.number,
                chapter_end=chapter.number,
                content_summary=metadata.get("summary", ""),
                main_conflict=metadata.get("conflict", ""),
                cliffhanger=metadata.get("cliffhanger", ""),
                key_events=metadata.get("key_events", []),
                character_names=metadata.get("characters", []),
            )
            episodes.append(episode)

        # P2: 合并剧集（保留已有的已规划资产字段）
        report(0.82, "合并剧集数据...")
        log("合并剧集数据（保留身份、场景、道具和颜色）...")
        new_numbers = {ep.number for ep in episodes}
        for ep in episodes:
            old = self._episodes.get(ep.number)
            if old:
                ep.identity_ids = old.identity_ids
                ep.scene_menu = old.scene_menu
                ep.prop_menu = old.prop_menu
                ep.sketch_colors_json = old.sketch_colors_json

        # 删除不再存在的旧剧集
        old_numbers = set(self._episodes.keys())
        removed = old_numbers - new_numbers
        if removed:
            await self.sqlite_store.delete_episodes_by_numbers(removed)
            log(f"已删除 {len(removed)} 个旧剧集")
        self._episodes.clear()

        # P3: 保存新剧集
        report(0.88, "保存到数据库...")
        log("保存剧集到数据库...")
        await self.add_episodes(episodes)

        # P3.5: 保存章节原文内容
        for ep_num, content in chapter_contents.items():
            await self.save_episode_content(ep_num, content)

        # P4: 更新内存缓存
        for ep in episodes:
            self._episodes[ep.number] = ep

        report(1.0, "章节映射完成")
        log(f"章节映射完成: {len(episodes)} 集")

        return episodes

    async def build_episodes_from_events(
        self,
        target_episodes: int,
        on_progress: Optional[Callable[[float, str], None]] = None,
        on_log: Optional[Callable[[str], None]] = None,
    ) -> List[NovelEpisode]:
        """基于事件的剧集规划（支持章节拆分）。"""
        from ai_anime.modules.knowledge_graph.domain.chapter_detector import ChapterDetector
        from ai_anime.modules.knowledge_graph.infrastructure.event_extractor import (
            EventExtractor,
        )

        def report(progress: float, task: str):
            if on_progress:
                on_progress(progress, task)

        def log(message: str):
            if on_log:
                on_log(message)
            console.print(f"[dim]{message}[/dim]")

        # 1. 加载原文并检测章节
        log("从文件加载原文...")
        novel_text = self.load_novel_content()
        if not novel_text:
            raise ValueError("请先导入小说（调用 ingest_novel_fast）")

        log(f"原文加载完成: {len(novel_text)} 字符")

        # 清理剧集内容
        await self.clear_episode_contents()

        report(0.1, "检测章节结构...")
        detector = ChapterDetector()
        chapters = detector.detect(novel_text)

        if not chapters:
            raise ValueError("未检测到章节标记，请使用章节映射模式")

        log(f"检测到 {len(chapters)} 个章节，目标 {target_episodes} 集")

        # 提取所有事件
        extractor = EventExtractor()
        all_events: List[NovelEvent] = []

        for i, chapter in enumerate(chapters):
            progress = 0.1 + 0.3 * (i / len(chapters))
            report(progress, f"提取第 {chapter.number} 章事件...")

            events = await extractor.extract_events(
                chapter_num=chapter.number,
                chapter_content=chapter.content,
                on_log=log,
            )
            all_events.extend(events)
            log(f"第 {chapter.number} 章: {len(events)} 个事件")

        log(f"共提取 {len(all_events)} 个事件")

        # 事件存储在内存中（不再写 Redis）
        report(0.45, "存储事件...")

        # AI 分配事件到剧集
        report(0.5, "AI 规划剧集分配...")
        log("AI 分配事件到剧集...")
        episode_assignments = await self._assign_events_to_episodes(
            all_events, target_episodes, on_log=log
        )

        # 创建 NovelEpisode 并合并原文
        episodes = []
        episode_contents = {}  # 收集内容，最后统一写入
        for ep_num, event_ids in episode_assignments.items():
            progress = 0.7 + 0.1 * (ep_num / target_episodes)
            report(progress, f"创建第 {ep_num} 集...")

            ep_events = [e for e in all_events if e.event_id in event_ids]

            if not ep_events:
                log(f"⚠️ 第 {ep_num} 集没有分配到事件，跳过")
                continue

            combined_content = "\n\n---\n\n".join(e.content for e in ep_events if e.content)
            episode_contents[ep_num] = combined_content

            key_events = [e.description for e in ep_events]
            characters = list(set(c for e in ep_events for c in e.characters))

            chapter_nums = [e.chapter_num for e in ep_events]
            chapter_start = min(chapter_nums) if chapter_nums else 0
            chapter_end = max(chapter_nums) if chapter_nums else 0

            episode = NovelEpisode(
                number=ep_num,
                title=f"第{ep_num}集",
                chapter_start=chapter_start,
                chapter_end=chapter_end,
                event_ids=event_ids,
                content_summary=(
                    combined_content[:2000] + "..."
                    if len(combined_content) > 2000
                    else combined_content
                ),
                key_events=key_events,
                character_names=characters,
                cliffhanger=ep_events[-1].description if ep_events else "",
            )
            episodes.append(episode)

        # P2: 删除旧剧集
        report(0.82, "清理旧剧集数据...")
        deleted = await self._delete_old_episodes()
        log(f"已删除 {deleted} 个旧剧集")
        self._episodes.clear()

        # P3: 保存新数据
        report(0.88, "保存到数据库...")
        await self.add_episodes(episodes)

        # P3.5: 保存剧集原文内容
        for ep_num, content in episode_contents.items():
            await self.save_episode_content(ep_num, content)

        # P4: 更新内存缓存
        for ep in episodes:
            self._episodes[ep.number] = ep

        report(1.0, "事件级规划完成")
        log(f"事件级规划完成: {len(episodes)} 集")

        return episodes

    async def _assign_events_to_episodes(
        self,
        events: List[NovelEvent],
        target_episodes: int,
        on_log: Optional[Callable[[str], None]] = None,
    ) -> Dict[int, List[str]]:
        """AI 将事件分配到剧集。"""
        import json
        import litellm

        def log(msg: str):
            if on_log:
                on_log(msg)

        event_summaries = []
        for e in events:
            event_summaries.append(
                {
                    "id": e.event_id,
                    "description": e.description,
                    "characters": e.characters,
                    "causes": e.causes[:3] if e.causes else [],
                }
            )

        prompt = f"""将以下 {len(events)} 个事件分配到 {target_episodes} 集中。

事件列表：
{json.dumps(event_summaries, ensure_ascii=False, indent=2)}

分配原则：
1. 保持因果关系：有 causes 关系的事件尽量在同一集或相邻集
2. 叙事完整性：每集应有完整的小叙事弧
3. 均衡分配：每集事件数量大致相当（平均 {len(events) // target_episodes} 个）
4. 悬念设置：每集最后的事件适合作为 cliffhanger
5. 按顺序分配：事件的顺序不能打乱

请返回 JSON 格式：
{{
    "assignments": {{
        "1": ["ch1_e1", "ch1_e2"],
        "2": ["ch1_e3", "ch2_e1"],
        ...
    }}
}}

只返回 JSON，不要有其他内容。"""

        try:
            log("调用 LLM 分配事件...")
            response = await litellm.acompletion(
                model=self._configured_text_transport_model(),
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                response_format={"type": "json_object"},
                **get_model_reasoning_kwargs(
                    thinking_env="COGNEE_LLM_THINKING_LEVEL",
                    default_thinking_level="high",
                ),
            )

            result = json.loads(response.choices[0].message.content)
            assignments = {int(k): v for k, v in result.get("assignments", {}).items()}

            log(f"LLM 分配完成: {len(assignments)} 集")
            return assignments

        except Exception as e:
            log(f"LLM 分配失败: {e}，使用均匀分配")
            assignments = {}
            events_per_episode = max(1, len(events) // target_episodes)
            for i, event in enumerate(events):
                ep_num = min(i // events_per_episode + 1, target_episodes)
                if ep_num not in assignments:
                    assignments[ep_num] = []
                assignments[ep_num].append(event.event_id)
            return assignments

    async def _generate_episode_metadata(self, episode_num: int, content: str) -> dict:
        """使用 LLM 生成剧集元数据。"""
        try:
            import litellm

            prompt = f"""请分析以下章节内容，提取关键信息。

章节内容：
{content}

请用 JSON 格式返回以下信息：
{{
    "title": "一个吸引人的标题（10字以内）",
    "summary": "内容摘要（50-100字）",
    "conflict": "主要冲突或矛盾",
    "cliffhanger": "结尾悬念（如果有）",
    "key_events": ["关键事件1", "关键事件2"],
    "characters": ["出场角色1", "出场角色2"]
}}

只返回 JSON，不要有其他内容。"""

            response = await litellm.acompletion(
                model=self._configured_text_transport_model(),
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                response_format={"type": "json_object"},
                **get_model_reasoning_kwargs(
                    thinking_env="COGNEE_LLM_THINKING_LEVEL",
                    default_thinking_level="high",
                ),
            )

            import json

            result = json.loads(response.choices[0].message.content)
            return result

        except Exception as e:
            console.print(f"[yellow]元数据生成失败: {e}，使用默认值[/yellow]")
            return {
                "title": f"第{episode_num}集",
                "summary": content[:200] + "..." if len(content) > 200 else content,
                "conflict": "",
                "cliffhanger": "",
                "key_events": [],
                "characters": [],
            }

    async def add_episodes(self, episodes: List[NovelEpisode]) -> None:
        """批量添加剧集到 SQLite。"""
        await self.sqlite_store.add_episodes(episodes)
        self._sync_sqlite_caches()

    async def ingest_novel(
        self,
        novel_path: str,
        rebuild: bool = False,
        target_episodes: int = 10,
        on_progress: Optional[Callable[[float, str], None]] = None,
    ) -> dict:
        """导入小说文本 + 提取角色 + 规划剧集。"""

        def report(progress: float, task: str):
            if on_progress:
                on_progress(progress, task)

        if not Path(novel_path).exists():
            raise FileNotFoundError(f"文件不存在: {novel_path}")

        console.print("[bold]Step 1/3: 导入原文并构建 Cognee 图谱...[/bold]")
        fast_result = await self.ingest_novel_fast(
            novel_path,
            rebuild=rebuild,
            on_progress=lambda p, t: report(p * 0.3, t),
        )

        report(0.3, "提取角色...")
        console.print("[bold]Step 2/3: 从图谱提取角色...[/bold]")
        characters = await self.build_characters_from_graph(
            on_progress=lambda p, t: report(0.3 + p * 0.3, t),
        )

        report(0.6, "规划剧集...")
        console.print("[bold]Step 3/3: 规划剧集...[/bold]")
        episodes = await self.build_episodes(
            target_episodes=target_episodes,
            on_progress=lambda p, t: report(0.6 + p * 0.4, t),
        )

        report(1.0, "导入完成")

        return {
            "char_count": fast_result["char_count"],
            "dataset": fast_result["dataset"],
            "characters": len(characters),
            "episodes": len(episodes),
        }

    # ============================================================
    # 查询
    # ============================================================

    def _normalize_prop_menu_items(self, prop_menu: Iterable[Any] | None) -> list[PropMenuItem]:
        """将 episode prop_menu 规范化为资产库标准 prop_id。"""
        normalized_items = build_prop_menu(prop_menu=list(prop_menu or []))
        canonical_items: list[PropMenuItem] = []
        for item in normalized_items:
            prop_id = str(item.prop_id or "").strip()
            if not prop_id:
                continue
            cached = self.get_cached_prop(prop_id)
            canonical_id = cached.name if cached else prop_id
            canonical_items.append(
                PropMenuItem(
                    prop_id=canonical_id,
                    prop_type=(getattr(cached, "prop_type", "") if cached else item.prop_type)
                    or "object",
                    visual_prompt=(
                        getattr(cached, "visual_prompt", "")
                        or getattr(cached, "description", "")
                        or item.visual_prompt
                    ),
                    description=(
                        getattr(cached, "visual_prompt", "")
                        or getattr(cached, "description", "")
                        or item.description
                    ),
                    owner_identity_id=item.owner_identity_id or getattr(cached, "owner", ""),
                )
            )
        return build_prop_menu(prop_menu=canonical_items)

    async def _normalize_scene_menu_items(
        self, scene_menu: Iterable[Any] | None
    ) -> list[SceneMenuItem]:
        """将 episode scene_menu 规范化为资产库标准 scene_id。"""
        normalized_items = build_scene_menu(scene_menu=list(scene_menu or []))
        canonical_items: list[SceneMenuItem] = []
        all_scenes = await self.sqlite_store.list_scenes()
        for item in normalized_items:
            scene_id = str(item.scene_id or "").strip()
            if not scene_id:
                continue
            canonical_id = scene_id
            lookup = self._normalize_alias_lookup(scene_id)
            for candidate in all_scenes:
                if self._normalize_alias_lookup(candidate.name) == lookup:
                    canonical_id = candidate.name
                    break
                aliases = getattr(candidate, "aliases", []) or []
                if any(self._normalize_alias_lookup(alias) == lookup for alias in aliases):
                    canonical_id = candidate.name
                    break
            canonical_items.append(
                SceneMenuItem(
                    scene_id=canonical_id,
                    base_scene_id=str(getattr(item, "base_scene_id", "") or "").strip(),
                    variant_id=str(getattr(item, "variant_id", "") or "").strip(),
                    time_of_day=str(getattr(item, "time_of_day", "") or "").strip(),
                )
            )
        return build_scene_menu(scene_menu=canonical_items)

    async def search(self, query: str, mode: str = "graph", top_k: int = 10) -> str:
        """语义检索。"""
        self._set_cognee_context()

        with preserve_st_env():
            from cognee.modules.data.exceptions.exceptions import DatasetNotFoundError

        mode_map = {
            "graph": SearchType.GRAPH_COMPLETION,
            "chunks": SearchType.CHUNKS,
            "triplet": SearchType.TRIPLET_COMPLETION,
            "context_ext": SearchType.GRAPH_COMPLETION_CONTEXT_EXTENSION,
            "summaries": SearchType.SUMMARIES,
            "graph_cot": SearchType.GRAPH_COMPLETION_COT,
        }
        search_type = mode_map.get(mode, SearchType.GRAPH_COMPLETION)

        try:
            result = await cognee.search(
                query_type=search_type,
                query_text=query,
                top_k=top_k,
            )
        except DatasetNotFoundError:
            return "暂无相关数据，请先运行 cognee-ingest 导入小说"
        except Exception as e:
            return f"搜索出错: {str(e)}"

        if isinstance(result, list):
            parts = []
            for item in result:
                if isinstance(item, dict):
                    parts.append(self._stringify_search_fragment(item.get("search_result", item)))
                elif hasattr(item, "model_dump"):
                    parts.append(self._stringify_search_fragment(item.model_dump()))
                else:
                    parts.append(self._stringify_search_fragment(item))
            return "\n".join(parts)
        return str(result)

    @classmethod
    def _stringify_search_fragment(cls, value) -> str:
        """Normalize heterogeneous Cognee search payloads into plain text."""
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        if isinstance(value, list):
            return "\n".join(
                fragment
                for fragment in (cls._stringify_search_fragment(item) for item in value)
                if fragment
            )
        if isinstance(value, dict):
            return json.dumps(value, ensure_ascii=False)
        if hasattr(value, "model_dump"):
            return json.dumps(value.model_dump(), ensure_ascii=False)
        return str(value)

    async def load_graph_state(self) -> None:
        """从 SQLite 加载角色和剧集到内存缓存。"""
        logger.debug("正在从 SQLite 加载图谱状态")
        try:
            await self.sqlite_store.load_graph_state()
            self._sync_sqlite_caches()

            for episode in self._episodes.values():
                episode.scene_menu = await self._normalize_scene_menu_items(episode.scene_menu)
                episode.prop_menu = self._normalize_prop_menu_items(episode.prop_menu)

            logger.info(
                "图谱状态加载完成：角色=%s，剧集=%s，道具=%s",
                len(self._characters),
                len(self._episodes),
                len(self._props),
            )
        except Exception:
            logger.exception("图谱状态加载失败，将使用空数据")
            self._characters.clear()
            self._episodes.clear()
            self._props.clear()
            self._alias_index.clear()
            self._share_sqlite_caches()

    # ============================================================
    # 添加/更新
    # ============================================================

    async def add_character(self, character: NovelCharacter):
        """添加角色到 SQLite。"""
        await self.sqlite_store.add_character(character)
        self._sync_sqlite_caches()

    async def update_character(self, name: str, **updates) -> None:
        """更新角色属性。"""
        char = self.get_character(name)
        if not char:
            raise ValueError(f"角色 {name} 不存在")

        for key, value in updates.items():
            if hasattr(char, key):
                setattr(char, key, value)

        if "aliases" in updates:
            updated_alias_index = {k: v for k, v in self._alias_index.items() if v != name}
            self._alias_index.clear()
            self._alias_index.update(updated_alias_index)
            for alias in char.aliases:
                self._alias_index[alias] = name

        # Re-save entire character
        await self.add_character(char)
        console.print(f"[green]已更新角色: {name}[/green]")

    async def rename_character(self, old_name: str, new_name: str) -> None:
        """重命名角色。"""
        await self.sqlite_store.rename_character(old_name, new_name)
        self._sync_sqlite_caches()

    async def delete_character(self, name: str) -> None:
        """删除角色。"""
        await self.sqlite_store.delete_character(name)
        self._sync_sqlite_caches()

    # ============================================================
    # 身份管理
    # ============================================================

    async def add_character_identity(
        self,
        character_name: str,
        identity: CharacterIdentity,
    ) -> None:
        """为角色添加一个新身份。"""
        await self.sqlite_store.add_character_identity(character_name, identity)
        self._sync_sqlite_caches()

    async def update_character_identity(
        self,
        character_name: str,
        identity_id: str,
        **updates,
    ) -> None:
        """更新角色的某个身份。"""
        await self.sqlite_store.update_character_identity(character_name, identity_id, **updates)
        self._sync_sqlite_caches()

    async def delete_character_identity(
        self,
        character_name: str,
        identity_id: str,
    ) -> None:
        """删除角色的某个身份。"""
        await self.sqlite_store.delete_character_identity(character_name, identity_id)
        self._sync_sqlite_caches()

    async def add_episode(self, episode: NovelEpisode):
        """添加单个剧集。"""
        await self.add_episodes([episode])
        self._episodes[episode.number] = episode

    async def update_episode(self, episode_number: int, **updates) -> None:
        """更新剧集属性。"""
        episode = self.get_episode(episode_number)
        if not episode:
            logger.warning(
                "剧集 %s 不在内存缓存中，当前键：%s",
                episode_number,
                list(self._episodes.keys()),
            )
            raise ValueError(f"剧集 {episode_number} 不存在")

        old_number = episode.number
        persisted = await self.sqlite_store.get_episode_from_graph(episode_number)
        if persisted is not None:
            protected_fields = set(updates)
            if "scene_menu" in protected_fields:
                protected_fields.add("scene_menu_json")
            if "prop_menu" in protected_fields:
                protected_fields.add("prop_menu_json")
            if "identity_default_map" in protected_fields:
                protected_fields.add("identity_default_map_json")
            for field_name in type(episode).model_fields:
                if field_name not in protected_fields:
                    setattr(episode, field_name, getattr(persisted, field_name))

        logger.debug(
            "剧集 %s 更新前：identity_ids=%s，updates=%s",
            episode_number,
            episode.identity_ids,
            list(updates.keys()),
        )

        for key, value in updates.items():
            if key == "scene_menu":
                episode.scene_menu = await self._normalize_scene_menu_items(value or [])
            elif key == "prop_menu":
                episode.prop_menu = self._normalize_prop_menu_items(value or [])
            elif hasattr(episode, key):
                setattr(episode, key, value)
            else:
                logger.warning("剧集 %s 没有属性 %s", episode_number, key)

        logger.debug(
            "剧集 %s 更新后：identity_ids=%s",
            episode_number,
            episode.identity_ids,
        )

        new_number = updates.get("number", old_number)
        if new_number != old_number:
            del self._episodes[old_number]
            self._episodes[new_number] = episode

        await self.add_episodes([episode])
        console.print(f"[green]已更新剧集: 第{episode.number}集[/green]")

    def get_sketch_colors(self, episode_number: int) -> dict:
        """从 episode 读取 sketch_colors。"""
        return self.sqlite_store.get_sketch_colors(episode_number)

    async def set_sketch_colors(self, episode_number: int, colors: dict) -> None:
        """将 sketch_colors 写入 episode。"""
        await self.sqlite_store.set_sketch_colors(episode_number, colors)
        self._sync_sqlite_caches()

    async def set_beat_detected_identities(
        self, episode_number: int, detections: dict[int, list[str]]
    ) -> int:
        """批量写入 per-beat 检测身份。"""
        count = await self.sqlite_store.set_beat_detected_identities(episode_number, detections)
        logger.debug("剧集 %s 已更新 %s 个分镜的检测身份", episode_number, count)
        return count

    async def set_beat_detected_props(
        self, episode_number: int, detections: dict[int, list[str]]
    ) -> int:
        """批量写入 per-beat 检测道具。"""
        count = await self.sqlite_store.set_beat_detected_props(episode_number, detections)
        logger.debug("剧集 %s 已更新 %s 个分镜的检测道具", episode_number, count)
        return count

    async def add_visual_beats(self, beats: List[NovelVisualBeat]):
        """添加视觉节拍到 SQLite (delegates to SQLiteStore)."""
        await self._ensure_db()
        await self.sqlite_store.add_visual_beats(beats)

    async def delete_beats_for_episode(self, episode_number: int) -> int:
        """删除指定剧集的所有 Beat。"""
        return await self._delete_old_beats_for_episode(episode_number)

    async def _delete_old_beats_for_episode(self, episode_number: int) -> int:
        """删除指定剧集的所有 Beat。"""
        deleted = await self.sqlite_store.delete_beats_for_episode(episode_number)
        if deleted > 0:
            console.print(f"[dim]已删除第 {episode_number} 集的 {deleted} 个旧 Beat[/dim]")
        return deleted

    # ============================================================
    # Scene: 从图谱构建
    # ============================================================

    async def build_scenes_from_graph(
        self,
        on_progress: Optional[Callable[[float, str], None]] = None,
        on_log: Optional[Callable[[str], None]] = None,
    ) -> List[NovelScene]:
        """从剧本补充基础场景（程序解析 + LLM enrichment）。

        这里只补缺失的基础场景；已有基础场景和派生 plate 都是资产事实，
        不能被一次重新解析清空或覆盖。
        """
        from .pipeline import extract_scenes_from_script

        def report(progress: float, task: str):
            if on_progress:
                on_progress(progress, task)

        def log(message: str):
            if on_log:
                on_log(message)
            console.print(f"[dim]{message}[/dim]")

        report(0.1, "解析剧本提取场景...")
        novel_text = self.load_novel_content()
        if not novel_text:
            log("⚠️ 未找到剧本原文（novel.txt），无法提取场景")
            report(1.0, "提取失败：无原文")
            return []

        log(f"加载剧本原文: {len(novel_text)} 字符")
        scenes = await extract_scenes_from_script(
            novel_text=novel_text,
            on_progress=lambda p, t: report(0.1 + p * 0.6, t),
        )

        if not scenes:
            log("⚠️ 剧本解析无结果，保留现有场景数据")
            report(1.0, "提取无结果")
            return []

        log(f"从剧本提取了 {len(scenes)} 个场景")
        report(0.8, "保存新增场景...")
        log("保存新增场景到数据库...")
        added: list[NovelScene] = []
        skipped = 0
        for scene in scenes:
            existing = await self.sqlite_store.get_scene(scene.name)
            if existing:
                skipped += 1
                continue
            await self.sqlite_store.add_scene(scene)
            added.append(scene)
        log(f"已新增 {len(added)} 个场景，跳过已有 {skipped} 个")

        report(1.0, "场景提取完成")
        log(f"场景提取完成: 新增 {len(added)} 个，已有 {skipped} 个")

        return added

    # ============================================================
    # Prop: 从图谱构建
    # ============================================================

    async def build_props_from_graph(
        self,
        on_progress: Optional[Callable[[float, str], None]] = None,
        on_log: Optional[Callable[[str], None]] = None,
    ) -> List[NovelProp]:
        """从图谱构建道具（分阶段架构第二步）。"""
        from .pipeline import extract_props_from_graph

        def report(progress: float, task: str):
            if on_progress:
                on_progress(progress, task)

        def log(message: str):
            if on_log:
                on_log(message)
            console.print(f"[dim]{message}[/dim]")

        report(0.05, "收集已有道具数据...")
        existing_prop_aliases: dict[str, list[str]] = {}
        canonical_prop_hints: set[str] = set()
        canonical_prop_alias_targets: dict[str, set[str]] = {}
        for prop in await self.sqlite_store.list_props():
            alias_list = list(prop.aliases or [])
            existing_prop_aliases[prop.name] = alias_list
            canonical_prop_hints.add(prop.name)
            normalized_name = self._normalize_alias_lookup(prop.name)
            canonical_prop_alias_targets.setdefault(normalized_name, set()).add(prop.name)
            for alias in alias_list:
                normalized_alias = self._normalize_alias_lookup(alias)
                if normalized_alias:
                    canonical_prop_alias_targets.setdefault(normalized_alias, set()).add(prop.name)
        canonical_prop_hints.update(
            item.prop_id
            for episode in self._episodes.values()
            for item in (episode.prop_menu or [])
            if getattr(item, "prop_id", "")
        )
        prop_assets_dir = Path(self.project_dir) / "assets" / "props"
        if prop_assets_dir.exists():
            canonical_prop_hints.update(
                entry.name
                for entry in prop_assets_dir.iterdir()
                if entry.is_dir() and entry.name.strip()
            )
        log(f"收集了 {len(canonical_prop_hints)} 个已有道具线索")

        # P1: 提取新道具
        report(0.1, "从图谱提取道具节点...")
        log("从图谱提取道具候选...")
        self._set_cognee_context()
        novel_text = self.load_novel_content()
        if novel_text:
            log(f"已加载原文全文用于辅助道具提取: {len(novel_text)} 字符")
        props = await extract_props_from_graph(
            dataset_name=self.dataset_name,
            project_name=self.project_name,
            project_dir=self.project_dir,
            novel_text=novel_text,
            on_progress=lambda p, t: report(0.1 + p * 0.6, t),
        )

        if not props:
            log("⚠️ 图谱提取无结果，保留现有道具数据")
            report(1.0, "提取无结果")
            return []

        log(f"从图谱提取了 {len(props)} 个道具")

        # P1.5: 保留已有更具体的道具名，避免重建时退化成泛名（如 办公纸箱 -> 纸箱）
        used_prop_names: set[str] = set()
        for prop in props:
            if not prop.name:
                continue

            candidate_names: set[str] = set()
            normalized_prop_name = self._normalize_alias_lookup(prop.name)
            candidate_names.update(canonical_prop_alias_targets.get(normalized_prop_name, set()))
            for alias in prop.aliases or []:
                normalized_alias = self._normalize_alias_lookup(alias)
                if normalized_alias:
                    candidate_names.update(
                        canonical_prop_alias_targets.get(normalized_alias, set())
                    )

            candidates = sorted(
                [
                    candidate
                    for candidate in candidate_names
                    if candidate and candidate != prop.name and candidate not in used_prop_names
                ],
                key=len,
            )
            if len(candidates) == 1:
                original_name = prop.name
                prop.name = candidates[0]
                prop.aliases = list(
                    dict.fromkeys(
                        [
                            original_name,
                            *[
                                alias
                                for alias in (prop.aliases or [])
                                if alias and alias != candidates[0]
                            ],
                        ]
                    )
                )
                log(f"保留更具体的已有道具名: {original_name} -> {prop.name}")
            if prop.name in existing_prop_aliases:
                prop.aliases = list(
                    dict.fromkeys(
                        [
                            *prop.aliases,
                            *[
                                alias
                                for alias in existing_prop_aliases[prop.name]
                                if alias and alias != prop.name
                            ],
                        ]
                    )
                )
            used_prop_names.add(prop.name)
        report(0.8, "清理旧道具数据...")
        try:
            deleted = await self.sqlite_store.delete_all_props()
            log(f"已删除 {deleted} 个旧道具")
        except Exception as e:
            log(f"删除旧道具失败: {e}")

        report(0.85, "保存新道具...")
        log("保存新道具到数据库...")
        for prop in props:
            await self.sqlite_store.add_prop(prop)
        log(f"已保存 {len(props)} 个道具")

        report(1.0, "道具提取完成")
        log(f"道具提取完成: {len(props)} 个")

        return props

    async def persist_beats_from_script(self, episode_number: int, beats_data: List[dict]):
        """从脚本数据持久化 Beats。"""
        existing_rows = await self.get_beats_for_episode(episode_number)
        existing_by_num = {beat.beat_number: beat for beat in existing_rows}
        await self._do_persist_beats(episode_number, beats_data, existing_by_num=existing_by_num)

    async def _episode_asset_ref_scope(self, episode_number: int) -> tuple[set[str], set[str]]:
        episode = await self.get_episode_from_graph(episode_number)
        allowed_identity_ids = {
            str(identity_id or "").strip()
            for identity_id in (getattr(episode, "identity_ids", []) or [])
            if str(identity_id or "").strip()
        }
        if not allowed_identity_ids:
            for character in await self.list_characters():
                for identity in getattr(character, "identities", []) or []:
                    identity_id = str(getattr(identity, "identity_id", "") or "").strip()
                    if identity_id:
                        allowed_identity_ids.add(identity_id)

        allowed_prop_ids = {
            str(getattr(prop, "name", "") or "").strip()
            for prop in await self.sqlite_store.list_props()
            if str(getattr(prop, "name", "") or "").strip()
            and str(getattr(prop, "marker_color", "") or "").strip()
        }
        return allowed_identity_ids, allowed_prop_ids

    async def _episode_identity_aliases(self, episode_number: int) -> dict[str, str]:
        episode = await self.get_episode_from_graph(episode_number)
        return build_episode_identity_alias_map(
            episode,
            await self.list_characters(),
        )

    def _complete_generated_beat_refs(
        self,
        beat_payload: dict,
        *,
        allowed_identity_ids: set[str],
        allowed_prop_ids: set[str],
    ) -> dict:
        detected_identities, detected_props = complete_detected_refs_from_visual_description(
            visual_description=str(beat_payload.get("visual_description", "") or ""),
            detected_identities=beat_payload.get("detected_identities"),
            detected_props=beat_payload.get("detected_props"),
            allowed_identity_ids=allowed_identity_ids,
            allowed_prop_ids=allowed_prop_ids,
        )
        beat_payload["detected_identities_json"] = _json_list_payload(
            normalize_detected_identities(detected_identities)
        )
        beat_payload["detected_props_json"] = _json_list_payload(
            normalize_detected_props(detected_props)
        )
        return beat_payload

    async def _do_persist_beats(
        self,
        episode_number: int,
        beats_data: List[dict],
        existing_by_num: Dict[int, NovelVisualBeat] | None = None,
    ):
        """实际执行 Beat 持久化。"""
        existing_by_num = existing_by_num or {}
        keep_numbers = {
            int(b.get("beat_number", 0)) for b in beats_data if int(b.get("beat_number", 0))
        }
        manual_keep_numbers = {
            int(beat_number)
            for beat_number, beat in existing_by_num.items()
            if getattr(beat, "is_manual_shot", False)
        }
        keep_numbers |= manual_keep_numbers
        if keep_numbers:
            await self.sqlite_store.delete_beats_except(episode_number, keep_numbers)
        else:
            await self._delete_old_beats_for_episode(episode_number)
            return

        allowed_identity_ids, allowed_prop_ids = await self._episode_asset_ref_scope(episode_number)
        identity_aliases = await self._episode_identity_aliases(episode_number)
        beats = []
        for b in beats_data:
            beat_payload = sync_beat_asset_refs(dict(b))
            beat_payload["visual_description"] = canonicalize_visual_identity_markers(
                str(beat_payload.get("visual_description", "") or ""),
                identity_aliases,
            )
            beat_payload = self._complete_generated_beat_refs(
                beat_payload,
                allowed_identity_ids=allowed_identity_ids,
                allowed_prop_ids=allowed_prop_ids,
            )
            beat_number = int(beat_payload.get("beat_number", 0))
            existing = existing_by_num.get(beat_number)
            beats.append(
                NovelVisualBeat(
                    beat_number=beat_number,
                    episode_number=episode_number,
                    narration=beat_payload.get(
                        "narration_segment", existing.narration if existing else ""
                    ),
                    visual_description=beat_payload.get(
                        "visual_description",
                        existing.visual_description if existing else "",
                    ),
                    time_of_day=beat_payload.get(
                        "time_of_day", existing.time_of_day if existing else ""
                    )
                    or "",
                    detected_identities_json=(
                        beat_payload.get("detected_identities_json") or '["__NO_CHARACTER__"]'
                    ),
                    detected_props_json=(
                        beat_payload.get("detected_props_json") or '["__NO_PROP__"]'
                    ),
                    scene_ref_json=(
                        json.dumps(beat_payload.get("scene_ref"), ensure_ascii=False)
                        if beat_payload.get("scene_ref")
                        else ""
                    ),
                    audio_type=beat_payload.get(
                        "audio_type", existing.audio_type if existing else "narration"
                    ),
                    speaker=beat_payload.get("speaker", existing.speaker if existing else ""),
                    speaker_kind=beat_payload.get(
                        "speaker_kind",
                        existing.speaker_kind if existing else "character",
                    ),
                    video_mode=beat_payload.get(
                        "video_mode", existing.video_mode if existing else "first_frame"
                    ),
                    video_prompt=beat_payload.get(
                        "video_prompt", existing.video_prompt if existing else ""
                    )
                    or "",
                    keyframe_prompt=beat_payload.get(
                        "keyframe_prompt",
                        existing.keyframe_prompt if existing else "",
                    )
                    or "",
                    shot_order=(
                        beat_payload.get("shot_order")
                        if beat_payload.get("shot_order") is not None
                        else (existing.shot_order if existing else None)
                    ),
                    duration_seconds=(
                        beat_payload.get("duration_seconds")
                        if beat_payload.get("duration_seconds") is not None
                        else (existing.duration_seconds if existing else None)
                    ),
                    is_manual_shot=bool(
                        beat_payload.get(
                            "is_manual_shot",
                            existing.is_manual_shot if existing else False,
                        )
                    ),
                )
            )

        if beats:
            await self.add_visual_beats(beats)

    # ============================================================
    # Phase 2: 组装 dict / persist NarrationScript
    # ============================================================

    async def get_script_as_dict(self, episode_number: int) -> Optional[Dict]:
        """从 SQLite 组装与 JSON 兼容的脚本 dict，替代 load_script()。"""
        return await self.sqlite_store.get_script_as_dict(episode_number)

    async def persist_narration_script(self, script) -> None:
        """接收 NarrationScript，映射 VisualBeat 字段到 SQLite，删旧插新。

        Args:
            script: NarrationScript 实例 (from narrative_planning.public)
        """
        allowed_identity_ids, allowed_prop_ids = await self._episode_asset_ref_scope(
            script.episode_number
        )
        identity_aliases = await self._episode_identity_aliases(script.episode_number)
        beats = []
        for beat in script.beats:
            visual_description = canonicalize_visual_identity_markers(
                str(getattr(beat, "visual_description", "") or ""),
                identity_aliases,
            )
            detected_identities, detected_props = complete_detected_refs_from_visual_description(
                visual_description=visual_description,
                detected_identities=getattr(beat, "detected_identities", None),
                detected_props=getattr(beat, "detected_props", None),
                allowed_identity_ids=allowed_identity_ids,
                allowed_prop_ids=allowed_prop_ids,
            )
            beats.append(
                NovelVisualBeat(
                    beat_number=beat.beat_number,
                    episode_number=script.episode_number,
                    narration=beat.narration_segment,
                    visual_description=visual_description,
                    time_of_day=getattr(beat, "time_of_day", "") or "",
                    detected_identities_json=_json_list_payload(
                        normalize_detected_identities(detected_identities)
                    ),
                    detected_props_json=_json_list_payload(
                        normalize_detected_props(detected_props)
                    ),
                    scene_ref_json=(
                        json.dumps(
                            getattr(beat, "scene_ref", None).model_dump(), ensure_ascii=False
                        )
                        if getattr(beat, "scene_ref", None)
                        else ""
                    ),
                    audio_type=beat.audio_type,
                    speaker=beat.speaker,
                    speaker_kind=getattr(beat, "speaker_kind", "character"),
                    video_mode=getattr(beat, "video_mode", "first_frame"),
                    video_prompt=getattr(beat, "video_prompt", "") or "",
                    keyframe_prompt=getattr(beat, "keyframe_prompt", "") or "",
                )
            )

        if not beats:
            return

        await self.delete_beats_for_episode(script.episode_number)
        await self.add_visual_beats(beats)

    # ============================================================
    # SQLite 辅助方法
    # ============================================================

    async def _update_character_field(self, name: str, field: str, value: Any) -> bool:
        """更新角色的单个字段。"""
        updated = await self.sqlite_store._update_character_field(name, field, value)
        self._sync_sqlite_caches()
        return updated

    async def list_characters(self) -> List[NovelCharacter]:
        """列出所有角色。"""
        return await self.sqlite_store.list_characters()

    async def list_episodes(self) -> List[NovelEpisode]:
        """列出所有剧集。"""
        return await self.sqlite_store.list_episodes()

    async def list_visual_beats(self) -> List[NovelVisualBeat]:
        """列出所有视觉节拍。"""
        return await self.sqlite_store.list_visual_beats()

    async def get_character_from_graph(self, name: str) -> Optional[NovelCharacter]:
        """从 SQLite 获取角色（兼容旧接口名）。"""
        return await self.sqlite_store.get_character_from_graph(name)

    async def get_episode_from_graph(self, number: int) -> Optional[NovelEpisode]:
        """从 SQLite 获取剧集（兼容旧接口名）。"""
        return await self.sqlite_store.get_episode_from_graph(number)

    async def get_beats_for_episode(self, number: int) -> List[NovelVisualBeat]:
        """获取指定剧集的所有 Beat。"""
        return await self.sqlite_store.get_beats_for_episode(number)

    async def get_beats_as_dicts(self, episode_number: int) -> List[Dict[str, Any]]:
        """从 SQLite 获取 Beats，返回与 JSON 格式兼容的字典列表。"""
        return await self.sqlite_store.get_beats_as_dicts(episode_number)

    async def get_beat_prompts(
        self,
        episode_number: int,
        beat_number: int | None = None,
    ) -> Dict[str, Optional[str]]:
        """获取单个 Beat 的视频提示词字段。"""
        return await self.sqlite_store.get_beat_prompts(episode_number, beat_number)

    async def update_beat_asset(
        self,
        episode_number: int,
        beat_number: int = None,
        narration_segment: str = None,
        visual_description: str = None,
        audio_type: str = None,
        speaker: str = None,
        detected_identities: list = None,
        detected_props: list = None,
        scene_ref: dict = None,
        video_mode: str = None,
        video_prompt: str = None,
        keyframe_prompt: str = None,
        video_config_json: str = None,
        time_of_day: str = None,
        shot_order: int | None = None,
        duration_seconds: float | None = None,
        is_manual_shot: bool | None = None,
    ) -> bool:
        """更新 Beat 的资源字段。"""
        return await self.sqlite_store.update_beat_asset(
            episode_number=episode_number,
            beat_number=beat_number,
            narration_segment=narration_segment,
            visual_description=visual_description,
            audio_type=audio_type,
            speaker=speaker,
            detected_identities=detected_identities,
            detected_props=detected_props,
            scene_ref=scene_ref,
            video_mode=video_mode,
            video_prompt=video_prompt,
            keyframe_prompt=keyframe_prompt,
            video_config_json=video_config_json,
            time_of_day=time_of_day,
            shot_order=shot_order,
            duration_seconds=duration_seconds,
            is_manual_shot=is_manual_shot,
        )

    async def delete_manual_beat(self, episode_number: int, beat_number: int) -> bool:
        """删除单个手工分镜 beat（is_manual_shot=1 才会被删）。"""
        return await self.sqlite_store.delete_manual_beat(episode_number, beat_number)

    def format_character_context(self, character: NovelCharacter) -> str:
        aliases = ", ".join(character.aliases) if character.aliases else "无"
        lines = [
            f"## {character.name}",
            f"- 角色定位: {character.role or '未知'}",
            f"- 性别: {character.gender or '未知'}",
            f"- 别名: {aliases}",
        ]
        if character.description:
            lines.append(f"- 描述: {character.description}")
        if character.face_prompt:
            lines.append(f"- 面部 Prompt: {character.face_prompt}")
        if character.identities:
            lines.append(f"- 可用身份:")
            lines.append(f"  - character_name 填: {character.name}")
            lines.append(f"  - 可选 identity_id:")
            for identity in character.identities:
                desc = ""
                if identity.appearance_details:
                    desc = (
                        f" ({identity.appearance_details[:50]}...)"
                        if len(identity.appearance_details) > 50
                        else f" ({identity.appearance_details})"
                    )
                lines.append(f"    - {identity.identity_id}{desc}")

        return "\n".join(lines)

    def format_episode_context(self, episode: NovelEpisode) -> str:
        lines = [
            f"## 第 {episode.number} 集: {episode.title}",
            f"- 内容摘要: {episode.content_summary}",
            f"- 主要冲突: {episode.main_conflict}",
            f"- 关键事件: {', '.join(episode.key_events) if episode.key_events else '无'}",
            f"- 出场角色: {', '.join(episode.character_names) if episode.character_names else '未知'}",
        ]
        if episode.cliffhanger:
            lines.append(f"- 结尾悬念: {episode.cliffhanger}")
        return "\n".join(lines)

    async def _prune_cognee_only(self):
        """只清除 cognee 图谱数据，保留 SQLite 数据。"""
        # 清理 cognee_system（包含 LanceDB 向量、Kuzu 图谱、cognee 元数据）
        import shutil

        cognee_dir = os.path.join(self.state_dir, "cognee_system")
        if os.path.exists(cognee_dir):
            shutil.rmtree(cognee_dir)
            console.print(f"[green]已清理 cognee 数据: {cognee_dir}[/green]")

    async def delete_project_data(self):
        """删除当前项目的所有 SQLite 数据。"""
        try:
            await self.sqlite_store.delete_project_data()
            self._sync_sqlite_caches()

            console.print(f"[green]已删除项目 '{self.project_name}' 的所有数据[/green]")
        except Exception as e:
            console.print(f"[red]删除数据失败: {e}[/red]")
            self._characters.clear()
            self._episodes.clear()
            self._props.clear()
            self._alias_index.clear()
            raise

# ============================================================
# 工厂函数
# ============================================================


async def create_cognee_store(project_name: str) -> CogneeStore:
    """创建并初始化 CogneeStore。"""
    store = CogneeStore(project_name)
    await store.initialize()
    await store.load_graph_state()
    return store
