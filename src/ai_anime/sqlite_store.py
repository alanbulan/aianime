"""Project-scoped SQLite unit of work assembled from context repositories."""

from ai_anime.modules.asset_world.infrastructure.sqlite_assets import (
    AssetWorldSQLiteRepositoryMixin,
)
from ai_anime.modules.narrative_planning.infrastructure.sqlite_narrative import (
    NarrativeSQLiteRepositoryMixin,
)
from ai_anime.shared.infrastructure.project_sqlite_core import (
    ProjectSQLiteCore,
    StoreClosedError,
    auto_lease_public_async_methods,
)
from ai_anime.shared.infrastructure.project_sqlite_graph_state import (
    ProjectSQLiteGraphStateMixin,
)
from ai_anime.shared.infrastructure.project_sqlite_schema import (
    SQLITE_SCHEMA_SQL as SQLITE_SCHEMA_SQL,
)
from ai_anime.migrations.project.helpers import (
    add_column_if_missing as _add_column_if_missing,
)


@auto_lease_public_async_methods
class SQLiteStore(
    AssetWorldSQLiteRepositoryMixin,
    NarrativeSQLiteRepositoryMixin,
    ProjectSQLiteGraphStateMixin,
    ProjectSQLiteCore,
):
    """Concrete project SQLite unit of work with one-shot lifecycle semantics."""


__all__ = [
    "SQLiteStore",
    "StoreClosedError",
    "SQLITE_SCHEMA_SQL",
    "_add_column_if_missing",
]
