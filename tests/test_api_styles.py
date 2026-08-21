import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

pytestmark = pytest.mark.m04


def _isolate_style_storage(monkeypatch, tmp_path):
    from ai_anime.modules.asset_world.infrastructure import style_catalog

    output_root = tmp_path / "output"
    state_root = tmp_path / "state"
    monkeypatch.setattr(style_catalog, "OUTPUT_DIR", str(output_root))
    monkeypatch.setattr(style_catalog, "STATE_DIR", str(state_root))
    return output_root / "alice" / "_account"


def test_style_preview_upload_is_staged_and_finalized(monkeypatch, tmp_path):
    from ai_anime.modules.asset_world.public import StyleService

    account_root = _isolate_style_storage(monkeypatch, tmp_path)
    staged = StyleService.stage_style_preview("alice", b"image-bytes", ".png")
    assert staged.startswith("styles/.staging/")
    assert (account_root / staged).read_bytes() == b"image-bytes"

    final = StyleService.finalize_style_preview("alice", "custom_drama", staged)
    assert final == "styles/custom_drama/reference.png"
    assert (account_root / final).read_bytes() == b"image-bytes"
    assert not (account_root / staged).exists()


def test_finalizing_style_preview_removes_previous_extension(monkeypatch, tmp_path):
    from ai_anime.modules.asset_world.public import StyleService

    account_root = _isolate_style_storage(monkeypatch, tmp_path)
    old_preview = account_root / "styles/custom_drama/reference.png"
    old_preview.parent.mkdir(parents=True)
    old_preview.write_bytes(b"old-image")
    staged = StyleService.stage_style_preview("alice", b"new-image", ".jpg")

    final = StyleService.finalize_style_preview("alice", "custom_drama", staged)

    assert final == "styles/custom_drama/reference.jpg"
    assert not old_preview.exists()
    assert (account_root / final).read_bytes() == b"new-image"


def test_remove_style_previews_removes_all_supported_variants(monkeypatch, tmp_path):
    from ai_anime.modules.asset_world.public import StyleService

    account_root = _isolate_style_storage(monkeypatch, tmp_path)
    style_dir = account_root / "styles/custom_drama"
    style_dir.mkdir(parents=True)
    for extension in (".png", ".jpg", ".webp"):
        (style_dir / f"reference{extension}").write_bytes(b"image")
    unrelated = style_dir / "notes.txt"
    unrelated.write_text("keep", encoding="utf-8")

    StyleService.remove_style_previews("alice", "custom_drama")

    assert not list(style_dir.glob("reference.*"))
    assert unrelated.read_text(encoding="utf-8") == "keep"


def test_account_style_reference_is_available_from_every_project(
    monkeypatch,
    tmp_path,
):
    from ai_anime.modules.asset_world.public import StyleConfig, StyleService
    from ai_anime.modules.production.infrastructure.media_generation_settings import (
        STYLE_REFERENCE_IMAGE_KEY,
        get_style_preset,
    )

    account_root = _isolate_style_storage(monkeypatch, tmp_path)
    assert StyleService.save_custom_style(
        "custom_global",
        StyleConfig(
            id="custom_global",
            name="全局风格",
            style_instructions="统一画面语言",
        ),
        username="alice",
    )
    staged = StyleService.stage_style_preview("alice", b"style-image", ".png")
    preview_path = StyleService.finalize_style_preview(
        "alice", "custom_global", staged
    )
    assert StyleService.update_custom_style_preview(
        "custom_global", preview_path, username="alice"
    )

    project_one = tmp_path / "output/alice/project-one"
    project_two = tmp_path / "output/alice/project-two"
    project_one.mkdir(parents=True)
    project_two.mkdir(parents=True)

    first = get_style_preset("custom_global", project_dir=str(project_one))
    second = get_style_preset("custom_global", project_dir=str(project_two))

    expected_reference = account_root / "styles/custom_global/reference.png"
    assert first["style_instructions"] == "统一画面语言"
    assert second["style_instructions"] == "统一画面语言"
    assert first[STYLE_REFERENCE_IMAGE_KEY] == str(expected_reference.resolve())
    assert second[STYLE_REFERENCE_IMAGE_KEY] == str(expected_reference.resolve())
    assert StyleService.resolve_style_preview_path("alice", preview_path) == expected_reference


