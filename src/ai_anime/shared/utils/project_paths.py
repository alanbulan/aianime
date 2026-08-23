"""项目三类目录路径统一管理。"""

from pathlib import Path

from ai_anime.shared.runtime_paths import OUTPUT_DIR, RUNTIME_DIR, STATE_DIR

class ProjectPaths:
    """统一管理项目的 output/state/runtime 目录。"""

    LEGACY_STATE_ITEMS = (
        "data.db",
        "data.db-wal",
        "data.db-shm",
        "cognee_system",
        "project_config.json",
    )

    LEGACY_RUNTIME_ITEMS = (
        "logs",
        "temp_sketch_panels",
    )

    def __init__(self, user: str, project: str):
        self.user = user
        self.project = project
        self._output_dir_override: Path | None = None
        self._state_dir_override: Path | None = None
        self._runtime_dir_override: Path | None = None

    @classmethod
    def from_context(cls, ctx) -> "ProjectPaths":
        paths = cls(ctx.owner_username, ctx.project_name)
        paths._output_dir_override = Path(ctx.output_dir)
        paths._state_dir_override = Path(ctx.state_dir)
        paths._runtime_dir_override = Path(ctx.runtime_dir)
        return paths

    @property
    def output_dir(self) -> Path:
        if self._output_dir_override is not None:
            return self._output_dir_override
        return Path(OUTPUT_DIR) / self.user / self.project

    @property
    def state_dir(self) -> Path:
        if self._state_dir_override is not None:
            return self._state_dir_override
        return Path(STATE_DIR) / self.user / self.project

    @property
    def runtime_dir(self) -> Path:
        if self._runtime_dir_override is not None:
            return self._runtime_dir_override
        return Path(RUNTIME_DIR) / self.user / self.project

    @property
    def data_db(self) -> Path:
        return self.state_dir / "data.db"

    @property
    def cognee_system_dir(self) -> Path:
        return self.state_dir / "cognee_system"

    @property
    def project_config(self) -> Path:
        return self.state_dir / "project_config.json"

    @property
    def logs_dir(self) -> Path:
        return self.runtime_dir / "logs"

    @property
    def staging_dir(self) -> Path:
        return self.runtime_dir / "staging"

    @property
    def temp_sketch_panels_dir(self) -> Path:
        return self.runtime_dir / "temp_sketch_panels"

    # ------------------------------------------------------------------ #
    # Globally shared paths (director OS foundation)                      #
    # ------------------------------------------------------------------ #
    # Definitions / training data / artifacts are shared across **all
    # users and all projects** in this installation. This is the true
    # flywheel — anyone's runs feed everyone's registry and training
    # pool. Project facts (data.db, sketches, verify_reports) stay
    # per-project under `state/<user>/<project>/` and `output/...`.
    #
    # The old `user_shared_*` properties are kept as deprecated aliases
    # that now resolve to the global paths, so stale callers don't blow
    # up during the transition. Prefer `global_shared_*` for new code.
    @property
    def global_shared_dir(self) -> Path:
        return Path(STATE_DIR) / "_shared"

    @property
    def global_shared_verification_db(self) -> Path:
        return self.global_shared_dir / "verification.db"

    @property
    def global_shared_training_db(self) -> Path:
        return self.global_shared_dir / "director_training.db"

    @property
    def global_shared_artifacts_dir(self) -> Path:
        return self.global_shared_dir / "artifacts"

    # ------------------------------------------------------------------ #
    # Back-compat aliases (deprecated, prefer global_shared_* above)      #
    # ------------------------------------------------------------------ #
    @property
    def user_shared_dir(self) -> Path:
        return self.global_shared_dir

    @property
    def user_shared_verification_db(self) -> Path:
        return self.global_shared_verification_db

    @property
    def user_shared_training_db(self) -> Path:
        return self.global_shared_training_db

    @property
    def user_shared_artifacts_dir(self) -> Path:
        return self.global_shared_artifacts_dir

    def has_legacy_payload(self) -> bool:
        legacy_items = (*self.LEGACY_STATE_ITEMS, *self.LEGACY_RUNTIME_ITEMS)
        return any((self.output_dir / name).exists() for name in legacy_items)

    def exists(self) -> bool:
        return (
            self.state_dir.exists()
            or self.runtime_dir.exists()
            or self.has_legacy_payload()
        )

    def ensure_dirs(self) -> None:
        for directory in (
            self.output_dir,
            self.state_dir,
            self.runtime_dir,
            self.logs_dir,
            self.staging_dir,
            self.temp_sketch_panels_dir,
        ):
            directory.mkdir(parents=True, exist_ok=True)

    def bootstrap_from_legacy_output(self) -> None:
        from ai_anime.migrations.filesystem import migrate_legacy_project_layout

        migrate_legacy_project_layout(self)
