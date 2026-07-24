"""Sketch pose editor domain rules."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

SKELETON_EDGES = [
    ("nose", "neck"),
    ("neck", "right_shoulder"),
    ("right_shoulder", "right_elbow"),
    ("right_elbow", "right_wrist"),
    ("neck", "left_shoulder"),
    ("left_shoulder", "left_elbow"),
    ("left_elbow", "left_wrist"),
    ("neck", "right_hip"),
    ("right_hip", "right_knee"),
    ("right_knee", "right_ankle"),
    ("neck", "left_hip"),
    ("left_hip", "left_knee"),
    ("left_knee", "left_ankle"),
    ("nose", "right_eye"),
    ("nose", "left_eye"),
    ("right_eye", "right_ear"),
    ("left_eye", "left_ear"),
]


def _n(x: float, y: float) -> dict[str, float]:
    return {"x": x / 512, "y": y / 512}


POSE_PRESETS: dict[str, dict[str, Any]] = {
    "standing_front": {
        "label": "站立-正面",
        "joints": {
            "nose": _n(256, 78),
            "neck": _n(256, 118),
            "right_shoulder": _n(210, 138),
            "right_elbow": _n(195, 200),
            "right_wrist": _n(195, 260),
            "left_shoulder": _n(302, 138),
            "left_elbow": _n(317, 200),
            "left_wrist": _n(317, 260),
            "right_hip": _n(228, 272),
            "right_knee": _n(225, 370),
            "right_ankle": _n(225, 460),
            "left_hip": _n(284, 272),
            "left_knee": _n(287, 370),
            "left_ankle": _n(287, 460),
            "right_eye": _n(245, 68),
            "left_eye": _n(267, 68),
            "right_ear": _n(228, 78),
            "left_ear": _n(284, 78),
        },
    },
    "standing_side_left": {
        "label": "站立-左侧",
        "joints": {
            "nose": _n(230, 78),
            "neck": _n(256, 118),
            "right_shoulder": _n(268, 138),
            "right_elbow": _n(274, 200),
            "right_wrist": _n(274, 260),
            "left_shoulder": _n(244, 138),
            "left_elbow": _n(238, 200),
            "left_wrist": _n(238, 260),
            "right_hip": _n(264, 272),
            "right_knee": _n(262, 370),
            "right_ankle": _n(262, 460),
            "left_hip": _n(248, 272),
            "left_knee": _n(246, 370),
            "left_ankle": _n(246, 460),
            "right_eye": _n(238, 70),
            "left_eye": _n(224, 70),
            "right_ear": _n(250, 76),
            "left_ear": _n(216, 80),
        },
    },
    "standing_side_right": {
        "label": "站立-右侧",
        "joints": {
            "nose": _n(282, 78),
            "neck": _n(256, 118),
            "right_shoulder": _n(268, 138),
            "right_elbow": _n(274, 200),
            "right_wrist": _n(274, 260),
            "left_shoulder": _n(244, 138),
            "left_elbow": _n(238, 200),
            "left_wrist": _n(238, 260),
            "right_hip": _n(264, 272),
            "right_knee": _n(266, 370),
            "right_ankle": _n(266, 460),
            "left_hip": _n(248, 272),
            "left_knee": _n(250, 370),
            "left_ankle": _n(250, 460),
            "right_eye": _n(288, 70),
            "left_eye": _n(274, 70),
            "right_ear": _n(296, 80),
            "left_ear": _n(262, 76),
        },
    },
    "arms_open": {
        "label": "张开双臂",
        "joints": {
            "nose": _n(256, 78),
            "neck": _n(256, 118),
            "right_shoulder": _n(210, 138),
            "right_elbow": _n(155, 138),
            "right_wrist": _n(100, 138),
            "left_shoulder": _n(302, 138),
            "left_elbow": _n(357, 138),
            "left_wrist": _n(412, 138),
            "right_hip": _n(228, 272),
            "right_knee": _n(225, 370),
            "right_ankle": _n(225, 460),
            "left_hip": _n(284, 272),
            "left_knee": _n(287, 370),
            "left_ankle": _n(287, 460),
            "right_eye": _n(245, 68),
            "left_eye": _n(267, 68),
            "right_ear": _n(228, 78),
            "left_ear": _n(284, 78),
        },
    },
    "hand_on_hip_left": {
        "label": "左手叉腰",
        "joints": {
            "nose": _n(256, 78),
            "neck": _n(256, 118),
            "right_shoulder": _n(210, 138),
            "right_elbow": _n(195, 200),
            "right_wrist": _n(195, 260),
            "left_shoulder": _n(302, 138),
            "left_elbow": _n(330, 200),
            "left_wrist": _n(300, 250),
            "right_hip": _n(228, 272),
            "right_knee": _n(225, 370),
            "right_ankle": _n(225, 460),
            "left_hip": _n(284, 272),
            "left_knee": _n(287, 370),
            "left_ankle": _n(287, 460),
            "right_eye": _n(245, 68),
            "left_eye": _n(267, 68),
            "right_ear": _n(228, 78),
            "left_ear": _n(284, 78),
        },
    },
    "hand_on_hip_right": {
        "label": "右手叉腰",
        "joints": {
            "nose": _n(256, 78),
            "neck": _n(256, 118),
            "right_shoulder": _n(210, 138),
            "right_elbow": _n(182, 200),
            "right_wrist": _n(212, 250),
            "left_shoulder": _n(302, 138),
            "left_elbow": _n(317, 200),
            "left_wrist": _n(317, 260),
            "right_hip": _n(228, 272),
            "right_knee": _n(225, 370),
            "right_ankle": _n(225, 460),
            "left_hip": _n(284, 272),
            "left_knee": _n(287, 370),
            "left_ankle": _n(287, 460),
            "right_eye": _n(245, 68),
            "left_eye": _n(267, 68),
            "right_ear": _n(228, 78),
            "left_ear": _n(284, 78),
        },
    },
    "running": {
        "label": "奔跑",
        "joints": {
            "nose": _n(250, 76),
            "neck": _n(256, 118),
            "right_shoulder": _n(220, 145),
            "right_elbow": _n(185, 185),
            "right_wrist": _n(155, 150),
            "left_shoulder": _n(292, 132),
            "left_elbow": _n(332, 170),
            "left_wrist": _n(368, 220),
            "right_hip": _n(235, 272),
            "right_knee": _n(205, 330),
            "right_ankle": _n(185, 405),
            "left_hip": _n(282, 262),
            "left_knee": _n(328, 332),
            "left_ankle": _n(372, 298),
            "right_eye": _n(240, 68),
            "left_eye": _n(260, 66),
            "right_ear": _n(226, 76),
            "left_ear": _n(278, 76),
        },
    },
    "sitting": {
        "label": "坐姿",
        "joints": {
            "nose": _n(256, 96),
            "neck": _n(256, 136),
            "right_shoulder": _n(214, 152),
            "right_elbow": _n(188, 206),
            "right_wrist": _n(196, 252),
            "left_shoulder": _n(298, 152),
            "left_elbow": _n(324, 206),
            "left_wrist": _n(316, 252),
            "right_hip": _n(226, 250),
            "right_knee": _n(276, 300),
            "right_ankle": _n(336, 308),
            "left_hip": _n(286, 250),
            "left_knee": _n(338, 300),
            "left_ankle": _n(388, 312),
            "right_eye": _n(245, 86),
            "left_eye": _n(267, 86),
            "right_ear": _n(228, 96),
            "left_ear": _n(284, 96),
        },
    },
    "jump": {
        "label": "跳跃",
        "joints": {
            "nose": _n(256, 78),
            "neck": _n(256, 118),
            "right_shoulder": _n(210, 132),
            "right_elbow": _n(175, 86),
            "right_wrist": _n(150, 48),
            "left_shoulder": _n(302, 132),
            "left_elbow": _n(337, 86),
            "left_wrist": _n(362, 48),
            "right_hip": _n(228, 262),
            "right_knee": _n(195, 338),
            "right_ankle": _n(175, 410),
            "left_hip": _n(284, 262),
            "left_knee": _n(317, 338),
            "left_ankle": _n(337, 410),
            "right_eye": _n(245, 68),
            "left_eye": _n(267, 68),
            "right_ear": _n(228, 78),
            "left_ear": _n(284, 78),
        },
    },
    "kick": {
        "label": "踢腿",
        "joints": {
            "nose": _n(256, 78),
            "neck": _n(256, 118),
            "right_shoulder": _n(210, 138),
            "right_elbow": _n(175, 190),
            "right_wrist": _n(150, 240),
            "left_shoulder": _n(302, 138),
            "left_elbow": _n(337, 190),
            "left_wrist": _n(350, 240),
            "right_hip": _n(228, 272),
            "right_knee": _n(225, 370),
            "right_ankle": _n(225, 460),
            "left_hip": _n(284, 272),
            "left_knee": _n(340, 310),
            "left_ankle": _n(400, 310),
            "right_eye": _n(245, 68),
            "left_eye": _n(267, 68),
            "right_ear": _n(228, 78),
            "left_ear": _n(284, 78),
        },
    },
}


@dataclass(frozen=True)
class SketchPoseCandidate:
    identity_id: str
    color_hex: str
    color_name: str


def parse_sketch_color(color_value: str) -> tuple[str, str]:
    parts = (color_value or "").split(" ", 1)
    hex_code = parts[0] if parts else ""
    color_name = parts[1] if len(parts) > 1 else hex_code
    return hex_code, color_name


def pose_candidates(
    identity_ids: list[str],
    sketch_colors: dict[str, str],
) -> list[SketchPoseCandidate]:
    candidates: list[SketchPoseCandidate] = []
    for identity_id in identity_ids:
        color_value = sketch_colors.get(identity_id, "")
        if not color_value:
            continue
        color_hex, color_name = parse_sketch_color(color_value)
        if color_hex:
            candidates.append(
                SketchPoseCandidate(
                    identity_id=identity_id,
                    color_hex=color_hex,
                    color_name=color_name,
                )
            )
    return candidates


def all_pose_candidates(
    sketch_colors: dict[str, str],
) -> list[SketchPoseCandidate]:
    candidates: list[SketchPoseCandidate] = []
    for identity_id, color_value in sketch_colors.items():
        if not color_value:
            continue
        color_hex, color_name = parse_sketch_color(color_value)
        if color_hex:
            candidates.append(
                SketchPoseCandidate(
                    identity_id=identity_id,
                    color_hex=color_hex,
                    color_name=color_name,
                )
            )
    return candidates


def heuristic_pose_from_bbox(
    bbox: tuple[int, int, int, int],
    image_size: tuple[int, int],
) -> dict[str, Any]:
    x0, y0, x1, y1 = bbox
    width = max(8, x1 - x0 + 1)
    height = max(16, y1 - y0 + 1)
    cx = x0 + width / 2

    head_r = max(6, int(min(width, height) * 0.12))
    neck_y = y0 + height * 0.22
    shoulder_y = y0 + height * 0.28
    elbow_y = y0 + height * 0.44
    wrist_y = y0 + height * 0.58
    hip_y = y0 + height * 0.58
    knee_y = y0 + height * 0.78
    ankle_y = y0 + height * 0.95

    shoulder_dx = max(width * 0.18, head_r * 0.9)
    elbow_dx = max(width * 0.26, head_r * 1.4)
    wrist_dx = max(width * 0.30, head_r * 1.8)
    hip_dx = max(width * 0.12, head_r * 0.8)
    knee_dx = max(width * 0.14, head_r * 1.0)
    ankle_dx = max(width * 0.16, head_r * 1.1)

    nose_y = y0 + head_r * 0.9
    eye_y = nose_y - head_r * 0.25
    ear_y = nose_y
    eye_dx = head_r * 0.35
    ear_dx = head_r * 0.85

    joints = {
        "nose": {"x": cx, "y": nose_y},
        "neck": {"x": cx, "y": neck_y},
        "right_shoulder": {"x": cx + shoulder_dx, "y": shoulder_y},
        "right_elbow": {"x": cx + elbow_dx, "y": elbow_y},
        "right_wrist": {"x": cx + wrist_dx, "y": wrist_y},
        "left_shoulder": {"x": cx - shoulder_dx, "y": shoulder_y},
        "left_elbow": {"x": cx - elbow_dx, "y": elbow_y},
        "left_wrist": {"x": cx - wrist_dx, "y": wrist_y},
        "right_hip": {"x": cx + hip_dx, "y": hip_y},
        "right_knee": {"x": cx + knee_dx, "y": knee_y},
        "right_ankle": {"x": cx + ankle_dx, "y": ankle_y},
        "left_hip": {"x": cx - hip_dx, "y": hip_y},
        "left_knee": {"x": cx - knee_dx, "y": knee_y},
        "left_ankle": {"x": cx - ankle_dx, "y": ankle_y},
        "right_eye": {"x": cx + eye_dx, "y": eye_y},
        "left_eye": {"x": cx - eye_dx, "y": eye_y},
        "right_ear": {"x": cx + ear_dx, "y": ear_y},
        "left_ear": {"x": cx - ear_dx, "y": ear_y},
    }

    line_width = max(6, int(min(width, height) * 0.12))
    return {
        "joints": joints,
        "bbox": {"x": x0, "y": y0, "width": width, "height": height},
        "line_width": line_width,
        "head_radius": head_r,
        "source": "heuristic",
        "image_width": image_size[0],
        "image_height": image_size[1],
    }


def initial_skeletons(
    candidates: list[SketchPoseCandidate],
    image_size: tuple[int, int],
) -> list[dict[str, Any]]:
    width, height = image_size
    skeletons: list[dict[str, Any]] = []
    total = len(candidates)
    margin = width * 0.15
    spacing = (width - 2 * margin) / max(1, total - 1) if total > 1 else 0
    for index, candidate in enumerate(candidates):
        center_x = int(margin + index * spacing) if total > 1 else width // 2
        box_width = max(40, int(width * 0.15))
        box_height = max(80, int(height * 0.65))
        top = int(height * 0.1)
        bbox = (
            center_x - box_width // 2,
            top,
            center_x + box_width // 2,
            top + box_height,
        )
        pose = heuristic_pose_from_bbox(bbox, image_size)
        skeletons.append(
            {
                "identityId": candidate.identity_id,
                "colorHex": candidate.color_hex,
                "colorName": candidate.color_name,
                "joints": pose["joints"],
                "lineWidth": pose.get("line_width", 3),
                "headRadius": pose.get("head_radius", 12),
                "visible": False,
                "active": index == 0,
            }
        )
    return skeletons