def test_style_reference_is_last_and_reserves_one_model_slot(tmp_path):
    from ai_anime.modules.production.infrastructure.media_generation_settings import (
        apply_style_reference,
    )

    style_reference = tmp_path / "style.webp"
    style_reference.write_bytes(b"style")
    subject_references = [
        (f"subject-{index}.png", str(index).encode(), "image/png")
        for index in range(10)
    ]

    prompt, references = apply_style_reference(
        "draw the requested subject",
        subject_references,
        {"style_reference_image_path": str(style_reference)},
    )

    assert references[:9] == subject_references[:9]
    assert references[-1] == ("style-reference.webp", b"style", "image/webp")
    assert len(references) == 10
    assert "GLOBAL STYLE REFERENCE IMAGE" in prompt
    assert "subject identity" in prompt
    assert "facial line weight" in prompt
    assert "scene and prop assets" in prompt


def test_style_reference_upload_returns_final_path_without_ai_analysis(monkeypatch, tmp_path):
    account_root = _isolate_style_storage(monkeypatch, tmp_path)

    response = _client().put(
        "/styles/custom_drama/preview",
        files={"file": ("reference.png", b"image-bytes", "image/png")},
    )

    assert response.status_code == 200
    preview_path = response.json()["data"]["preview_path"]
    assert preview_path == "styles/custom_drama/reference.png"
    assert (account_root / preview_path).read_bytes() == b"image-bytes"


@pytest.mark.parametrize(
    ("filename", "content_type"),
    [
        ("reference.avif", "image/avif"),
        ("reference.heic", "image/heic"),
    ],
)
def test_style_reference_upload_rejects_unsupported_format(
    monkeypatch,
    tmp_path,
    filename,
    content_type,
):
    _isolate_style_storage(monkeypatch, tmp_path)

    response = _client().put(
        "/styles/custom_drama/preview",
        files={"file": (filename, b"image-bytes", content_type)},
    )

    assert response.status_code == 415
    assert response.json()["detail"] == "Unsupported style preview image type"


