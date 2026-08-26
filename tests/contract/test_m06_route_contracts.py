from __future__ import annotations

import asyncio
import base64
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ai_anime.modules.asset_world.public import CharacterIdentity, NovelCharacter
from ai_anime.modules.asset_world.public import NovelProp, NovelScene
from ai_anime.modules.narrative_planning.public import NovelEpisode
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import ProjectTaskSubmissionUseCases

pytestmark = pytest.mark.m06


_PROJECT = "demo"
_PROJECT_ID = "proj_m06"
_USER = "alice"
_CHARACTER = "林昭"
_IDENTITY_ID = "林昭_青年"
_SCENE = "雨巷"
_PROP = "旧伞"


def _png_bytes() -> bytes:
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (4, 4), color=(90, 120, 150)).save(buf, format="PNG")
    return buf.getvalue()


def _write_png(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(_png_bytes())
    return path


def _write_media(path: Path, content: bytes = b"media") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path


class _M06Store:
    def __init__(self):
        identity = CharacterIdentity(
            identity_id=_IDENTITY_ID,
            character_name=_CHARACTER,
            identity_name="青年",
            appearance_details="青衣短打",
            face_prompt="clear eyes",
            age_group="youth",
        )
        character = NovelCharacter(
            name=_CHARACTER,
            role="主角",
            is_main=True,
            face_prompt="sharp eyes",
            description="雨巷少年",
        )
        character.identities = [identity]
        self._characters = {character.name: character}
        self._episodes = {
            1: NovelEpisode(
                number=1,
                title="雨巷初遇",
                raw_content="第一章 雨巷初遇\n林昭撑伞走进雨巷。",
            )
        }
        self._scenes = {
            _SCENE: NovelScene(
                name=_SCENE,
                scene_type="exterior",
                environment_prompt="wet stone alley",
                description="雨夜石板巷",
            )
        }
        self._props = {
            _PROP: NovelProp(
                name=_PROP,
                prop_type="artifact",
                visual_prompt="old oil-paper umbrella",
                description="旧油纸伞",
                owner=_CHARACTER,
            )
        }
        self._sketch_colors = {1: {_IDENTITY_ID: "#6b8cff"}}

    def get_all_characters(self):
        return list(self._characters.values())

    def get_character(self, name: str):
        return self._characters.get(name)

    async def add_character_identity(self, name: str, identity: CharacterIdentity):
        self._characters[name].identities = [
            *self._characters[name].identities,
            identity,
        ]

    async def update_character_identity(self, name: str, identity_id: str, **updates):
        for identity in self._characters[name].identities:
            if identity.identity_id == identity_id:
                for key, value in updates.items():
                    setattr(identity, key, value)
        return True

    async def touch_identity(self, _name: str, _identity_id: str):
        return True

    async def list_props(self):
        return list(self._props.values())

    async def list_scenes(self):
        return list(self._scenes.values())

    async def get_episode_from_graph(self, episode: int):
        return self._episodes[episode]

    async def get_graph_snapshot(self):
        return {
            "nodes": [
                {
                    "id": "character-1",
                    "label": _CHARACTER,
                    "type": "Entity",
                    "degree": 1,
                    "properties": {"description": "雨巷少年"},
                },
                {
                    "id": "scene-1",
                    "label": _SCENE,
                    "type": "Entity",
                    "degree": 1,
                    "properties": {},
                },
            ],
            "edges": [
                {
                    "id": "edge-1",
                    "source": "character-1",
                    "target": "scene-1",
                    "relation": "appears_in",
                    "properties": {},
                }
            ],
            "total_nodes": 2,
            "total_edges": 1,
            "truncated": False,
        }

    async def list_visual_beats(self):
        return [
            SimpleNamespace(
                episode_number=1,
                beat_number=1,
                visual_description="林昭在{{林昭_青年}}身旁撑起[[旧伞]]。",
                scene_id=_SCENE,
                detected_identities_json=f'["{_IDENTITY_ID}"]',
                detected_props_json=f'["{_PROP}"]',
            )
        ]

    async def get_beats_as_dicts(self, episode: int):
        assert episode == 1
        return [
            {
                "beat_number": 1,
                "episode_number": 1,
                "visual_description": "林昭在{{林昭_青年}}身旁撑起[[旧伞]]。",
                "narration_segment": "雨声压低了脚步。",
                "scene_id": _SCENE,
                "detected_identities": [_IDENTITY_ID],
                "detected_props": [_PROP],
            }
        ]

    def get_sketch_colors(self, episode: int):
        return dict(self._sketch_colors.get(int(episode), {}))

    async def set_sketch_colors(self, episode: int, colors: dict):
        self._sketch_colors[int(episode)] = dict(colors or {})

    async def close(self):
        return None


class _FakeTaskBackend:
    def __init__(self, backend: str):
        self.backend = backend
        self.queue = "inline" if backend == "inline" else "default"
        self.calls: list[dict] = []

    async def enqueue_project_task(self, ctx, **kwargs):
        self.calls.append({"ctx": ctx, **kwargs})
        task_type = kwargs["task_type"]
        return SimpleNamespace(
            task_state=SimpleNamespace(task_id=f"task-{self.backend}-{task_type}"),
            backend=self.backend,
            queue=self.queue,
        )


class _FakeTaskManager:
    def __init__(self):
        self.tasks: dict[tuple[str, str], SimpleNamespace] = {}

    def set_completed(self, task_type: str, job_id: str, result: dict | None = None):
        self.tasks[(task_type, job_id)] = SimpleNamespace(
            status="completed",
            result=result or {},
            error=None,
            logs=[],
            current_task="done",
        )

    def get_task_for_project(
        self,
        _ctx,
        task_type: str,
        _episode: int,
        *,
        beat_num: int | None = None,
        scope: str,
    ):
        return self.tasks.get((task_type, scope))

    def get_task(
        self,
        task_type: str,
        _username: str,
        _project: str,
        _episode: int,
        *,
        beat_num: int | None = None,
        scope: str,
    ):
        return self.tasks.get((task_type, scope))


@pytest.fixture()
def m06_client_factory(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from ai_anime.shared import ports
    from ai_anime.api.routes.identity_access import dependencies as api_auth
    from ai_anime.api.deps import ProjectResolution
    from ai_anime.api.routes.story_intake import ingest
    from ai_anime.api.routes.creative_canvas import audio as freezone_audio
    from ai_anime.api.routes.creative_canvas import assets as freezone_assets
    from ai_anime.api.routes.creative_canvas import bootstrap as freezone_bootstrap
    from ai_anime.api.routes.creative_canvas import commits as freezone_commits
    from ai_anime.api.routes.creative_canvas import documents as freezone_documents
    from ai_anime.api.routes.creative_canvas import image as freezone_image
    from ai_anime.api.routes.creative_canvas import jobs as freezone_jobs
    from ai_anime.api.routes.creative_canvas import media as freezone_media
    from ai_anime.api.routes.creative_canvas import presets as freezone_presets
    from ai_anime.api.routes.creative_canvas import projections as freezone_projections
    from ai_anime.api.routes.creative_canvas import skills as freezone_skills
    from ai_anime.api.routes.creative_canvas import text as freezone_text
    from ai_anime.api.routes.creative_canvas import video as freezone_video
    from ai_anime.modules.creative_canvas.infrastructure.paths import uploads_dir
    from ai_anime.modules.creative_canvas.public import (
        CreativeCanvasMarkDetectionResult,
    )
    from ai_anime.modules.creative_canvas.application.audio_generation import (
        CreativeCanvasAudioGenerationUseCases,
    )
    from ai_anime.modules.creative_canvas.application.canvas_commits import (
        CreativeCanvasSlotCommitUseCases,
    )
    from ai_anime.modules.creative_canvas.application.canvas_events import (
        CreativeCanvasEventRecorder,
    )
    from ai_anime.modules.creative_canvas.application.image_to_3gs import (
        CreativeCanvasImageToThreeGsUseCases,
    )
    from ai_anime.modules.creative_canvas.application.image_editing import (
        CreativeCanvasImageEditingUseCases,
    )
    from ai_anime.modules.creative_canvas.application.image_generation import (
        CreativeCanvasImageGenerationUseCases,
    )
    from ai_anime.modules.creative_canvas.application.job_results import (
        CreativeCanvasJobResultQueries,
    )
    from ai_anime.modules.creative_canvas.application.mainline_generation import (
        CreativeCanvasMainlineGenerationUseCases,
    )
    from ai_anime.modules.creative_canvas.application.skill_catalog import (
        CreativeCanvasSkillCatalogQueries,
    )
    from ai_anime.modules.creative_canvas.application.skill_runs import (
        CreativeCanvasSkillRunUseCases,
    )
    from ai_anime.modules.creative_canvas.application.reverse_prompt import (
        CreativeCanvasReversePromptUseCases,
    )
    from ai_anime.modules.creative_canvas.application.text_processing import (
        CreativeCanvasTextProcessingUseCases,
    )
    from ai_anime.modules.creative_canvas.application.video_processing import (
        CreativeCanvasVideoProcessingUseCases,
    )
    from ai_anime.modules.creative_canvas.infrastructure import (
        canvas_assets,
        canvas_commits,
        canvas_presets,
    )
    from ai_anime.modules.asset_world.infrastructure import (
        character_identity as character_identity_infrastructure,
    )
    from ai_anime.modules.creative_canvas.application.video_asset_library import (
        CreativeCanvasVideoAssetLibraryUseCases,
    )
    from ai_anime.modules.creative_canvas.application.video_generation import (
        CreativeCanvasVideoGenerationUseCases,
    )
    from ai_anime.modules.creative_canvas.infrastructure.media_sources import (
        ProjectCreativeCanvasMediaSourceResolver,
    )
    from ai_anime.modules.creative_canvas.infrastructure.job_results import (
        LocalCreativeCanvasJobResultReader,
    )
    from ai_anime.modules.creative_canvas.infrastructure.mainline_generation import (
        LocalCreativeCanvasMainlineGenerationConfigSource,
        LocalCreativeCanvasScene360Runtime,
        PillowCreativeCanvasImageAspectReader,
    )
    from ai_anime.modules.creative_canvas.infrastructure.canvas_commits import (
        LocalCreativeCanvasSlotCommitGateway,
    )
    from ai_anime.modules.creative_canvas.infrastructure.canvas_events import (
        LocalCreativeCanvasEventWriter,
    )
    from ai_anime.modules.creative_canvas.infrastructure.skill_runs import (
        LocalCreativeCanvasSkillRunRepository,
        LocalCreativeCanvasSkillWorkspace,
        OptionalCreativeCanvasFrameReviewer,
        TaskManagerCreativeCanvasSkillTaskReader,
    )
    from ai_anime.modules.creative_canvas.infrastructure.video_generation import (
        ConfiguredCreativeCanvasVideoModelPolicy,
        FfprobeCreativeCanvasReferenceDurationProbe,
    )
    from ai_anime.modules.creative_canvas.infrastructure.video_asset_library import (
        LocalCreativeCanvasVideoAssetRepository,
        ProjectCreativeCanvasMainlineVideoAssetSource,
        SystemCreativeCanvasClock,
        UuidCreativeCanvasVideoAssetIdGenerator,
    )
    from ai_anime.modules.creative_canvas.infrastructure.image_editing import (
        FreezoneCreativeCanvasImagePromptComposer,
        FreezoneCreativeCanvasImageModelRouter,
        PillowCreativeCanvasImageEditingStorage,
    )
    from ai_anime.modules.creative_canvas.infrastructure.image_generation import (
        FreezoneCreativeCanvasImageGenerationModelRouter,
    )
    from ai_anime.modules.creative_canvas.infrastructure.media import (
        FreezoneJobIdGenerator,
    )
    from ai_anime.modules.creative_canvas.infrastructure.task_submission import (
        TaskExecutionCreativeCanvasTaskScheduler,
    )
    from ai_anime.modules.creative_canvas.infrastructure.text_sources import (
        LocalCreativeCanvasTextSourceReader,
    )
    from ai_anime.shared.utils.path_resolver import (
        canonical_beat_director_env_only_path,
        canonical_beat_selected_background_path,
        canonical_identity_path,
        canonical_portrait_path,
        canonical_prop_reference_path,
        canonical_scene_master_path,
        canonical_scene_reverse_master_path,
    )

    store = _M06Store()
    project_dir = tmp_path / "output" / _USER / _PROJECT
    state_dir = tmp_path / "state" / _USER / _PROJECT
    runtime_dir = tmp_path / "runtime" / _USER / _PROJECT
    for path in (project_dir, state_dir, runtime_dir):
        path.mkdir(parents=True, exist_ok=True)

    source_image = _write_png(uploads_dir(project_dir) / "source.png")
    mask_image = _write_png(uploads_dir(project_dir) / "mask.png")
    video_file = _write_media(uploads_dir(project_dir) / "clip.mp4", b"video")
    audio_file = _write_media(uploads_dir(project_dir) / "voice.mp3", b"audio")
    scene_master = _write_png(canonical_scene_master_path(project_dir, _SCENE))
    scene_reverse = _write_png(canonical_scene_reverse_master_path(project_dir, _SCENE))
    selected_background = _write_png(
        canonical_beat_selected_background_path(project_dir, 1, 1)
    )
    env_only = _write_png(canonical_beat_director_env_only_path(project_dir, 1, 1))
    portrait = _write_png(canonical_portrait_path(project_dir, _CHARACTER))
    identity = _write_png(
        canonical_identity_path(project_dir, _CHARACTER, _IDENTITY_ID)
    )
    prop = _write_png(canonical_prop_reference_path(project_dir, _PROP))
    uploads_dir(project_dir).mkdir(parents=True, exist_ok=True)

    ctx = ProjectContext(
        project_id=_PROJECT_ID,
        project_name=_PROJECT,
        owner_type="user",
        owner_id="user-alice",
        owner_username=_USER,
        requester_user_id="user-alice",
        requester_username=_USER,
        requester_principals=(("user", "user-alice"),),
        effective_role="owner",
        home_node_id="local",
        output_dir=project_dir,
        state_dir=state_dir,
        runtime_dir=runtime_dir,
        is_home_node=True,
    )
    resolution = ProjectResolution(
        ctx=ctx,
        username=_USER,
        project_name=_PROJECT,
        project_dir=project_dir,
        output_dir=str(project_dir),
        state_dir=str(state_dir),
        runtime_dir=str(runtime_dir),
    )

    async def resolve_project_scope(
        project: str,
        user: dict,
        *,
        required_role: str = "viewer",
        operation: str = "resolve project files",
    ):
        assert project == _PROJECT
        return resolution

    class FakeMarkDetectionUseCases:
        async def detect(self, command):
            return CreativeCanvasMarkDetectionResult(
                source_url=command.source_url,
                selection=command.selection,
                label="旧伞",
                note="框选区域中的物体",
                model="vision-model",
            )

    async def make_store_for_context(_ctx):
        return store

    async def build_beat_context(**_kwargs):
        return {
            "beat_data": (await store.get_beats_as_dicts(1))[0],
            "refs": [],
            "sketch_context": {"sketch_colors": {}, "prop_marker_colors": {}},
        }

    def static_url(_ctx, rel_path: str, local_path=None):
        return f"/static/projects/{_PROJECT_ID}/{rel_path}"

    monkeypatch.setattr(ingest, "resolve_project_scope", resolve_project_scope)
    monkeypatch.setattr(
        freezone_assets,
        "resolve_project_scope",
        resolve_project_scope,
    )
    monkeypatch.setattr(
        freezone_audio,
        "resolve_project_scope",
        resolve_project_scope,
    )
    monkeypatch.setattr(
        freezone_bootstrap,
        "resolve_project_scope",
        resolve_project_scope,
    )
    monkeypatch.setattr(
        freezone_commits,
        "resolve_project_scope",
        resolve_project_scope,
    )
    monkeypatch.setattr(
        freezone_documents,
        "resolve_project_scope",
        resolve_project_scope,
    )
    monkeypatch.setattr(
        freezone_image,
        "resolve_project_scope",
        resolve_project_scope,
    )
    monkeypatch.setattr(
        freezone_jobs,
        "resolve_project_scope",
        resolve_project_scope,
    )
    monkeypatch.setattr(
        freezone_image,
        "creative_canvas_mark_detection_use_cases",
        lambda: FakeMarkDetectionUseCases(),
    )
    monkeypatch.setattr(
        freezone_media,
        "resolve_project_scope",
        resolve_project_scope,
    )
    monkeypatch.setattr(
        freezone_presets,
        "resolve_project_scope",
        resolve_project_scope,
    )
    monkeypatch.setattr(
        freezone_projections,
        "resolve_project_scope",
        resolve_project_scope,
    )
    monkeypatch.setattr(
        freezone_skills,
        "resolve_project_scope",
        resolve_project_scope,
    )
    monkeypatch.setattr(
        freezone_text,
        "resolve_project_scope",
        resolve_project_scope,
    )
    monkeypatch.setattr(
        freezone_video,
        "resolve_project_scope",
        resolve_project_scope,
    )
    monkeypatch.setattr(
        canvas_assets,
        "make_sqlite_store_for_context",
        make_store_for_context,
    )
    monkeypatch.setattr(
        canvas_assets,
        "make_static_url_for_context",
        static_url,
    )
    monkeypatch.setattr(
        character_identity_infrastructure,
        "make_sqlite_store_for_context",
        make_store_for_context,
    )
    monkeypatch.setattr(
        character_identity_infrastructure,
        "make_static_url_for_context",
        static_url,
    )
    monkeypatch.setattr(
        canvas_commits,
        "make_sqlite_store_for_context",
        make_store_for_context,
    )
    monkeypatch.setattr(
        canvas_commits,
        "make_cognee_store_for_context",
        make_store_for_context,
    )
    monkeypatch.setattr(
        canvas_commits,
        "make_static_url_for_context",
        static_url,
    )
    monkeypatch.setattr(
        canvas_presets,
        "make_sqlite_store_for_context",
        make_store_for_context,
    )
    monkeypatch.setattr(
        canvas_presets,
        "build_beat_preset_context",
        build_beat_context,
    )

    assets = SimpleNamespace(
        image_url=f"/static/{_USER}/{_PROJECT}/freezone/_uploads/source.png",
        mask_url=f"/static/{_USER}/{_PROJECT}/freezone/_uploads/mask.png",
        video_url=f"/static/{_USER}/{_PROJECT}/freezone/_uploads/clip.mp4",
        audio_url=f"/static/{_USER}/{_PROJECT}/freezone/_uploads/voice.mp3",
        scene_master_url=f"/static/{_USER}/{_PROJECT}/assets/scenes/{_SCENE}/master.png",
        scene_reverse_url=f"/static/{_USER}/{_PROJECT}/assets/scenes/{_SCENE}/reverse_master.png",
        selected_background_url=(
            f"/static/{_USER}/{_PROJECT}/director_control_frames/ep001/"
            "beat_01/selected_background.png"
        ),
        source_image=source_image,
        mask_image=mask_image,
        video_file=video_file,
        audio_file=audio_file,
        scene_master=scene_master,
        scene_reverse=scene_reverse,
        selected_background=selected_background,
        env_only=env_only,
        portrait=portrait,
        identity=identity,
        prop=prop,
        ctx=ctx,
        freezone=freezone_image,
        freezone_text=freezone_text,
    )

    def build(backend: str = "inline"):
        task_backend = _FakeTaskBackend(backend)
        task_manager = _FakeTaskManager()
        job_result_queries = CreativeCanvasJobResultQueries(
            LocalCreativeCanvasJobResultReader(
                task_manager_factory=lambda: task_manager,
                static_url_builder=static_url,
            )
        )
        task_scheduler = TaskExecutionCreativeCanvasTaskScheduler(
            ProjectTaskSubmissionUseCases(lambda: task_backend)
        )
        audio_generation_use_cases = CreativeCanvasAudioGenerationUseCases(
            FreezoneJobIdGenerator(),
            task_scheduler,
        )
        reverse_prompt_use_cases = CreativeCanvasReversePromptUseCases(
            ProjectCreativeCanvasMediaSourceResolver(),
            FreezoneJobIdGenerator(),
            task_scheduler,
        )
        image_to_three_gs_use_cases = CreativeCanvasImageToThreeGsUseCases(
            ProjectCreativeCanvasMediaSourceResolver(),
            FreezoneJobIdGenerator(),
            task_scheduler,
        )
        image_editing_use_cases = CreativeCanvasImageEditingUseCases(
            ProjectCreativeCanvasMediaSourceResolver(),
            PillowCreativeCanvasImageEditingStorage(),
            FreezoneCreativeCanvasImagePromptComposer(),
            FreezoneCreativeCanvasImageModelRouter(),
            FreezoneJobIdGenerator(),
            task_scheduler,
        )
        image_generation_use_cases = CreativeCanvasImageGenerationUseCases(
            ProjectCreativeCanvasMediaSourceResolver(),
            FreezoneCreativeCanvasImagePromptComposer(),
            FreezoneCreativeCanvasImageGenerationModelRouter(),
            FreezoneJobIdGenerator(),
            task_scheduler,
        )
        mainline_generation_use_cases = CreativeCanvasMainlineGenerationUseCases(
            ProjectCreativeCanvasMediaSourceResolver(),
            LocalCreativeCanvasMainlineGenerationConfigSource(
                store_factory=make_store_for_context
            ),
            PillowCreativeCanvasImageAspectReader(),
            LocalCreativeCanvasScene360Runtime(),
            FreezoneJobIdGenerator(),
            task_scheduler,
        )
        event_recorder = CreativeCanvasEventRecorder(LocalCreativeCanvasEventWriter())
        slot_commit_use_cases = CreativeCanvasSlotCommitUseCases(
            LocalCreativeCanvasSlotCommitGateway(
                store_factory=make_store_for_context,
                cognee_store_factory=make_store_for_context,
                static_url_builder=static_url,
            ),
            event_recorder,
        )
        skill_run_use_cases = CreativeCanvasSkillRunUseCases(
            CreativeCanvasSkillCatalogQueries(),
            LocalCreativeCanvasSkillRunRepository(),
            LocalCreativeCanvasSkillWorkspace(store_factory=make_store_for_context),
            TaskManagerCreativeCanvasSkillTaskReader(
                task_manager_factory=lambda: task_manager
            ),
            OptionalCreativeCanvasFrameReviewer(),
            FreezoneJobIdGenerator(),
            mainline_generation_use_cases,
            image_generation_use_cases,
            slot_commit_use_cases,
            event_recorder,
        )
        video_processing_use_cases = CreativeCanvasVideoProcessingUseCases(
            ProjectCreativeCanvasMediaSourceResolver(),
            FreezoneJobIdGenerator(),
            task_scheduler,
        )
        text_processing_use_cases = CreativeCanvasTextProcessingUseCases(
            ProjectCreativeCanvasMediaSourceResolver(),
            LocalCreativeCanvasTextSourceReader(),
            FreezoneJobIdGenerator(),
            task_scheduler,
        )
        video_asset_repository = LocalCreativeCanvasVideoAssetRepository()
        video_asset_library_use_cases = CreativeCanvasVideoAssetLibraryUseCases(
            video_asset_repository,
            ProjectCreativeCanvasMediaSourceResolver(),
            ProjectCreativeCanvasMainlineVideoAssetSource(
                store_factory=make_store_for_context,
                static_url_builder=static_url,
            ),
            UuidCreativeCanvasVideoAssetIdGenerator(),
            SystemCreativeCanvasClock(),
        )
        video_generation_use_cases = CreativeCanvasVideoGenerationUseCases(
            ProjectCreativeCanvasMediaSourceResolver(),
            ConfiguredCreativeCanvasVideoModelPolicy(),
            FfprobeCreativeCanvasReferenceDurationProbe(),
            video_asset_repository,
            FreezoneJobIdGenerator(),
            task_scheduler,
        )
        monkeypatch.setattr(
            freezone_audio,
            "creative_canvas_audio_generation_use_cases",
            lambda use_cases=audio_generation_use_cases: use_cases,
        )
        monkeypatch.setattr(
            freezone_image,
            "creative_canvas_reverse_prompt_use_cases",
            lambda use_cases=reverse_prompt_use_cases: use_cases,
        )
        monkeypatch.setattr(
            freezone_image,
            "creative_canvas_image_to_three_gs_use_cases",
            lambda use_cases=image_to_three_gs_use_cases: use_cases,
        )
        monkeypatch.setattr(
            freezone_image,
            "creative_canvas_image_editing_use_cases",
            lambda use_cases=image_editing_use_cases: use_cases,
        )
        monkeypatch.setattr(
            freezone_image,
            "creative_canvas_reference_image_editing_use_cases",
            lambda use_cases=image_editing_use_cases: use_cases,
        )
        monkeypatch.setattr(
            freezone_image,
            "creative_canvas_image_generation_use_cases",
            lambda use_cases=image_generation_use_cases: use_cases,
        )
        monkeypatch.setattr(
            freezone_jobs,
            "creative_canvas_job_result_queries",
            lambda queries=job_result_queries: queries,
        )
        monkeypatch.setattr(
            freezone_skills,
            "creative_canvas_mainline_generation_use_cases",
            lambda use_cases=mainline_generation_use_cases: use_cases,
        )
        monkeypatch.setattr(
            freezone_skills,
            "creative_canvas_skill_run_use_cases",
            lambda use_cases=skill_run_use_cases: use_cases,
        )
        monkeypatch.setattr(
            freezone_video,
            "creative_canvas_video_processing_use_cases",
            lambda use_cases=video_processing_use_cases: use_cases,
        )
        monkeypatch.setattr(
            freezone_text,
            "creative_canvas_text_processing_use_cases",
            lambda use_cases=text_processing_use_cases: use_cases,
        )
        monkeypatch.setattr(
            freezone_video,
            "creative_canvas_video_asset_library_use_cases",
            lambda use_cases=video_asset_library_use_cases: use_cases,
        )
        monkeypatch.setattr(
            freezone_video,
            "creative_canvas_video_generation_use_cases",
            lambda use_cases=video_generation_use_cases: use_cases,
        )
        monkeypatch.setattr(ports, "get_task_backend", lambda tb=task_backend: tb)
        app = FastAPI()
        app.include_router(ingest.router, prefix="/api/v1")
        app.include_router(freezone_audio.router, prefix="/api/v1")
        app.include_router(freezone_assets.router, prefix="/api/v1")
        app.include_router(freezone_bootstrap.router, prefix="/api/v1")
        app.include_router(freezone_commits.router, prefix="/api/v1")
        app.include_router(freezone_documents.router, prefix="/api/v1")
        app.include_router(freezone_image.router, prefix="/api/v1")
        app.include_router(freezone_jobs.router, prefix="/api/v1")
        app.include_router(freezone_media.router, prefix="/api/v1")
        app.include_router(freezone_presets.router, prefix="/api/v1")
        app.include_router(freezone_projections.router, prefix="/api/v1")
        app.include_router(freezone_skills.router, prefix="/api/v1")
        app.include_router(freezone_text.router, prefix="/api/v1")
        app.include_router(freezone_video.router, prefix="/api/v1")
        user = {
            "id": "user-alice",
            "user_id": "user-alice",
            "username": _USER,
            "role": "owner",
        }
        app.dependency_overrides[api_auth.get_api_user] = lambda user=user: user
        app.dependency_overrides[ingest.get_api_user] = lambda user=user: user
        app.dependency_overrides[freezone_audio.get_api_user] = lambda user=user: user
        app.dependency_overrides[freezone_assets.get_api_user] = lambda user=user: user
        app.dependency_overrides[freezone_bootstrap.get_api_user] = lambda user=user: (
            user
        )
        app.dependency_overrides[freezone_commits.get_api_user] = lambda user=user: user
        app.dependency_overrides[freezone_image.get_api_user] = lambda user=user: user
        app.dependency_overrides[freezone_jobs.get_api_user] = lambda user=user: user
        app.dependency_overrides[freezone_media.get_api_user] = lambda user=user: user
        app.dependency_overrides[freezone_presets.get_api_user] = lambda user=user: user
        app.dependency_overrides[freezone_projections.get_api_user] = lambda user=user: (
            user
        )
        app.dependency_overrides[freezone_skills.get_api_user] = lambda user=user: user
        app.dependency_overrides[freezone_text.get_api_user] = lambda user=user: user
        app.dependency_overrides[freezone_video.get_api_user] = lambda user=user: user

        async def override_cognee_store():
            yield store

        app.dependency_overrides[ingest.get_cognee_store] = override_cognee_store
        return TestClient(app), task_backend, task_manager, project_dir, assets, store

    return build


def _assert_ok(response):
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["ok"] is True
    return payload


def _task_data(payload: dict) -> dict:
    data = payload.get("data")
    return data if isinstance(data, dict) else payload


def _assert_task_shape(payload: dict, *, backend: str, task_type: str) -> dict:
    data = _task_data(payload)
    assert data["task_type"] == task_type
    assert data["job_id"]
    assert data["task_key"]
    assert data["backend"] == backend
    assert data["queue"] == ("inline" if backend == "inline" else "default")
    assert data.get("task_id")
    return data


def _assert_freezone_http_task_shape(payload: dict, *, task_type: str) -> dict:
    data = _task_data(payload)
    assert data["task_type"] == task_type
    assert data["job_id"]
    assert data["task_key"]
    return data


def _assert_skill_task_shape(payload: dict, *, task_type: str):
    assert payload["status"] == "queued"
    assert payload["task_type"] == task_type
    assert payload["job_id"]
    assert payload["task_key"]
    assert payload["run_id"] == f"{task_type}:{payload['job_id']}"


def test_m06_freezone_skill_catalog_contract(m06_client_factory):
    client, _backend, _task_manager, _project_dir, _assets, _store = m06_client_factory(
        "inline"
    )

    skills = _assert_ok(client.get("/api/v1/freezone/skills"))["data"]

    assert [skill["id"] for skill in skills] == [
        "freezone.sketch_from_context",
        "freezone.sketch_from_director_combined",
        "freezone.frame_from_context",
        "freezone.set_selected_background",
        "freezone.set_director_combined",
        "freezone.scene_360",
        "agent.review_frame",
        "workflow.plan_beat_graph",
    ]
    assert all(skill["schema_version"] == "skill.v1" for skill in skills)


def test_m06_ingest_upload_preview_and_unsupported_format(m06_client_factory):
    client, _backend, _task_manager, _project_dir, _assets, _store = m06_client_factory(
        "inline"
    )

    response = client.post(
        f"/api/v1/projects/{_PROJECT}/ingest/upload",
        files={
            "file": (
                "novel.txt",
                "第一章 雨巷\n林昭撑伞。\n\n第二章 归途\n雨停了。",
                "text/plain",
            )
        },
    )
    payload = _assert_ok(response)
    data = payload["data"]
    assert data["filename"] == "novel.txt"
    assert data["size"] > 0
    assert data["chapters"]

    response = client.post(
        f"/api/v1/projects/{_PROJECT}/ingest/upload",
        files={"file": ("archive.zip", b"zip", "application/zip")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is False
    assert payload["error_type"] == "unsupported"


def test_m06_freezone_media_upload_and_screenshot(m06_client_factory):
    client, _backend, _task_manager, project_dir, _assets, _store = m06_client_factory(
        "inline"
    )

    upload_content = b"uploaded media"
    upload = _assert_ok(
        client.post(
            f"/api/v1/projects/{_PROJECT}/freezone/upload",
            files={"file": ("reference image.png", upload_content, "image/png")},
        )
    )["data"]
    upload_path = project_dir / "freezone" / "_uploads" / upload["filename"]
    assert upload["filename"].endswith("_reference_image.png")
    assert upload["size"] == len(upload_content)
    assert upload["url"].startswith(
        f"/static/projects/{_PROJECT_ID}/freezone/_uploads/"
    )
    assert upload_path.read_bytes() == upload_content

    png = _png_bytes()
    screenshot = _assert_ok(
        client.post(
            f"/api/v1/projects/{_PROJECT}/freezone/three-d-viewer/screenshot",
            json={
                "data_url": "data:image/png;base64,"
                + base64.b64encode(png).decode("ascii"),
                "node_id": "three-d-node",
                "label": " ",
            },
        )
    )["data"]
    screenshot_path = project_dir / screenshot["rel_path"]
    assert len(screenshot["id"]) == 16
    assert screenshot["label"] == "3D viewer screenshot"
    assert screenshot["node_id"] == "three-d-node"
    assert screenshot["media_type"] == "image"
    assert screenshot["size"] == len(png)
    assert screenshot["url"].startswith(
        f"/static/projects/{_PROJECT_ID}/freezone/_outputs/three_d_viewer/"
    )
    assert screenshot_path.read_bytes() == png


def test_m06_video_asset_library_contract(m06_client_factory):
    client, _backend, _task_manager, _project_dir, assets, _store = m06_client_factory(
        "inline"
    )
    endpoint = f"/api/v1/projects/{_PROJECT}/freezone/video/character-library"

    created = _assert_ok(
        client.post(
            endpoint,
            json={
                "name": "林昭参考",
                "media": "image",
                "image_urls": [assets.image_url],
            },
        )
    )["data"]
    assert created["name"] == "林昭参考"
    assert created["image_urls"] == [assets.image_url]
    assert created["cover_url"] == assets.image_url

    listed = _assert_ok(client.get(endpoint))["data"]
    assert [item["id"] for item in listed] == [created["id"]]

    synced = _assert_ok(
        client.post(
            f"/api/v1/projects/{_PROJECT}/freezone/video/asset-library/"
            "sync-from-mainline"
        )
    )
    assert synced["synced"] == 3
    assert {item["id"] for item in synced["data"]} == {
        created["id"],
        f"mainline:character:{_CHARACTER}",
        f"mainline:scene:{_SCENE}",
        f"mainline:prop:{_PROP}",
    }

    repeated = _assert_ok(
        client.post(
            f"/api/v1/projects/{_PROJECT}/freezone/video/asset-library/"
            "sync-from-mainline"
        )
    )
    assert len(repeated["data"]) == 4

    deleted = _assert_ok(client.delete(f"{endpoint}/{created['id']}"))["data"]
    assert deleted == {"id": created["id"], "deleted": True}
    missing = client.delete(f"{endpoint}/{created['id']}")
    assert missing.status_code == 404
    assert missing.json()["detail"] == (
        f"video character library item not found: {created['id']}"
    )


def test_m06_freezone_mark_detection_contract(m06_client_factory):
    client, _backend, _task_manager, _project_dir, assets, _store = m06_client_factory(
        "inline"
    )

    data = _assert_ok(
        client.post(
            f"/api/v1/projects/{_PROJECT}/freezone/marks/detect",
            json={
                "source_url": assets.image_url,
                "point_x": 0.25,
                "point_y": 0.75,
            },
        )
    )["data"]

    assert data == {
        "mark": {
            "label": "旧伞",
            "source_url": assets.image_url,
            "point_x": 0.25,
            "point_y": 0.75,
            "box_x": None,
            "box_y": None,
            "box_width": None,
            "box_height": None,
            "note": "框选区域中的物体",
        },
        "model": "vision-model",
    }


def test_m06_ingest_exposes_real_knowledge_graph_snapshot(m06_client_factory):
    client, _backend, _task_manager, _project_dir, _assets, _store = m06_client_factory(
        "inline"
    )

    response = client.get(f"/api/v1/projects/{_PROJECT}/ingest/graph")
    payload = _assert_ok(response)

    assert payload["data"]["total_nodes"] == 2
    assert payload["data"]["total_edges"] == 1
    assert payload["data"]["nodes"][0]["label"] == _CHARACTER
    assert payload["data"]["edges"][0]["relation"] == "appears_in"


@pytest.mark.parametrize("backend", ["inline", "celery"])
def test_m06_ingest_start_task_shape_is_ce_ee_isomorphic(
    m06_client_factory, backend: str
):
    client, task_backend, _task_manager, project_dir, _assets, _store = (
        m06_client_factory(backend)
    )
    upload = project_dir / "uploads" / "novel.txt"
    upload.parent.mkdir(parents=True, exist_ok=True)
    upload.write_text("第一章 雨巷\n林昭撑伞。", encoding="utf-8")

    response = client.post(
        f"/api/v1/projects/{_PROJECT}/ingest/start",
        json={
            "filename": "novel.txt",
            "textModel": "cloud-text-standard",
            "embeddingModel": "cloud-embedding-standard",
            "rebuild": False,
        },
    )
    payload = _assert_ok(response)
    assert payload["task_type"] == "ingest_fast"
    assert payload["task_key"]
    assert payload["backend"] == backend
    assert payload["queue"] == ("inline" if backend == "inline" else "default")
    assert [call["task_type"] for call in task_backend.calls] == ["ingest_fast"]


def _freezone_task_cases(client: TestClient, assets: SimpleNamespace):
    p = _PROJECT
    image = assets.image_url
    video = assets.video_url
    image_model = "cloud-image-standard"
    return [
        (
            "freezone_gen",
            client.post(
                f"/api/v1/projects/{p}/freezone/gen",
                json={"prompt": "rain alley", "model": image_model},
            ),
        ),
        (
            "sketch_generation",
            client.post(
                f"/api/v1/projects/{p}/freezone/sketch-from-context",
                json={
                    "episode": 1,
                    "beat": 1,
                    "source_kind": "beat",
                    "model": image_model,
                },
            ),
        ),
        (
            "mainline_frame_from_context",
            client.post(
                f"/api/v1/projects/{p}/freezone/frame-from-context",
                json={
                    "episode": 1,
                    "beat": 1,
                    "sketch_url": image,
                    "model": image_model,
                },
            ),
        ),
        (
            "stage_asset",
            client.post(
                f"/api/v1/projects/{p}/freezone/scene-360",
                json={
                    "reference_url": assets.scene_master_url,
                    "mode": "candidate",
                    "model": image_model,
                },
            ),
        ),
        (
            "freezone_edit",
            client.post(
                f"/api/v1/projects/{p}/freezone/multi-view",
                json={
                    "source_url": image,
                    "prompt": "front view",
                    "model": image_model,
                },
            ),
        ),
        (
            "freezone_edit",
            client.post(
                f"/api/v1/projects/{p}/freezone/relight",
                json={
                    "source_url": image,
                    "prompt": "soft light",
                    "model": image_model,
                },
            ),
        ),
        (
            "freezone_edit",
            client.post(
                f"/api/v1/projects/{p}/freezone/template-edit",
                json={
                    "source_url": image,
                    "mode": "story_pitch_four_grid",
                    "model": image_model,
                },
            ),
        ),
        (
            "freezone_image_to_3gs",
            client.post(
                f"/api/v1/projects/{p}/freezone/image-to-3gs",
                json={"source_url": image, "source_kind": "master"},
            ),
        ),
        (
            "freezone_edit",
            client.post(
                f"/api/v1/projects/{p}/freezone/upscale",
                json={"source_url": image, "model": image_model},
            ),
        ),
        (
            "freezone_edit",
            client.post(
                f"/api/v1/projects/{p}/freezone/outpaint",
                json={"source_url": image, "model": image_model},
            ),
        ),
        (
            "freezone_edit",
            client.post(
                f"/api/v1/projects/{p}/freezone/redraw",
                json={
                    "source_url": image,
                    "prompt": "redraw",
                    "model": image_model,
                },
            ),
        ),
        (
            "freezone_image_reverse_prompt",
            client.post(
                f"/api/v1/projects/{p}/freezone/image/reverse-prompt",
                json={"source_url": image},
            ),
        ),
        (
            "freezone_edit",
            client.post(
                f"/api/v1/projects/{p}/freezone/edit",
                json={
                    "base_url": image,
                    "prompt": "edit",
                    "model": image_model,
                },
            ),
        ),
        (
            "freezone_extract",
            client.post(
                f"/api/v1/projects/{p}/freezone/extract-frames",
                json={"video_url": video, "max_frames": 3},
            ),
        ),
        (
            "freezone_analyze",
            client.post(
                f"/api/v1/projects/{p}/freezone/analyze-shots",
                json={"frame_urls": [image]},
            ),
        ),
        (
            "freezone_video_story",
            client.post(
                f"/api/v1/projects/{p}/freezone/analyze-video-story",
                json={"video_url": video, "max_frames": 3},
            ),
        ),
        (
            "freezone_video_gen",
            client.post(
                f"/api/v1/projects/{p}/freezone/video/gen",
                json={
                    "prompt": "rain alley video",
                    "model": "cloud-video-standard",
                },
            ),
        ),
        (
            "freezone_video_gen",
            client.post(
                f"/api/v1/projects/{p}/freezone/video/i2v",
                json={
                    "image_urls": [image],
                    "prompt": "move",
                    "model": "cloud-video-standard",
                    "gen_mode": "imageToVideo",
                },
            ),
        ),
        (
            "freezone_video_gen",
            client.post(
                f"/api/v1/projects/{p}/freezone/video/keyframes",
                json={
                    "first_frame_url": image,
                    "prompt": "move",
                    "model": "cloud-video-standard",
                    "gen_mode": "firstFrame",
                },
            ),
        ),
        (
            "freezone_video_gen",
            client.post(
                f"/api/v1/projects/{p}/freezone/video/omni-gen",
                json={
                    "prompt": "omni",
                    "model": "cloud-video-standard",
                    "references": [
                        {"type": "image", "url": image, "role": "reference"}
                    ],
                },
            ),
        ),
        (
            "freezone_video_gen",
            client.post(
                f"/api/v1/projects/{p}/freezone/video/video-edit",
                json={
                    "video_url": video,
                    "prompt": "restyle",
                    "model": "cloud-video-standard",
                },
            ),
        ),
        (
            "freezone_video_erase",
            client.post(
                f"/api/v1/projects/{p}/freezone/video/erase", json={"source_url": video}
            ),
        ),
        (
            "freezone_video_upscale",
            client.post(
                f"/api/v1/projects/{p}/freezone/video/upscale",
                json={"source_url": video},
            ),
        ),
        (
            "freezone_audio_separate",
            client.post(
                f"/api/v1/projects/{p}/freezone/video/audio-separate",
                json={"source_url": video},
            ),
        ),
        (
            "freezone_video_compose",
            client.post(
                f"/api/v1/projects/{p}/freezone/video/compose",
                json={
                    "title": "compose",
                    "tracks": [
                        {
                            "track_id": "v1",
                            "kind": "video",
                            "items": [
                                {
                                    "item_id": "clip1",
                                    "source_url": video,
                                    "source_start": 0,
                                    "source_end": 1,
                                }
                            ],
                        }
                    ],
                },
            ),
        ),
        (
            "freezone_text_translate",
            client.post(
                f"/api/v1/projects/{p}/freezone/text/translate",
                json={
                    "text": "hello",
                    "model": "cloud-text-standard",
                    "node_type": "text",
                },
            ),
        ),
        (
            "freezone_story_script",
            client.post(
                f"/api/v1/projects/{p}/freezone/text/story-script",
                json={
                    "source_text": "雨巷里，林昭撑伞。",
                    "model": "cloud-text-standard",
                },
            ),
        ),
        (
            "freezone_audio_speech",
            client.post(
                f"/api/v1/projects/{p}/freezone/audio/speech",
                json={
                    "text": "雨声压低了脚步。",
                },
            ),
        ),
        (
            "freezone_audio_eleven_music",
            client.post(
                f"/api/v1/projects/{p}/freezone/audio/eleven-music",
                json={
                    "input": "cinematic rain-soaked suspense music",
                },
            ),
        ),
    ]


@pytest.mark.parametrize("backend", ["inline", "celery"])
def test_m06_freezone_task_backend_responses_are_ce_ee_isomorphic(
    m06_client_factory, backend: str
):
    client, task_backend, _task_manager, _project_dir, assets, _store = (
        m06_client_factory(backend)
    )

    cases = _freezone_task_cases(client, assets)
    assert len(cases) == 29
    for task_type, response in cases:
        assert response.status_code == 200, response.text
        _assert_freezone_http_task_shape(response.json(), task_type=task_type)

    response = client.post(
        f"/api/v1/projects/{_PROJECT}/freezone/skills/freezone.sketch_from_context/run",
        json={
            "schema_version": "skill.v1",
            "skill_node_id": "skill-node",
            "canvas_id": "canvas-skill",
            "parameters": {
                "aspect_ratio": "2:3",
                "model": "cloud-image-standard",
            },
            "resolved_inputs": [
                {
                    "role": "beat_context",
                    "node_id": "beat",
                    "node_type": "beatContextNode",
                    "beat_context": {
                        "episode": 1,
                        "beat": 1,
                        "visual_description": "林昭在雨巷中。",
                    },
                },
                {
                    "role": "background",
                    "node_id": "bg",
                    "node_type": "imageNode",
                    "image_url": assets.image_url,
                },
            ],
        },
    )
    assert response.status_code == 200, response.text
    _assert_skill_task_shape(response.json(), task_type="mainline_sketch_from_context")

    assert len(task_backend.calls) == len(cases) + 1
    assert {call["task_type"] for call in task_backend.calls} >= {
        "freezone_gen",
        "freezone_edit",
        "freezone_image_to_3gs",
        "freezone_extract",
        "freezone_analyze",
        "freezone_video_story",
        "freezone_video_gen",
        "freezone_video_compose",
        "freezone_text_translate",
        "freezone_story_script",
        "freezone_audio_speech",
        "freezone_audio_eleven_music",
    }


@pytest.mark.parametrize("backend", ["inline", "celery"])
def test_m06_freezone_task_backend_l1_helper_payloads_keep_backend_and_queue(
    m06_client_factory, backend: str
):
    from ai_anime.modules.creative_canvas.application.image_generation import (
        StartCreativeCanvasImageGenerationCommand,
    )
    from ai_anime.modules.creative_canvas.application.text_processing import (
        StartCreativeCanvasTextTranslationCommand,
    )

    _client, _task_backend, _task_manager, project_dir, assets, _store = (
        m06_client_factory(backend)
    )
    freezone = assets.freezone
    freezone_text = assets.freezone_text

    async def run_helpers():
        image = await freezone.creative_canvas_image_generation_use_cases().start(
            StartCreativeCanvasImageGenerationCommand(
                context=assets.ctx,
                project_dir=project_dir,
                prompt="l1 image",
                aspect_ratio="1:1",
                image_size="2K",
                model="cloud-image-standard",
                quality="medium",
            )
        )
        text = await freezone_text.creative_canvas_text_processing_use_cases().start_translation(
            StartCreativeCanvasTextTranslationCommand(
                context=assets.ctx,
                project_dir=project_dir,
                text="hello",
                model="cloud-text-standard",
                model_selector=None,
                node_type="text",
            )
        )
        return image, text

    image_receipt, text_receipt = asyncio.run(run_helpers())
    assert image_receipt.task_type == "freezone_gen"
    assert image_receipt.backend == backend
    assert image_receipt.queue == ("inline" if backend == "inline" else "default")
    assert text_receipt.task_type == "freezone_text_translate"
    assert text_receipt.backend == backend
    assert text_receipt.queue == ("inline" if backend == "inline" else "default")
    assert text_receipt.task_id


def test_m06_freezone_job_result_reads_terminal_output(m06_client_factory):
    client, _backend, task_manager, project_dir, _assets, _store = m06_client_factory(
        "inline"
    )

    response = client.post(
        f"/api/v1/projects/{_PROJECT}/freezone/gen",
        json={"prompt": "terminal output", "model": "cloud-image-standard"},
    )
    data = _assert_freezone_http_task_shape(response.json(), task_type="freezone_gen")
    out = (
        project_dir / "freezone" / "_outputs" / "freezone_gen" / f"{data['job_id']}.png"
    )
    _write_png(out)
    task_manager.set_completed(
        "freezone_gen", data["job_id"], {"output_path": str(out)}
    )

    result = _assert_ok(
        client.get(
            f"/api/v1/projects/{_PROJECT}/freezone/jobs/freezone_gen/{data['job_id']}/result"
        )
    )
    assert result["data"]["url"].startswith(f"/static/projects/{_PROJECT_ID}/")
    assert out.parent.name == "freezone_gen"


def test_m06_freezone_canvas_crud_revision_idempotency_history_and_default_guard(
    m06_client_factory,
):
    client, _backend, _task_manager, _project_dir, _assets, _store = m06_client_factory(
        "inline"
    )

    first_init = _assert_ok(client.post(f"/api/v1/projects/{_PROJECT}/freezone/init"))
    second_init = _assert_ok(client.post(f"/api/v1/projects/{_PROJECT}/freezone/init"))
    assert first_init["data"]["default_canvas"]["canvas_id"] == "default"
    assert second_init["data"]["default_canvas"]["canvas_id"] == "default"

    created = _assert_ok(
        client.post(
            f"/api/v1/projects/{_PROJECT}/freezone/canvases:from-preset",
            json={"scope": "blank", "canvas_id": "acceptance_canvas"},
        )
    )
    canvas_id = created["data"]["canvas_id"]
    assert canvas_id.startswith("blank_")
    assert created["data"]["reused"] is False

    listing = _assert_ok(client.get(f"/api/v1/projects/{_PROJECT}/freezone/canvases"))
    assert any(item["id"] == canvas_id for item in listing["data"])
    canvas = _assert_ok(
        client.get(f"/api/v1/projects/{_PROJECT}/freezone/canvases/{canvas_id}")
    )
    revision = canvas["data"]["revision"]
    assert canvas["data"]["revision"] == revision
    assert revision >= 1

    saved = _assert_ok(
        client.put(
            f"/api/v1/projects/{_PROJECT}/freezone/canvases/{canvas_id}",
            json={
                "base_revision": revision,
                "client_save_id": "save-1",
                "nodes": [
                    {"id": "node-1", "type": "textNode", "data": {"text": "hello"}}
                ],
                "edges": [],
            },
        )
    )
    assert saved["data"]["revision"] == revision + 1
    idempotent = _assert_ok(
        client.put(
            f"/api/v1/projects/{_PROJECT}/freezone/canvases/{canvas_id}",
            json={
                "base_revision": revision,
                "client_save_id": "save-1",
                "nodes": [
                    {"id": "node-1", "type": "textNode", "data": {"text": "hello"}}
                ],
                "edges": [],
            },
        )
    )
    assert idempotent["data"]["client_save_id"] == "save-1"

    history = _assert_ok(
        client.get(f"/api/v1/projects/{_PROJECT}/freezone/canvases/{canvas_id}/history")
    )
    assert history["data"]
    history_id = history["data"][0]["history_id"]
    restored = _assert_ok(
        client.post(
            f"/api/v1/projects/{_PROJECT}/freezone/canvases/{canvas_id}/restore",
            json={"history_id": history_id, "base_revision": revision + 1},
        )
    )
    assert restored["data"]["restored"] is True

    deleted_default = _assert_ok(
        client.delete(f"/api/v1/projects/{_PROJECT}/freezone/canvases/default")
    )
    assert deleted_default["data"]["deleted"] is True
    deleted = _assert_ok(
        client.delete(f"/api/v1/projects/{_PROJECT}/freezone/canvases/{canvas_id}")
    )
    assert deleted["data"]["deleted"] is True


def test_m06_build_projection_from_preset_returns_local_graph_without_canvas_side_effect(
    m06_client_factory,
):
    client, _backend, _task_manager, project_dir, _assets, _store = m06_client_factory(
        "inline"
    )

    response = client.post(
        f"/api/v1/projects/{_PROJECT}/freezone/projections:build-from-preset",
        json={
            "scope": "beat",
            "episode": 1,
            "beat": 1,
            "primary_slot": "sketch",
            "projection_key": "beat:1:1:sketch",
            "base_revision": 0,
        },
    )

    payload = _assert_ok(response)
    data = payload["data"]
    assert set(data) == {
        "projection_key",
        "facts_signature",
        "nodes",
        "edges",
        "metadata",
    }
    assert data["projection_key"] == "beat:1:1:sketch"
    assert data["facts_signature"]
    assert isinstance(data["nodes"], list)
    assert isinstance(data["edges"], list)
    assert data["metadata"]["last_projection_key"] == "beat:1:1:sketch"
    assert (
        data["metadata"]["projections"]["beat:1:1:sketch"]["facts_signature"]
        == data["facts_signature"]
    )
    assert not (project_dir / "freezone" / "canvases").exists()


def test_m06_build_projection_from_preset_rejects_invalid_preset_request(
    m06_client_factory,
):
    client, _backend, _task_manager, _project_dir, _assets, _store = m06_client_factory(
        "inline"
    )

    response = client.post(
        f"/api/v1/projects/{_PROJECT}/freezone/projections:build-from-preset",
        json={
            "scope": "asset",
            "projection_key": "asset:missing",
            "base_revision": 0,
        },
    )

    assert response.status_code == 400
    assert "asset" in response.text


def test_m06_freezone_assets_are_m06_scoped_and_identity_creation_works(
    m06_client_factory,
):
    """api-coverage:40 keeps /freezone/assets in M06, not the M09 /projects/{p}/assets API."""
    client, _backend, _task_manager, _project_dir, assets, store = m06_client_factory(
        "inline"
    )

    asset_response = _assert_ok(
        client.get(f"/api/v1/projects/{_PROJECT}/freezone/assets")
    )
    assert any(item.get("tab") == "characters" for item in asset_response["data"])
    assert all(
        "/projects/{p}/assets" not in item.get("id", "")
        for item in asset_response["data"]
    )
    assert client.get(f"/api/v1/projects/{_PROJECT}/assets").status_code == 404

    beat_context = _assert_ok(
        client.get(
            f"/api/v1/projects/{_PROJECT}/freezone/assets/beat-context",
            params={"episode": 1, "beat": 1},
        )
    )
    assert beat_context["data"]["scope"] == {"episode": 1, "beat": 1}
    assert beat_context["data"]["episodes"][0]["beats"][0]["asset_count"] >= 1
    assert any(
        asset["role"] == "selected_background"
        for asset in beat_context["data"]["assets"]
    )
    assert (
        client.get(
            f"/api/v1/projects/{_PROJECT}/freezone/assets/beat-context",
            params={"beat": 1},
        ).status_code
        == 400
    )

    scene_assets = _assert_ok(
        client.get(
            f"/api/v1/projects/{_PROJECT}/freezone/scene-assets-for-beat",
            params={"episode": 1, "beat": 1},
        )
    )
    assert scene_assets["data"]["scene_id"] == _SCENE

    manifest = _assert_ok(
        client.get(
            f"/api/v1/projects/{_PROJECT}/freezone/director-capture",
            params={"episode": 1, "beat": 1},
        )
    )
    assert manifest["data"]["episode"] == 1
    synced = _assert_ok(
        client.post(
            f"/api/v1/projects/{_PROJECT}/freezone/director-capture/sync-background",
            params={"episode": 1, "beat": 1},
        )
    )
    assert synced["data"]["beat"] == 1

    created = _assert_ok(
        client.post(
            f"/api/v1/projects/{_PROJECT}/freezone/assets/identities",
            json={
                "source_url": assets.image_url,
                "character": _CHARACTER,
                "identity_name": "雨夜",
                "appearance_details": "湿发青衣",
            },
        )
    )
    assert created["data"]["identity_id"] == f"{_CHARACTER}_雨夜"
    assert any(
        i.identity_id == f"{_CHARACTER}_雨夜"
        for i in store.get_character(_CHARACTER).identities
    )


def test_m06_freezone_push_impact_writes_canonical_backup_and_stale_count(
    m06_client_factory,
):
    client, _backend, _task_manager, _project_dir, assets, _store = m06_client_factory(
        "inline"
    )
    target = {"kind": "identity", "character": _CHARACTER, "identity_id": _IDENTITY_ID}

    impact = _assert_ok(
        client.post(
            f"/api/v1/projects/{_PROJECT}/freezone/impact", json={"target": target}
        )
    )
    assert impact["data"]["affected_count"] == 1

    pushed = _assert_ok(
        client.post(
            f"/api/v1/projects/{_PROJECT}/freezone/push",
            json={"source_url": assets.image_url, "target": target, "mark_stale": True},
        )
    )
    data = pushed["data"]
    assert data["target_path"] == str(assets.identity)
    assert data["target_url"].startswith(f"/static/projects/{_PROJECT_ID}/")
    assert data["backup"]
    assert data["affected_count"] == 1
    assert data["stale_marked"] >= 0
