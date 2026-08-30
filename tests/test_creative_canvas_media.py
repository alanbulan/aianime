from __future__ import annotations

import base64
from pathlib import Path

import pytest

from ai_anime.modules.creative_canvas.application.media import (
    CreativeCanvasMediaUseCases,
    SaveCreativeCanvasScreenshotCommand,
    StoreCreativeCanvasUploadCommand,
    StoredCreativeCanvasMedia,
)
from ai_anime.modules.creative_canvas.domain import media as media_rules
from ai_anime.modules.creative_canvas.domain.media import (
    CreativeCanvasScreenshotTooLarge,
    InvalidCreativeCanvasPngScreenshot,
    decode_png_screenshot,
)
from ai_anime.modules.creative_canvas.infrastructure.media import (
    LocalCreativeCanvasMediaStorage,
)


def _png_data_url(payload: bytes) -> str:
    return media_rules.PNG_DATA_URL_PREFIX + base64.b64encode(payload).decode("ascii")


def test_decode_png_screenshot_returns_valid_payload() -> None:
    payload = media_rules.PNG_SIGNATURE + b"payload"

    assert decode_png_screenshot(_png_data_url(payload)) == payload


@pytest.mark.parametrize(
    ("data_url", "message"),
    [
        ("not-a-data-url", "expected PNG data URL"),
        (media_rules.PNG_DATA_URL_PREFIX + "%%%", "invalid PNG data URL"),
        (_png_data_url(b"not png"), "screenshot payload is not PNG"),
    ],
)
def test_decode_png_screenshot_rejects_invalid_payloads(
    data_url: str,
    message: str,
) -> None:
    with pytest.raises(InvalidCreativeCanvasPngScreenshot, match=message):
        decode_png_screenshot(data_url)


def test_decode_png_screenshot_enforces_size_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        media_rules,
        "MAX_PNG_SCREENSHOT_BYTES",
        len(media_rules.PNG_SIGNATURE),
    )

    with pytest.raises(
        CreativeCanvasScreenshotTooLarge, match="screenshot is too large"
    ):
        decode_png_screenshot(_png_data_url(media_rules.PNG_SIGNATURE + b"x"))


def test_media_use_cases_delegate_upload_and_build_screenshot_result(
    tmp_path: Path,
) -> None:
    upload_command = StoreCreativeCanvasUploadCommand(
        project_id="project-1",
        project_dir=tmp_path,
        original_filename="source.png",
        contents=b"upload",
    )
    screenshot_payload = media_rules.PNG_SIGNATURE + b"screenshot"
    screenshot_command = SaveCreativeCanvasScreenshotCommand(
        project_id="project-1",
        project_dir=tmp_path,
        data_url=_png_data_url(screenshot_payload),
        node_id="node-1",
        label="  ",
    )

    class FakeStorage:
        def save_upload(
            self,
            command: StoreCreativeCanvasUploadCommand,
        ) -> StoredCreativeCanvasMedia:
            assert command is upload_command
            return StoredCreativeCanvasMedia(
                filename="stored.png",
                relative_path="freezone/_uploads/stored.png",
                url="/media/stored.png",
                size=6,
            )

        def save_screenshot(
            self,
            *,
            project_id: str,
            project_dir: Path,
            screenshot_id: str,
            payload: bytes,
        ) -> StoredCreativeCanvasMedia:
            assert (project_id, project_dir, screenshot_id) == (
                "project-1",
                tmp_path,
                "job-1",
            )
            assert payload == screenshot_payload
            return StoredCreativeCanvasMedia(
                filename="job-1.png",
                relative_path="freezone/_outputs/three_d_viewer/job-1.png",
                url="/media/job-1.png",
                size=len(payload),
            )

    class FakeJobIds:
        def new_id(self) -> str:
            return "job-1"

    use_cases = CreativeCanvasMediaUseCases(FakeStorage(), FakeJobIds())

    upload = use_cases.upload(upload_command)
    screenshot = use_cases.save_screenshot(screenshot_command)

    assert upload.filename == "stored.png"
    assert upload.url == "/media/stored.png"
    assert upload.size == 6
    assert screenshot.screenshot_id == "job-1"
    assert screenshot.label == "3D viewer screenshot"
    assert screenshot.node_id == "node-1"
    assert screenshot.relative_path.endswith("/job-1.png")
    assert screenshot.url == "/media/job-1.png"
    assert screenshot.size == len(screenshot_payload)


def test_local_media_storage_preserves_upload_and_screenshot_paths(
    tmp_path: Path,
) -> None:
    storage = LocalCreativeCanvasMediaStorage()
    project_dir = tmp_path / "project"

    upload = storage.save_upload(
        StoreCreativeCanvasUploadCommand(
            project_id="project-1",
            project_dir=project_dir,
            original_filename="../reference image.png",
            contents=b"upload",
        )
    )
    screenshot = storage.save_screenshot(
        project_id="project-1",
        project_dir=project_dir,
        screenshot_id="job-1",
        payload=media_rules.PNG_SIGNATURE,
    )

    assert upload.filename.endswith("_reference image.png")
    assert (project_dir / upload.relative_path).read_bytes() == b"upload"
    assert upload.url.startswith("/static/projects/project-1/freezone/_uploads/")
    assert "%20" in upload.url
    assert screenshot.relative_path == "freezone/_outputs/three_d_viewer/job-1.png"
    assert (
        project_dir / screenshot.relative_path
    ).read_bytes() == media_rules.PNG_SIGNATURE
    assert screenshot.url.startswith(
        "/static/projects/project-1/freezone/_outputs/three_d_viewer/job-1.png"
    )
