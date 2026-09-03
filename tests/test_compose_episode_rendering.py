from __future__ import annotations

import json
from io import BytesIO
import shutil
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.task_execution.infrastructure.runners import video


class _TaskManager:
    def __init__(self) -> None:
        self.updates: list[dict] = []

    def update_progress_for_project(self, *_args, **kwargs) -> None:
        self.updates.append(kwargs)


def _ass_events(path: Path) -> list[list[str]]:
    return [
        line.split(",", 9)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.startswith("Dialogue:")
    ]


def test_subtitles_show_sentences_in_sequence_and_keep_silent_clip_time(
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.public import VideoComposer

    subtitle_path = tmp_path / "subtitles.ass"
    VideoComposer(width=720, height=1280).write_episode_subtitles(
        [(6.0, "你好！欢迎来到咖啡馆。"), (2.0, ""), (3.0, "请坐。")],
        subtitle_path,
    )

    events = _ass_events(subtitle_path)
    assert [event[9] for event in events] == ["你好！", "欢迎来到咖啡馆。", "请坐。"]
    assert events[0][1] == "0:00:00.00"
    assert events[0][2] == events[1][1]
    assert events[1][2] == "0:00:06.00"
    assert events[2][1:3] == ["0:00:08.00", "0:00:11.00"]


def test_long_unpunctuated_subtitles_never_fill_more_than_two_lines(
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.public import VideoComposer

    text = "沿着街道走过咖啡馆来到车站看见朋友正在向我们挥手" * 4
    subtitle_path = tmp_path / "subtitles.ass"
    VideoComposer(width=720, height=1280).write_episode_subtitles(
        [(12.0, text)], subtitle_path,
    )

    events = _ass_events(subtitle_path)
    assert len(events) > 1
    assert all(len(event[9].split(r"\N")) <= 2 for event in events)
    assert "".join(event[9].replace(r"\N", "") for event in events) == text
    assert events[0][1] == "0:00:00.00"
    assert events[-1][2] == "0:00:12.00"
    assert all(left[2] == right[1] for left, right in zip(events, events[1:]))


def test_portrait_subtitles_keep_sentence_punctuation_on_the_same_line(
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.public import VideoComposer

    subtitle_path = tmp_path / "subtitles.ass"
    VideoComposer(width=1080, height=1920).write_episode_subtitles(
        [
            (
                1.5,
                "这是一句用于验证竖屏和横屏自动换行的较长中文对白，画面和字幕都应保持居中。",
            )
        ],
        subtitle_path,
    )
    content = subtitle_path.read_text(encoding="utf-8")
    assert r"\N" in content
    assert r"\N。" not in content
    assert r"\N，" not in content


def _prepare_project(tmp_path: Path) -> tuple[Path, list[dict]]:
    project_dir = tmp_path / "竖屏 导出"
    video_dir = project_dir / "videos" / "beats" / "ep001"
    video_dir.mkdir(parents=True)
    beats = [
        {"beat_number": 1, "narration_segment": "第一句对白"},
        {"beat_number": 41, "narration_segment": ""},
        {"beat_number": 2, "narration_segment": "第二句对白"},
    ]
    for beat in beats:
        (video_dir / f"beat_{beat['beat_number']:02d}.mp4").write_bytes(b"video")
    return project_dir, beats


@pytest.mark.parametrize("resolution", ["1080x1920", "1920x1080", "1080×1920"])
@pytest.mark.parametrize("add_subtitles", [False, True])
def test_compose_applies_requested_frame_and_subtitles(
    monkeypatch, tmp_path: Path, resolution: str, add_subtitles: bool
) -> None:
    project_dir, beats = _prepare_project(tmp_path)
    commands: list[list[str]] = []
    subtitle_files: list[str] = []
    manager = _TaskManager()

    def run(cmd, **kwargs):
        commands.append(cmd)
        if cmd[0] == "ffprobe":
            value = "1.5" if "format=duration" in cmd else "0"
            return SimpleNamespace(returncode=0, stdout=value, stderr="")
        if "-filter_complex" in cmd:
            subtitle_files.extend(
                path.read_text(encoding="utf-8")
                for path in Path(kwargs.get("cwd", tmp_path)).glob("*.ass")
            )
        Path(cmd[-1]).write_bytes(b"composed")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(video, "get_task_manager", lambda: manager)
    monkeypatch.setattr(video, "run_project_subprocess", run)
    result = video.run_compose_episode(
        {
            "episode": 1,
            "payload": {
                "output_dir": str(project_dir),
                "beats": beats,
                "resolution": resolution,
                "add_subtitles": add_subtitles,
            },
        },
        SimpleNamespace(output_dir=project_dir),
    )

    compose_command = next(cmd for cmd in commands if "-filter_complex" in cmd)
    filters = compose_command[compose_command.index("-filter_complex") + 1]
    width, height = resolution.replace("×", "x").split("x")
    assert f"scale={width}:{height}:force_original_aspect_ratio=increase" in filters
    assert f"crop={width}:{height}" in filters
    assert "pad=" not in filters
    assert result["resolution"] == f"{width}x{height}"
    assert result["subtitles_added"] is add_subtitles
    assert Path(result["video_path"]).read_bytes() == b"composed"
    if add_subtitles:
        assert "ass=" in filters
        assert len(subtitle_files) == 1
        subtitles = subtitle_files[0]
        assert "0:00:00.00,0:00:01.50" in subtitles
        assert "0:00:03.00,0:00:04.50" in subtitles
        assert "第一句对白" in subtitles
        assert "第二句对白" in subtitles
        assert f"PlayResX: {width}" in subtitles
        assert f"PlayResY: {height}" in subtitles
        assert any(
            "字幕" in line
            for update in manager.updates
            for line in update.get("logs", [])
        )
    else:
        assert "ass=" not in filters
        assert subtitle_files == []


@pytest.mark.parametrize("resolution", ["1080p", "1081x1920", "0x1920", "invalid"])
def test_compose_rejects_invalid_dimensions_instead_of_silently_exporting_720p(
    monkeypatch, tmp_path: Path, resolution: str
) -> None:
    project_dir, beats = _prepare_project(tmp_path)
    monkeypatch.setattr(video, "get_task_manager", _TaskManager)
    with pytest.raises(ValueError, match="导出分辨率"):
        video.run_compose_episode(
            {
                "episode": 1,
                "payload": {
                    "output_dir": str(project_dir),
                    "beats": beats,
                    "resolution": resolution,
                },
            },
            SimpleNamespace(output_dir=project_dir),
        )


def test_failed_subtitle_encoding_preserves_the_previous_final_video(
    monkeypatch, tmp_path: Path
) -> None:
    project_dir, beats = _prepare_project(tmp_path)
    previous = project_dir / "videos" / "episodes" / "ep001_final.mp4"
    previous.parent.mkdir()
    previous.write_bytes(b"previous final video")

    def run(cmd, **_kwargs):
        if cmd[0] == "ffprobe":
            return SimpleNamespace(returncode=0, stdout="1.5", stderr="")
        Path(cmd[-1]).write_bytes(b"partial video")
        return SimpleNamespace(
            returncode=1 if "-filter_complex" in cmd else 0,
            stdout="",
            stderr="subtitle encoding failed",
        )

    monkeypatch.setattr(video, "get_task_manager", _TaskManager)
    monkeypatch.setattr(video, "run_project_subprocess", run)
    with pytest.raises(RuntimeError, match="subtitle encoding failed"):
        video.run_compose_episode(
            {
                "episode": 1,
                "payload": {
                    "output_dir": str(project_dir),
                    "beats": beats,
                    "add_subtitles": True,
                },
            },
            SimpleNamespace(output_dir=project_dir),
        )
    assert previous.read_bytes() == b"previous final video"


def test_silent_episode_reports_that_no_subtitles_were_burned(
    monkeypatch, tmp_path: Path
) -> None:
    project_dir, beats = _prepare_project(tmp_path)
    for beat in beats:
        beat["narration_segment"] = ""
    manager = _TaskManager()

    def run(cmd, **_kwargs):
        if cmd[0] != "ffprobe":
            Path(cmd[-1]).write_bytes(b"composed video")
        return SimpleNamespace(returncode=0, stdout="0", stderr="")

    monkeypatch.setattr(video, "get_task_manager", lambda: manager)
    monkeypatch.setattr(video, "run_project_subprocess", run)
    result = video.run_compose_episode(
        {
            "episode": 1,
            "payload": {
                "output_dir": str(project_dir),
                "beats": beats,
                "add_subtitles": True,
            },
        },
        SimpleNamespace(output_dir=project_dir),
    )
    assert result["subtitles_added"] is False
    assert any(
        "未找到对白或旁白" in line
        for update in manager.updates
        for line in update.get("logs", [])
    )


def test_compose_generates_and_mixes_requested_episode_bgm(
    monkeypatch, tmp_path: Path
) -> None:
    from ai_anime.modules.production import public as production_public

    project_dir, beats = _prepare_project(tmp_path)
    commands: list[list[str]] = []
    generation_calls: list[dict] = []

    def run(cmd, **_kwargs):
        commands.append(cmd)
        if cmd[0] == "ffprobe":
            return SimpleNamespace(returncode=0, stdout="1.5", stderr="")
        Path(cmd[-1]).write_bytes(b"composed")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    async def generate_bgm(**kwargs):
        generation_calls.append(kwargs)
        path = project_dir / "audio" / "episodes" / "ep001_bgm.mp3"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"music")
        return path

    monkeypatch.setattr(video, "get_task_manager", _TaskManager)
    monkeypatch.setattr(video, "run_project_subprocess", run)
    monkeypatch.setattr(production_public, "generate_episode_bgm", generate_bgm)

    result = video.run_compose_episode(
        {
            "episode": 1,
            "payload": {
                "output_dir": str(project_dir),
                "beats": beats,
                "add_subtitles": False,
                "add_bgm": True,
            },
        },
        SimpleNamespace(output_dir=project_dir),
    )

    assert len(generation_calls) == 1
    assert generation_calls[0]["duration_seconds"] == pytest.approx(4.5)
    compose_command = next(cmd for cmd in commands if "-filter_complex" in cmd)
    filters = compose_command[compose_command.index("-filter_complex") + 1]
    bgm_input = compose_command.index("-stream_loop")
    assert compose_command[bgm_input : bgm_input + 3] == [
        "-stream_loop",
        "-1",
        "-i",
    ]
    assert "volume=0.16" in filters
    assert "amix=inputs=2:duration=first" in filters
    assert result["add_bgm_requested"] is True
    assert result["bgm_added"] is True


def test_compose_rejects_an_episode_with_missing_beat_video(
    monkeypatch, tmp_path: Path
) -> None:
    project_dir, beats = _prepare_project(tmp_path)
    missing_beat = 2
    (
        project_dir
        / "videos"
        / "beats"
        / "ep001"
        / f"beat_{missing_beat:02d}.mp4"
    ).unlink()
    monkeypatch.setattr(video, "get_task_manager", _TaskManager)

    with pytest.raises(
        RuntimeError,
        match=r"Beat 2 的视频不存在，请先生成全部 Beat 视频",
    ):
        video.run_compose_episode(
            {
                "episode": 1,
                "payload": {
                    "output_dir": str(project_dir),
                    "beats": beats,
                },
            },
            SimpleNamespace(output_dir=project_dir),
        )


@pytest.mark.skipif(
    not shutil.which("ffmpeg") or not shutil.which("ffprobe"),
    reason="FFmpeg is required for the local BGM composition check",
)
def test_real_compose_accepts_a_short_bgm_and_loops_it_to_episode_length(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production import public as production_public

    project_dir = tmp_path / "real-bgm"
    video_path = project_dir / "videos" / "beats" / "ep001" / "beat_01.mp4"
    bgm_path = project_dir / "audio" / "episodes" / "ep001_bgm.mp3"
    video_path.parent.mkdir(parents=True)
    bgm_path.parent.mkdir(parents=True)
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=320x240:r=24:d=1.2",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:sample_rate=44100:duration=1.2",
            "-shortest",
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            str(video_path),
        ],
        check=True,
        capture_output=True,
        timeout=30,
    )
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=880:sample_rate=44100:duration=0.35",
            str(bgm_path),
        ],
        check=True,
        capture_output=True,
        timeout=30,
    )

    async def generate_bgm(**_kwargs):
        return bgm_path

    monkeypatch.setattr(video, "get_task_manager", _TaskManager)
    monkeypatch.setattr(production_public, "generate_episode_bgm", generate_bgm)
    result = video.run_compose_episode(
        {
            "episode": 1,
            "payload": {
                "output_dir": str(project_dir),
                "beats": [{"beat_number": 1, "narration_segment": "测试对白"}],
                "resolution": "320x240",
                "add_subtitles": False,
                "add_bgm": True,
            },
        },
        SimpleNamespace(output_dir=project_dir),
    )

    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_type",
            "-of",
            "json",
            result["video_path"],
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    media = json.loads(probe.stdout)
    assert float(media["format"]["duration"]) == pytest.approx(1.2, abs=0.15)
    assert {stream["codec_type"] for stream in media["streams"]} == {
        "audio",
        "video",
    }
    assert result["bgm_added"] is True


