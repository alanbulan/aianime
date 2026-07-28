from ai_anime.modules.ai_assistant.application import ProjectMedia
from ai_anime.modules.ai_assistant.domain.project_media import merge_project_media_items
from ai_anime.modules.ai_assistant.infrastructure import LocalProjectMediaFiles
from ai_anime.modules.ai_assistant.public import (
    extract_project_media,
    filter_markdown_duplicate_media,
)

project_media = ProjectMedia(LocalProjectMediaFiles())


def test_project_media_uses_project_id_url_and_explicit_project_dir(tmp_path):
    project_dir = tmp_path / "output" / "admin" / "demo"
    image = project_dir / "frames" / "ep001" / "beat_01.png"
    image.parent.mkdir(parents=True)
    image.write_bytes(b"image")

    media = extract_project_media(
        "use frames/ep001/beat_01.png",
        "admin",
        "01KS_PROJECT_ID",
        project_dir=project_dir,
    )

    assert media == [
        {
            "kind": "image",
            "url": f"/static/projects/01KS_PROJECT_ID/frames/ep001/beat_01.png?v={image.stat().st_mtime_ns}",
            "path": "frames/ep001/beat_01.png",
            "label": "beat_01.png",
        }
    ]


def test_markdown_project_image_is_not_duplicated_as_media(tmp_path):
    project_dir = tmp_path / "output" / "admin" / "demo"
    image = project_dir / "frames" / "ep001" / "beat_01.png"
    image.parent.mkdir(parents=True)
    image.write_bytes(b"image")

    media = extract_project_media(
        "![frame](/static/projects/01KS_PROJECT_ID/frames/ep001/beat_01.png)",
        "admin",
        "01KS_PROJECT_ID",
        project_dir=project_dir,
    )

    assert media == []


def test_markdown_project_image_filters_normalized_media_item(tmp_path):
    project_dir = tmp_path / "output" / "admin" / "demo"
    image = project_dir / "frames" / "ep001" / "beat_01.png"
    image.parent.mkdir(parents=True)
    image.write_bytes(b"image")
    url = f"/static/projects/01KS_PROJECT_ID/frames/ep001/beat_01.png?v={image.stat().st_mtime_ns}"

    media = filter_markdown_duplicate_media(
        "![frame](/static/projects/01KS_PROJECT_ID/frames/ep001/beat_01.png)",
        [
            {
                "kind": "image",
                "url": url,
                "path": "frames/ep001/beat_01.png",
                "label": "beat_01.png",
            }
        ],
    )

    assert media == []


def test_project_media_extracts_bare_external_video_and_audio(tmp_path):
    media = extract_project_media(
        "watch https://cdn.example/show.mp4 and https://cdn.example/theme.mp3",
        "admin",
        "project-a",
        project_dir=tmp_path,
    )

    assert media == [
        {
            "kind": "video",
            "url": "https://cdn.example/show.mp4",
            "path": "",
            "label": "show.mp4",
        },
        {
            "kind": "audio",
            "url": "https://cdn.example/theme.mp3",
            "path": "",
            "label": "theme.mp3",
        },
    ]


def test_project_media_rewrites_absolute_static_url_to_current_project(tmp_path):
    image = tmp_path / "images" / "hero pose.png"
    image.parent.mkdir(parents=True)
    image.write_bytes(b"image")

    media = extract_project_media(
        "https://old.example/static/projects/old/images/hero%20pose.png?v=1",
        "admin",
        "current-project",
        project_dir=tmp_path,
    )

    assert media == [
        {
            "kind": "image",
            "url": f"/static/projects/current-project/images/hero%20pose.png?v={image.stat().st_mtime_ns}",
            "path": "images/hero pose.png",
            "label": "hero pose.png",
        }
    ]


def test_project_media_normalizes_path_only_items_and_deduplicates(tmp_path):
    image = tmp_path / "images" / "frame.png"
    image.parent.mkdir(parents=True)
    image.write_bytes(b"image")

    media = project_media.normalize(
        [
            {"path": "images/frame.png", "label": "Frame"},
            {
                "url": "/static/projects/old/images/frame.png",
                "path": "images/frame.png",
            },
            {"url": "https://cdn.example/readme.txt"},
            {},
        ],
        "admin",
        "project-a",
        project_dir=tmp_path,
    )

    assert media == [
        {
            "kind": "image",
            "url": f"/static/projects/project-a/images/frame.png?v={image.stat().st_mtime_ns}",
            "path": "images/frame.png",
            "label": "Frame",
        }
    ]


def test_project_media_merge_keeps_first_item_for_stable_path():
    first = {
        "kind": "image",
        "url": "/first.png",
        "path": "images/frame.png",
        "label": "First",
    }
    duplicate = {
        "kind": "image",
        "url": "/second.png",
        "path": "images/frame.png",
        "label": "Second",
    }

    assert merge_project_media_items(
        [first], [duplicate], [{"url": "/missing.png"}]
    ) == [first]


def test_markdown_duplicate_filter_keeps_non_image_media():
    image = {
        "kind": "image",
        "url": "/static/projects/p/images/frame.png?v=1",
        "path": "images/frame.png",
        "label": "frame.png",
    }
    video = {
        "kind": "video",
        "url": "/static/projects/p/images/frame.png?v=1",
        "path": "images/frame.png",
        "label": "frame.png",
    }

    assert filter_markdown_duplicate_media(
        "![frame](images/frame.png)",
        [image, video],
    ) == [video]


def test_default_project_media_directory_uses_configured_output_root(
    monkeypatch,
    tmp_path,
):
    output_root = tmp_path / "output"
    image = output_root / "alice" / "demo" / "images" / "frame.png"
    image.parent.mkdir(parents=True)
    image.write_bytes(b"image")
    monkeypatch.setenv("AI_ANIME_OUTPUT_DIR", str(output_root))

    media = extract_project_media(
        "images/frame.png",
        "alice",
        "demo",
    )

    assert [item["path"] for item in media] == ["images/frame.png"]
    assert (output_root / "alice" / "demo" / "assets" / "characters").is_dir()
