from __future__ import annotations

import pytest

from ai_anime.modules.production.application.seedance2_panel import (
    CropSeedance2AssetCommand,
    RemoveSeedance2AssetCommand,
    Seedance2PanelOperationRejected,
    Seedance2PanelQuery,
    Seedance2PanelUseCases,
    TrimSeedance2AudioAssetCommand,
    UploadSeedance2AssetCommand,
)


_PANEL_RESPONSE = {
    "ok": True,
    "data": {"beat_number": 2, "assets": {"items": []}},
}


class _Gateway:
    def __init__(self, result=_PANEL_RESPONSE) -> None:
        self.result = result
        self.calls: list[tuple[str, object, object]] = []

    async def status(self, context, query):
        self.calls.append(("status", context, query))
        return self.result

    async def upload(self, context, command):
        self.calls.append(("upload", context, command))
        return self.result

    async def remove(self, context, command):
        self.calls.append(("remove", context, command))
        return self.result

    async def crop(self, context, command):
        self.calls.append(("crop", context, command))
        return self.result

    async def trim_audio(self, context, command):
        self.calls.append(("trim_audio", context, command))
        return self.result


@pytest.mark.asyncio
async def test_panel_use_cases_delegate_all_operations() -> None:
    context = object()
    gateway = _Gateway()
    use_cases = Seedance2PanelUseCases(gateway)
    query = Seedance2PanelQuery(project="demo", episode_num=1, beat_num=2)
    upload = UploadSeedance2AssetCommand(
        project="demo",
        episode_num=1,
        beat_num=2,
        filename="reference.png",
        content=b"image",
        content_type="image/png",
    )
    remove = RemoveSeedance2AssetCommand(
        project="demo",
        episode_num=1,
        beat_num=2,
        media_kind="images",
        path="seedance2_uploads/reference.png",
    )
    crop = CropSeedance2AssetCommand(
        project="demo",
        episode_num=1,
        beat_num=2,
        asset_key="manual:image",
        source_path="frames/reference.png",
        crop_data={"x": 1, "y": 2, "width": 3, "height": 4},
    )
    trim = TrimSeedance2AudioAssetCommand(
        project="demo",
        episode_num=1,
        beat_num=2,
        asset_key="manual:audio",
        source_path="audio/reference.wav",
        start_seconds=1.5,
        duration_seconds=4.0,
    )

    results = [
        await use_cases.status(context, query),
        await use_cases.upload(context, upload),
        await use_cases.remove(context, remove),
        await use_cases.crop(context, crop),
        await use_cases.trim_audio(context, trim),
    ]

    assert results == [_PANEL_RESPONSE] * 5
    assert gateway.calls == [
        ("status", context, query),
        ("upload", context, upload),
        ("remove", context, remove),
        ("crop", context, crop),
        ("trim_audio", context, trim),
    ]


@pytest.mark.parametrize(
    ("operation", "command", "message"),
    [
        (
            "upload",
            UploadSeedance2AssetCommand(
                project="demo",
                episode_num=1,
                beat_num=2,
                filename="empty.png",
                content=b"",
                content_type="image/png",
            ),
            "unsupported or empty Seedance2 reference asset",
        ),
        (
            "remove",
            RemoveSeedance2AssetCommand(
                project="demo",
                episode_num=1,
                beat_num=2,
                media_kind="images",
                path="missing.png",
            ),
            "Seedance2 reference asset was not removed",
        ),
        (
            "crop",
            CropSeedance2AssetCommand(
                project="demo",
                episode_num=1,
                beat_num=2,
                asset_key="manual:image",
                source_path="missing.png",
                crop_data={},
            ),
            "Seedance2 reference crop failed",
        ),
        (
            "trim_audio",
            TrimSeedance2AudioAssetCommand(
                project="demo",
                episode_num=1,
                beat_num=2,
                asset_key="manual:audio",
                source_path="missing.wav",
                start_seconds=0.0,
                duration_seconds=4.0,
            ),
            "Seedance2 audio reference trim failed",
        ),
    ],
)
@pytest.mark.asyncio
async def test_panel_use_cases_reject_unsuccessful_operations(
    operation: str,
    command: object,
    message: str,
) -> None:
    use_cases = Seedance2PanelUseCases(_Gateway(None))

    with pytest.raises(Seedance2PanelOperationRejected) as caught:
        await getattr(use_cases, operation)(object(), command)

    assert str(caught.value) == message
