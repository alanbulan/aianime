"""Ports required by Production use cases."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any, Protocol

from ai_anime.modules.production.domain.sketch_marker_detection import (
    SketchDetectionFrame,
)

if TYPE_CHECKING:
    from ai_anime.modules.production.application.director_control_sketch import (
        DirectorControlFrameStatus,
        DirectorControlSketchTask,
        DirectorControlSketchTaskReceipt,
    )
    from ai_anime.modules.production.application.episode_audio import (
        EpisodeAudioTask,
        EpisodeAudioTaskReceipt,
    )
    from ai_anime.modules.production.application.episode_video import (
        EpisodeVideoCompositionTask,
        EpisodeVideoTaskReceipt,
        FinalEpisodeVideoStatus,
    )
    from ai_anime.modules.production.application.video_pool import (
        AddGeneratedVideoCommand,
    )
    from ai_anime.modules.production.application.global_video_optimization import (
        GlobalVideoOptimizationMaterials,
        GlobalVideoOptimizationTask,
        GlobalVideoOptimizationTaskReceipt,
    )
    from ai_anime.modules.production.application.grid_regeneration import (
        GridRegenerationTask,
        GridRegenerationTaskReceipt,
        RegenerateGridCommand,
    )
    from ai_anime.modules.production.application.grid_pool import (
        BeatSketchCandidates,
        CutGridResult,
        GridPrompt,
        GridPoolListing,
        LocateGridPromptQuery,
        PersistGridCutCommand,
        PersistGridImageCommand,
        RebuiltGridPool,
        SelectedGridPoolImage,
        SelectGridPoolImageCommand,
        UploadedBeatPoolImage,
        UploadedGridImage,
        UploadBeatPoolImageCommand,
    )
    from ai_anime.modules.production.application.manual_sketch_regeneration import (
        GenerateMissingManualSketchesCommand,
        PreparedManualSketchRegeneration,
    )
    from ai_anime.modules.production.application.render_planning import (
        RenderExecutionMaterials,
        RenderPlanGridTask,
        RenderPlanGridTaskReceipt,
        RenderPlanningMaterials,
    )
    from ai_anime.modules.production.application.seedance2_panel import (
        CropSeedance2AssetCommand,
        RemoveSeedance2AssetCommand,
        Seedance2PanelQuery,
        TrimSeedance2AudioAssetCommand,
        UploadSeedance2AssetCommand,
    )
    from ai_anime.modules.production.application.selected_regeneration import (
        RegenerateSelectedBeatsCommand,
        SelectedRegenerationTask,
        SelectedRegenerationTaskReceipt,
    )
    from ai_anime.modules.production.application.single_video import (
        GenerateSingleVideoCommand,
        SingleVideoTask,
        SingleVideoTaskReceipt,
    )
    from ai_anime.modules.production.application.sketch_generation import (
        GenerateSketchesCommand,
        PreparedSketchGeneration,
        SketchGenerationTask,
        SketchGenerationTaskReceipt,
    )
    from ai_anime.modules.production.domain.video_pool import (
        VideoPool,
        VideoPoolEntry,
    )
    from ai_anime.modules.production.domain.render_planning import RenderPlanGrid
    from ai_anime.modules.project_workspace.public import ProjectContext


class SketchPoseFiles(Protocol):
    def image_size(self, image_path: Path) -> tuple[int, int]: ...

    def save_editor_state(
        self,
        image_path: Path,
        editor_state: dict[str, Any],
    ) -> None: ...


class SketchPoseIdentitySource(Protocol):
    def detected_identity_ids(self, beat: dict[str, Any]) -> list[str]: ...


class SketchImageFiles(Protocol):
    def image_size(self, image_path: Path) -> tuple[int, int]: ...

    def crop(
        self,
        image_path: Path,
        bounds: tuple[int, int, int, int],
    ) -> None: ...


class ProductionSettingsRepository(Protocol):
    def load(self, username: str, project: str) -> dict[str, Any]: ...

    def save(
        self,
        username: str,
        project: str,
        updates: dict[str, Any],
    ) -> None: ...


class ProductionImageSelectionCatalog(Protocol):
    def options(self) -> dict[str, str]: ...

    def normalize_render(self, value: str | None) -> str: ...

    def normalize_sketch(self, value: str | None) -> str: ...


class ProductionGenerationStore(Protocol):
    def get_all_characters(self) -> list[Any]: ...

    def get_sketch_colors(self, episode_num: int) -> dict[str, str]: ...

    async def set_sketch_colors(
        self,
        episode_num: int,
        colors: dict[str, str],
    ) -> None: ...


class ProductionSketchColorStore(Protocol):
    def get_sketch_colors(self, episode_num: int) -> dict[str, str]: ...

    async def set_sketch_colors(
        self,
        episode_num: int,
        colors: dict[str, str],
    ) -> None: ...

    async def update_episode(self, episode_num: int, **updates: Any) -> None: ...


class ProductionSketchColorAssigner(Protocol):
    def assign(
        self,
        characters: list[dict[str, Any]],
        beats: list[dict[str, Any]],
        *,
        existing_colors: dict[str, str] | None = None,
    ) -> dict[str, str]: ...


class ProductionCharacterProjector(Protocol):
    def project_characters(
        self,
        characters: list[Any],
        project: str,
    ) -> list[dict[str, Any]]: ...

    def build_character_map(
        self,
        *,
        beats: list[dict[str, Any]],
        characters: list[dict[str, Any]],
        project: str,
        sketch_colors: dict[str, str] | None,
        use_detected_identities: bool,
    ) -> dict[str, dict[str, Any]]: ...


class ProductionEpisodeSource(Protocol):
    def episode_or_none(self, store: Any, episode_num: int) -> Any | None: ...


class ProductionRuntimePropMenuSource(Protocol):
    async def for_episode(
        self,
        store: Any,
        episode: Any,
        beats: list[dict[str, Any]],
    ) -> list[dict[str, Any]]: ...


class ProductionSketchWorkspace(Protocol):
    def clear_episode_sketches(
        self,
        output_dir: str | Path,
        episode_num: int,
    ) -> None: ...


class ProductionSketchMarkerDetectionStore(Protocol):
    async def get_beats_as_dicts(
        self,
        episode_num: int,
    ) -> list[dict[str, Any]]: ...

    def get_sketch_colors(self, episode_num: int) -> dict[str, str]: ...

    async def get_script_as_dict(self, episode_num: int) -> dict[str, Any]: ...

    def get_all_characters(self) -> list[Any]: ...

    async def set_beat_detected_identities(
        self,
        episode_num: int,
        detections: dict[int, list[str]],
    ) -> int: ...

    async def set_beat_detected_props(
        self,
        episode_num: int,
        detections: dict[int, list[str]],
    ) -> int: ...


class ProductionSketchMarkerDetectionFiles(Protocol):
    def find_frames(
        self,
        project_dir: Path,
        episode_num: int,
        known_beat_numbers: set[int],
    ) -> list[SketchDetectionFrame]: ...

    def prepare_grid_dir(
        self,
        project_dir: Path,
        episode_num: int,
    ) -> Path: ...

    def combine_grid(
        self,
        image_paths: list[Path],
        output_path: Path,
        *,
        rows: int,
        cols: int,
    ) -> None: ...


class ProductionSketchMarkerDetector(Protocol):
    async def detect(
        self,
        *,
        grid_path: Path,
        color_marker_map: dict[str, str],
        total_panels: int,
    ) -> dict[Any, list[str]]: ...


class ProductionFeatureUsageMeter(Protocol):
    async def reserve_feature_start_credits(
        self,
        **kwargs: Any,
    ) -> dict[str, Any]: ...

    async def confirm_feature_credit_reservation(
        self,
        reservation_id: str,
        *,
        metadata: dict[str, Any] | None = None,
    ) -> None: ...

    async def refund_feature_credit_reservation(
        self,
        reservation_id: str,
        *,
        metadata: dict[str, Any] | None = None,
    ) -> None: ...

    def set_llm_usage_context(
        self,
        user_id: str,
        project_id: str = "",
        resource_kind: str = "",
        billing_metadata: dict[str, Any] | None = None,
    ) -> None: ...

    def clear_llm_usage_context(self) -> None: ...


class ProductionImageUsageReader(Protocol):
    def summary(
        self,
        project_output_dir: Path,
        *,
        task_types: tuple[str, ...] | None = None,
        episode: int | None = None,
    ) -> dict[str, int]: ...

    def count_scope_attempts(
        self,
        project_output_dir: Path,
        *,
        task_type: str,
        scope: str,
        episode: int | None = None,
    ) -> int: ...


class ProductionOperatorPasswordVerifier(Protocol):
    def verify(self, candidate: str) -> bool: ...


class ProductionEpisodeBeatSource(Protocol):
    async def for_episode(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> list[dict[str, Any]]: ...


class ProductionEpisodeVideoScheduler(Protocol):
    async def enqueue(
        self,
        context: ProjectContext,
        task: EpisodeVideoCompositionTask,
    ) -> EpisodeVideoTaskReceipt: ...


class ProductionFinalVideoCatalog(Protocol):
    def path(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> Path: ...

    def status(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> FinalEpisodeVideoStatus: ...


class ProductionEpisodeExportFiles(Protocol):
    async def subtitle_content(
        self,
        project_dir: Path,
        episode_num: int,
        beats: list[dict[str, Any]],
    ) -> str: ...

    async def create_archive(
        self,
        project_dir: Path,
        episode_num: int,
        beats: list[dict[str, Any]],
        *,
        final_video_path: Path | None,
        subtitle_content: str,
    ) -> Path: ...


class ProductionAudioVoicePrerequisiteChecker(Protocol):
    async def check(
        self,
        context: ProjectContext,
        episode_num: int,
        beat_numbers: list[int] | None,
        mode: str,
    ) -> list[str]: ...


class ProductionEpisodeAudioScheduler(Protocol):
    async def enqueue(
        self,
        context: ProjectContext,
        task: EpisodeAudioTask,
    ) -> EpisodeAudioTaskReceipt: ...


class ProductionVideoPoolStorage(Protocol):
    def load(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> VideoPool | None: ...

    def add(
        self,
        context: ProjectContext,
        command: AddGeneratedVideoCommand,
    ) -> VideoPoolEntry: ...

    def assign(
        self,
        context: ProjectContext,
        episode_num: int,
        beat_num: int,
        pool_id: str,
    ) -> bool: ...


class ProductionGridPoolGateway(Protocol):
    async def list_pool(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> GridPoolListing | None: ...

    def rebuild(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> RebuiltGridPool: ...

    async def sketch_candidates(
        self,
        context: ProjectContext,
        episode_num: int,
        beat_num: int,
    ) -> BeatSketchCandidates: ...

    async def select(
        self,
        context: ProjectContext,
        command: SelectGridPoolImageCommand,
    ) -> SelectedGridPoolImage: ...

    def upload(
        self,
        context: ProjectContext,
        command: UploadBeatPoolImageCommand,
    ) -> UploadedBeatPoolImage: ...

    def upload_grid(
        self,
        context: ProjectContext,
        command: PersistGridImageCommand,
    ) -> UploadedGridImage: ...

    def prompt(
        self,
        context: ProjectContext,
        query: LocateGridPromptQuery,
    ) -> GridPrompt: ...

    def cut(
        self,
        context: ProjectContext,
        command: PersistGridCutCommand,
    ) -> CutGridResult: ...


class ProductionProjectMediaUrls(Protocol):
    def build(
        self,
        context: ProjectContext,
        relative_path: str,
    ) -> str: ...


class ProductionVideoBackendSource(Protocol):
    def options(self) -> dict[str, str]: ...

    def model(self, video_backend: str) -> str | None: ...

    def duration_bounds(self) -> dict[str, tuple[int, int]]: ...


class ProductionGlobalVideoOptimizationSource(Protocol):
    async def load(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> GlobalVideoOptimizationMaterials: ...


class ProductionEpisodeSketchCatalog(Protocol):
    def has_any(self, context: ProjectContext, episode_num: int) -> bool: ...


class ProductionGlobalVideoOptimizationScheduler(Protocol):
    async def enqueue(
        self,
        context: ProjectContext,
        task: GlobalVideoOptimizationTask,
    ) -> GlobalVideoOptimizationTaskReceipt: ...


class ProductionSeedance2PanelGateway(Protocol):
    async def status(
        self,
        context: ProjectContext,
        query: Seedance2PanelQuery,
    ) -> dict[str, Any]: ...

    async def upload(
        self,
        context: ProjectContext,
        command: UploadSeedance2AssetCommand,
    ) -> dict[str, Any] | None: ...

    async def remove(
        self,
        context: ProjectContext,
        command: RemoveSeedance2AssetCommand,
    ) -> dict[str, Any] | None: ...

    async def crop(
        self,
        context: ProjectContext,
        command: CropSeedance2AssetCommand,
    ) -> dict[str, Any] | None: ...

    async def trim_audio(
        self,
        context: ProjectContext,
        command: TrimSeedance2AudioAssetCommand,
    ) -> dict[str, Any] | None: ...


class ProductionBeatAudioDurationSource(Protocol):
    async def for_beat(
        self,
        context: ProjectContext,
        episode_num: int,
        beat_num: int,
    ) -> float | None: ...


class ProductionSingleVideoPreparer(Protocol):
    async def prepare(
        self,
        context: ProjectContext,
        command: GenerateSingleVideoCommand,
    ) -> SingleVideoTask: ...


class ProductionSingleVideoScheduler(Protocol):
    async def enqueue(
        self,
        context: ProjectContext,
        task: SingleVideoTask,
    ) -> SingleVideoTaskReceipt: ...


class ProductionSketchGenerationPreparer(Protocol):
    async def prepare(
        self,
        context: ProjectContext,
        command: GenerateSketchesCommand,
    ) -> PreparedSketchGeneration: ...


class ProductionSketchGenerationScheduler(Protocol):
    async def enqueue(
        self,
        context: ProjectContext,
        task: SketchGenerationTask,
    ) -> SketchGenerationTaskReceipt: ...


class ProductionDirectorControlFrameSource(Protocol):
    def status(
        self,
        context: ProjectContext,
        episode_num: int,
        beat_num: int,
    ) -> DirectorControlFrameStatus: ...


class ProductionDirectorControlSketchScheduler(Protocol):
    async def enqueue(
        self,
        context: ProjectContext,
        task: DirectorControlSketchTask,
    ) -> DirectorControlSketchTaskReceipt: ...


class ProductionSelectedRegenerationPreparer(Protocol):
    async def prepare(
        self,
        context: ProjectContext,
        command: RegenerateSelectedBeatsCommand,
    ) -> SelectedRegenerationTask: ...


class ProductionSelectedRegenerationScheduler(Protocol):
    async def enqueue(
        self,
        context: ProjectContext,
        task: SelectedRegenerationTask,
    ) -> SelectedRegenerationTaskReceipt: ...


class ProductionManualSketchRegenerationPreparer(Protocol):
    async def prepare(
        self,
        context: ProjectContext,
        command: GenerateMissingManualSketchesCommand,
    ) -> PreparedManualSketchRegeneration: ...


class ProductionGridRegenerationPreparer(Protocol):
    async def prepare(
        self,
        context: ProjectContext,
        command: RegenerateGridCommand,
    ) -> GridRegenerationTask: ...


class ProductionGridRegenerationScheduler(Protocol):
    async def enqueue(
        self,
        context: ProjectContext,
        task: GridRegenerationTask,
    ) -> GridRegenerationTaskReceipt: ...


class ProductionRenderPlanAvailability(Protocol):
    def is_enabled(self) -> bool: ...


class ProductionRenderPlanningPreparer(Protocol):
    async def prepare(
        self,
        context: ProjectContext,
        *,
        episode_num: int,
        beat_numbers: tuple[int, ...],
        image_generation_selection: str | None,
    ) -> RenderPlanningMaterials: ...

    async def prepare_execution(
        self,
        context: ProjectContext,
        *,
        episode_num: int,
        all_beats: list[dict[str, Any]],
        sketch_aspect_padding: bool | None,
    ) -> RenderExecutionMaterials: ...


class ProductionRenderPlanEngine(Protocol):
    def build(
        self,
        materials: RenderPlanningMaterials,
        *,
        strategy: str,
        aspect_mode: str,
        force_one_by_one: bool,
    ) -> tuple[RenderPlanGrid, ...]: ...

    def hash(self, plan: tuple[RenderPlanGrid, ...]) -> str: ...

    def fingerprint(
        self,
        context: ProjectContext,
        materials: RenderPlanningMaterials,
        *,
        strategy: str,
        aspect_mode: str,
        force_one_by_one: bool,
    ) -> str: ...


class ProductionRenderPlanScheduler(Protocol):
    async def enqueue(
        self,
        context: ProjectContext,
        task: RenderPlanGridTask,
    ) -> RenderPlanGridTaskReceipt: ...