@pytest.mark.skipif(
    not shutil.which("ffmpeg") or not shutil.which("ffprobe"),
    reason="FFmpeg is required for the local composition rendering check",
)
@pytest.mark.parametrize(
    "resolution", ["720x1280", "1080x1920", "1280x720", "1920x1080"]
)
def test_real_compose_centers_mixed_sources_and_renders_chinese_subtitles(
    monkeypatch, tmp_path: Path, resolution: str
) -> None:
    from PIL import Image, ImageChops

    project_dir, beats = _prepare_project(tmp_path)
    beats[0]["narration_segment"] = (
        "这是一句用于验证竖屏和横屏自动换行的较长中文对白，画面和字幕都应保持居中。"
    )
    video_dir = project_dir / "videos" / "beats" / "ep001"
    for beat_number, size, fps, sar in (
        (1, "854x1280", 10, 1),
        (41, "1280x720", 24, 1),
        (2, "640x720", 15, 2),
    ):
        mark_width = 80 // sar
        cmd = [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=blue:s={size}:r={fps}:d=1.5",
        ]
        if beat_number != 41:
            cmd.extend(
                [
                    "-f",
                    "lavfi",
                    "-i",
                    "sine=frequency=440:sample_rate=44100:duration=1.5",
                ]
            )
        cmd.extend(
            [
                "-vf",
                f"drawbox=x=(iw-{mark_width})/2:y=(ih-80)/2:"
                f"w={mark_width}:h=80:color=red:t=fill,setsar={sar}",
                "-c:v",
                "mpeg4",
                "-c:a",
                "aac",
                "-shortest",
                str(video_dir / f"beat_{beat_number:02d}.mp4"),
            ]
        )
        subprocess.run(cmd, check=True, capture_output=True, timeout=60)
    audio_dir = project_dir / "audio" / "ep001"
    audio_dir.mkdir(parents=True)
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=880:sample_rate=44100:duration=1.5",
            str(audio_dir / "beat_01.mp3"),
        ],
        check=True,
        capture_output=True,
        timeout=30,
    )
    manager = _TaskManager()
    monkeypatch.setattr(video, "get_task_manager", lambda: manager)
    result = video.run_compose_episode(
        {
            "episode": 1,
            "payload": {
                "output_dir": str(project_dir),
                "beats": beats,
                "resolution": resolution,
                "add_subtitles": True,
            },
        },
        SimpleNamespace(output_dir=project_dir),
    )
    output = result["video_path"]
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-of", "json", output],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    streams = json.loads(probe.stdout)["streams"]
    picture = next(stream for stream in streams if stream["codec_type"] == "video")
    width, height = map(int, resolution.split("x"))
    assert (picture["width"], picture["height"]) == (width, height)
    assert picture["sample_aspect_ratio"] == "1:1"
    assert picture["r_frame_rate"] == "30/1"
    assert any(stream["codec_type"] == "audio" for stream in streams)

    def frame(time: float, path=output):
        captured = subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-ss",
                str(time),
                "-i",
                str(path),
                "-frames:v",
                "1",
                "-f",
                "image2pipe",
                "-vcodec",
                "png",
                "-",
            ],
            check=True,
            capture_output=True,
            timeout=30,
        )
        return Image.open(BytesIO(captured.stdout)).convert("RGB")

    def white_mask(image):
        r, g, b = image.split()
        return ImageChops.darker(ImageChops.darker(r, g), b).point(
            lambda value: 255 if value > 180 else 0
        )

    first, silent, last = (frame(time) for time in (0.7, 2.2, 3.7))
    assert white_mask(first).histogram()[255] > 300
    assert white_mask(first).histogram()[255] > (
        white_mask(frame(1.3)).histogram()[255] * 1.2
    )
    assert white_mask(silent).getbbox() is None
    assert white_mask(last).histogram()[255] > 300
    for image in (first, last):
        left, top, right, bottom = white_mask(image).getbbox()
        assert left >= width * 0.05 and right <= width * 0.95
        assert top >= height * 0.65 and bottom <= height * 0.97
        assert abs((left + right) / 2 - width / 2) < width * 0.015

    def marker_bounds(image):
        r, g, b = image.split()
        return ImageChops.multiply(
            r.point(lambda value: 255 if value > 160 else 0),
            ImageChops.multiply(
                g.point(lambda value: 255 if value < 80 else 0),
                b.point(lambda value: 255 if value < 80 else 0),
            ),
        ).getbbox()

    for beat, sar, image in zip(beats, (1, 1, 2), (first, silent, last), strict=True):
        for corner in (
            (5, 5),
            (width - 6, 5),
            (5, height - 6),
            (width - 6, height - 6),
        ):
            r, g, b = image.getpixel(corner)
            assert b > 150 and r < 50 and g < 50
        source_bounds = marker_bounds(
            frame(0.7, video_dir / f"beat_{beat['beat_number']:02d}.mp4")
        )
        source_left, source_top, source_right, source_bottom = source_bounds
        source_ratio = (source_right - source_left) * sar / (source_bottom - source_top)
        left, top, right, bottom = marker_bounds(image)
        assert abs((left + right) / 2 - width / 2) <= 2
        assert abs((top + bottom) / 2 - height / 2) <= 2
        # Compare decoded source pixels: chroma subsampling can widen a colored edge.
        assert abs((right - left) / (bottom - top) - source_ratio) <= 0.025
    first.save(tmp_path / f"compose-{resolution}.png")
