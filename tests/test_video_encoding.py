from ai_anime.shared.infrastructure.video_encoding import (
    ffmpeg_video_encoding_args,
    ffmpeg_video_quality_args,
)


def test_libx264_keeps_crf_and_preset_controls() -> None:
    assert ffmpeg_video_encoding_args(
        codec="libx264",
        preset="fast",
        crf=23,
    ) == ["-c:v", "libx264", "-preset", "fast", "-crf", "23"]


def test_lgpl_desktop_encoders_use_bitrate_instead_of_x264_options() -> None:
    assert ffmpeg_video_encoding_args(
        codec="libopenh264",
        preset="slow",
        crf=18,
    ) == [
        "-c:v",
        "libopenh264",
        "-profile:v",
        "main",
        "-rc_mode",
        "bitrate",
        "-allow_skip_frames",
        "1",
        "-b:v",
        "8M",
    ]
    assert ffmpeg_video_quality_args(
        codec="h264_videotoolbox",
        preset="fast",
        crf=23,
    ) == ["-allow_sw", "1", "-b:v", "4M"]


def test_videotoolbox_allows_software_without_overriding_explicit_bitrate() -> None:
    assert ffmpeg_video_encoding_args(codec="h264_videotoolbox", bitrate="6M") == [
        "-c:v",
        "h264_videotoolbox",
        "-allow_sw",
        "1",
        "-b:v",
        "6M",
    ]


def test_unknown_encoder_does_not_receive_incompatible_quality_flags() -> None:
    assert ffmpeg_video_encoding_args(codec="custom-h264") == [
        "-c:v",
        "custom-h264",
    ]