def test_style_reference_upload_rejects_empty_file(monkeypatch, tmp_path):
    _isolate_style_storage(monkeypatch, tmp_path)

    response = _client().put(
        "/styles/custom_drama/preview",
        files={"file": ("reference.png", b"", "image/png")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "No preview image uploaded"


def _client():
    from ai_anime.api.routes.asset_world import styles

    app = FastAPI()
    app.include_router(styles.router)
    app.dependency_overrides[styles.get_api_user] = lambda: {"username": "alice"}
    return TestClient(app)


def test_style_preview_get_returns_image_without_generation():
    response = _client().get("/styles/anime/preview")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/png")
    assert response.content.startswith(b"\x89PNG\r\n\x1a\n")


def test_custom_style_list_includes_global_preview_url(monkeypatch):
    from ai_anime.modules.asset_world.public import StyleService

    monkeypatch.setattr(
        StyleService,
        "list_all_styles",
        lambda **kwargs: [
            {
                "id": "custom_drama",
                "name": "Custom drama",
                "type": "custom",
                "preview_path": "styles/custom_drama/reference.png",
            }
        ],
    )

    response = _client().get("/styles")

    assert response.status_code == 200
    assert response.json()["data"][0]["preview_url"] == "/api/v1/styles/custom_drama/preview"


def test_custom_style_detail_includes_global_preview_url(monkeypatch):
    from ai_anime.modules.asset_world.public import StyleConfig, StyleService

    monkeypatch.setattr(
        StyleService,
        "get_style",
        lambda *args, **kwargs: StyleConfig(
            id="custom_drama",
            name="Custom drama",
            preview_path="styles/custom_drama/reference.png",
        ),
    )

    response = _client().get("/styles/custom_drama")

    assert response.status_code == 200
    assert response.json()["data"]["preview_url"] == "/api/v1/styles/custom_drama/preview"


def test_style_preview_post_enqueues_project_task(monkeypatch, tmp_path):
    from ai_anime.api.deps import ProjectResolution
    from ai_anime.api.routes.asset_world import styles
    from ai_anime.modules.asset_world.application.dto import (
        AssetTaskQueueReceipt,
        ScheduledAssetTask,
    )

    calls = []
    task_context = object()

    async def fake_resolve_project_scope(project, user, *, required_role="viewer"):
        assert project == "demo"
        assert required_role == "editor"
        return ProjectResolution(
            ctx=task_context,
            username="alice",
            project_name=project,
            project_dir=tmp_path,
            output_dir=str(tmp_path),
            state_dir=str(tmp_path / "state"),
            runtime_dir=str(tmp_path / "runtime"),
        )

    class PreviewTaskUseCases:
        async def schedule_preview(self, **kwargs):
            calls.append(kwargs)
            return ScheduledAssetTask.from_receipt(
                AssetTaskQueueReceipt(
                    task_id="task-1",
                    task_key="task-key-1",
                    backend="inline",
                    queue="default",
                ),
                task_type="style_preview",
                scope="style_preview:custom_drama",
                message="风格参考图生成任务已进入队列",
            )

    monkeypatch.setattr(styles, "resolve_project_scope", fake_resolve_project_scope)
    monkeypatch.setattr(
        styles.asset_world,
        "style_preview_task_use_cases",
        lambda: PreviewTaskUseCases(),
    )

    response = _client().post(
        "/styles/custom_drama/preview",
        json={
            "project": "demo",
            "prompt": "日系二次元校园参考图",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "task_type": "style_preview",
        "task_id": "task-1",
        "task_key": "task-key-1",
        "backend": "inline",
        "queue": "default",
        "message": "风格参考图生成任务已进入队列",
        "scope": "style_preview:custom_drama",
    }
    assert calls[0]["task_context"] is task_context
    assert calls[0]["scope"].request_project == "demo"


def test_style_preview_post_has_no_legacy_generate_alias():
    from ai_anime.api.routes.asset_world import styles

    generation_paths = [
        route.path
        for route in styles.router.routes
        if "POST" in getattr(route, "methods", set())
        and route.path.startswith("/styles/{style_id}/preview")
    ]

    assert generation_paths == ["/styles/{style_id}/preview"]


def test_guoman_fantasy_is_listed_as_3d_animation_preset():
    response = _client().get("/styles")

    assert response.status_code == 200
    styles = response.json()["data"]
    guoman = next(style for style in styles if style["id"] == "guoman_fantasy")
    assert guoman["label"] == "3D玄幻国漫"
    assert guoman["style_family"] == "animation"
    assert guoman["animation_subtype"] == "3d"


def test_create_style_accepts_frontend_payload_with_top_level_id_and_name(monkeypatch):
    from ai_anime.modules.asset_world.public import StyleService

    saved = []

    def fake_save_custom_style(style_id, config, **kwargs):
        saved.append((style_id, config, kwargs))
        return True

    monkeypatch.setattr(StyleService, "save_custom_style", fake_save_custom_style)

    response = _client().post(
        "/styles",
        json={
            "id": "custom_drama",
            "name": "自定义剧集风格",
            "config": {
                "label": "自定义剧集风格",
                "style_instructions": "cinematic live action",
                "avoid_instructions": "anime",
                "style_tag": "LIVE-ACTION",
            },
        },
    )

    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert len(saved) == 1
    style_id, config, kwargs = saved[0]
    assert style_id == "custom_drama"
    assert config.id == "custom_drama"
    assert config.name == "自定义剧集风格"
    assert config.label == "自定义剧集风格"
    assert kwargs == {"username": "alice"}


def test_create_style_generates_id_from_canonical_payload(monkeypatch):
    from ai_anime.modules.asset_world.public import StyleService

    saved = []
    monkeypatch.setattr(
        StyleService,
        "save_custom_style",
        lambda style_id, config, **kwargs: saved.append((style_id, config)) or True,
    )

    response = _client().post(
        "/styles",
        json={
            "name": "Japanese 2D Anime",
            "config": {
                "label": "日系二次元",
                "style_family": "animation",
                "animation_subtype": "2d",
                "style_instructions": "clean anime linework",
                "avoid_instructions": "photorealistic",
                "style_tag": "JAPANESE_2D_ANIME",
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["data"]["id"].startswith("custom_")
    style_id, config = saved[0]
    assert style_id == payload["data"]["id"]
    assert config.name == "Japanese 2D Anime"
    assert config.label == "日系二次元"
    assert config.style_family == "animation"
    assert config.animation_subtype == "2d"
    assert config.style_instructions == "clean anime linework"
    assert config.avoid_instructions == "photorealistic"
    assert config.style_tag == "JAPANESE_2D_ANIME"


def test_create_style_rejects_duplicate_account_style_id(monkeypatch, tmp_path):
    _isolate_style_storage(monkeypatch, tmp_path)
    payload = {
        "id": "custom_drama",
        "name": "全局风格",
        "config": {"style_instructions": "统一画面语言"},
    }

    first = _client().post("/styles", json=payload)
    second = _client().post("/styles", json=payload)

    assert first.json()["ok"] is True
    assert second.json() == {
        "ok": False,
        "error": "style_already_exists",
        "message": "Style 'custom_drama' already exists",
    }


def test_update_style_uses_dedicated_endpoint_and_preserves_preview(monkeypatch, tmp_path):
    from ai_anime.modules.asset_world.public import StyleConfig, StyleService

    _isolate_style_storage(monkeypatch, tmp_path)
    assert StyleService.save_custom_style(
        "custom_drama",
        StyleConfig(
            id="custom_drama",
            name="原风格",
            style_instructions="原指令",
            preview_path="styles/custom_drama/reference.png",
            created_by="alice",
        ),
        username="alice",
    )

    response = _client().put(
        "/styles/custom_drama",
        json={
            "name": "新风格",
            "config": {
                "label": "新标签",
                "style_instructions": "新指令",
                "avoid_instructions": "避免写实",
                "style_tag": "UPDATED",
                "style_family": "animation",
                "animation_subtype": "2d",
            },
        },
    )

    assert response.status_code == 200
    assert response.json()["data"]["id"] == "custom_drama"
    updated = StyleService.get_custom_style("custom_drama", username="alice")
    assert updated is not None
    assert updated.name == "新风格"
    assert updated.style_instructions == "新指令"
    assert updated.preview_path == "styles/custom_drama/reference.png"
    assert updated.created_by == "alice"


def test_create_style_rejects_noncanonical_config_fields():
    response = _client().post(
        "/styles",
        json={
            "name": "Invalid style",
            "config": {
                "style_instructions": "clean linework",
                "line_art": "clean",
            },
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"][-1] == "line_art"


def test_create_style_accepts_existing_published_preview_path(monkeypatch, tmp_path):
    from ai_anime.modules.asset_world.public import StyleService

    saved = []
    account_root = _isolate_style_storage(monkeypatch, tmp_path)
    monkeypatch.setattr(
        StyleService,
        "save_custom_style",
        lambda style_id, config, **kwargs: saved.append(config) or True,
    )
    preview = account_root / "styles/custom_drama/reference.png"
    preview.parent.mkdir(parents=True)
    preview.write_bytes(b"image")

    response = _client().post(
        "/styles",
        json={
            "id": "custom_drama",
            "name": "自定义剧集风格",
            "preview_path": "styles/custom_drama/reference.png",
            "config": {"style_instructions": "cinematic live action"},
        },
    )

    assert response.status_code == 200
    assert saved[0].preview_path == "styles/custom_drama/reference.png"


def test_create_style_associates_published_preview_without_request_path(monkeypatch, tmp_path):
    from ai_anime.modules.asset_world.public import StyleService

    saved = []
    account_root = _isolate_style_storage(monkeypatch, tmp_path)
    preview = account_root / "styles/custom_drama/reference.webp"
    preview.parent.mkdir(parents=True)
    preview.write_bytes(b"image")

    monkeypatch.setattr(
        StyleService,
        "save_custom_style",
        lambda style_id, config, **kwargs: saved.append(config) or True,
    )

    response = _client().post(
        "/styles",
        json={
            "id": "custom_drama",
            "name": "Custom drama",
            "config": {},
        },
    )

    assert response.status_code == 200
    assert saved[0].preview_path == "styles/custom_drama/reference.webp"


def test_create_style_rejects_missing_published_preview_path(monkeypatch, tmp_path):
    _isolate_style_storage(monkeypatch, tmp_path)

    response = _client().post(
        "/styles",
        json={
            "id": "custom_drama",
            "name": "Custom drama",
            "preview_path": "styles/custom_drama/reference.png",
            "config": {},
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Custom style preview does not exist"


def test_config_style_helpers_do_not_fallback_to_hardcoded_presets(monkeypatch):
    from ai_anime.modules.asset_world import public as asset_world
    from ai_anime.modules.production import public as config

    class BrokenStyleService:
        @staticmethod
        def get_style(*args, **kwargs):
            raise RuntimeError("style service unavailable")

        @staticmethod
        def get_style_labels(*args, **kwargs):
            raise RuntimeError("style service unavailable")

        @staticmethod
        def list_all_styles(*args, **kwargs):
            raise RuntimeError("style service unavailable")

    monkeypatch.setattr(asset_world, "StyleService", BrokenStyleService)

    with pytest.raises(RuntimeError, match="style service unavailable"):
        config.get_style_preset("chinese_period_drama")
    with pytest.raises(RuntimeError, match="style service unavailable"):
        config.get_style_labels()
    with pytest.raises(RuntimeError, match="style service unavailable"):
        config.list_available_styles()
