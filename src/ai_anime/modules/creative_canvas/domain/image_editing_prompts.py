"""Creative Canvas reference image editing prompt rules."""

from __future__ import annotations


class InvalidCreativeCanvasImageTemplateMode(ValueError):
    pass


def build_image_multi_view_prompt(
    *,
    preset: str,
    yaw_degrees: float,
    pitch_degrees: float,
    shot_size: str,
    prompt: str,
) -> str:
    preset_map = {
        "custom": "custom camera reposition",
        "fisheye": "fisheye angle",
        "oblique": "oblique angle",
        "front": "front-facing shot",
        "front_up": "front low-angle shot",
        "full_body": "full-body shot",
        "back": "back view shot",
    }
    shot_size_map = {
        "extreme_close_up": "extreme close-up",
        "close_up": "close-up",
        "medium_close": "medium close-up",
        "medium": "medium shot",
        "full_body": "full-body shot",
        "wide": "wide shot",
        "extreme_wide": "extreme wide shot",
    }
    preset_text = preset_map.get(preset, "custom camera reposition")
    shot_size_text = shot_size_map.get(shot_size, "medium shot")
    user_block = f"\nUser prompt:\n{prompt.strip()}" if prompt.strip() else ""
    return (
        "Reframe the provided source image into a new camera angle while preserving the same scene, "
        "same characters, same identities, same costume continuity, and same lighting logic unless explicitly changed.\n\n"
        f"Preset target: {preset_text}.\n"
        f"Horizontal rotation: {yaw_degrees:.1f} degrees.\n"
        f"Vertical tilt: {pitch_degrees:.1f} degrees.\n"
        f"Shot size: {shot_size_text}.\n"
        f"{user_block}\n\n"
        "Output requirements:\n"
        "- Keep the image as one single final frame, not a contact sheet.\n"
        "- Preserve facial identity and scene continuity.\n"
        "- Infer plausible unseen content when the requested angle reveals new areas.\n"
        "- Do not add text, UI, borders, watermark, or collage layout.\n"
        "- Keep the result production-ready and visually coherent."
    )


def build_image_relight_prompt(
    *,
    has_lighting_reference: bool,
    scope: str,
    smart_mode: bool,
    brightness: int,
    color_hex: str,
    color_temperature_kelvin: int | None,
    key_light_direction: str,
    rim_light: bool,
    prompt: str,
) -> str:
    base = (prompt or "").strip()
    reference_block = (
        "- Reference image 2 = lighting reference image.\n"
        "- Use it to transfer the lighting mood, contrast, exposure logic, shadow behavior, and color temperature.\n"
        if has_lighting_reference
        else "- No lighting reference image is attached. Infer the lighting design from the requested controls.\n"
    )
    smart_block = "enabled" if smart_mode else "disabled"
    rim_block = "enabled" if rim_light else "disabled"
    color_temperature = _describe_color_temperature(color_temperature_kelvin)
    color_temperature_control = (
        f"\n- Color temperature: {color_temperature}." if color_temperature else ""
    )
    prefix = f"""Relight the provided source image.

INPUT IMAGE ROLES:
- Reference image 1 = source image to be relit.
{reference_block}

RELIGHT CONTROLS:
- Scope: {scope}.
- Smart mode: {smart_block}.
- Brightness: {brightness}/100.
- Key light color / overall color tone: {color_hex}.{color_temperature_control}
- Key light direction: {key_light_direction}.
- Rim light: {rim_block}.

RELIGHTING CONTRACT:
- Keep the same scene, same subjects, same camera framing, and same composition.
- Preserve facial identity, costume continuity, and environment layout.
- Transfer or infer only the lighting characteristics: light direction, softness/hardness, contrast ratio, color temperature, shadow density, highlight behavior, and overall mood.
- Do not turn the image into a different scene.
- Do not add text, watermark, UI, borders, or collage layout.
- Keep the result production-ready and visually coherent."""
    return f"{prefix}\n\n{base}" if base else prefix


def build_image_template_edit_prompt(mode: str, prompt: str) -> str:
    user_block = f"\n\nUser prompt:\n{prompt.strip()}" if prompt.strip() else ""
    templates: dict[str, str] = {
        "multi_camera_nine_grid": (
            "Generate a libtv-style 3x3 director multi-camera contact sheet from the source image.\n\n"
            "Output requirements:\n"
            "- Final output must be one readable 3x3 grid contact sheet, not nine separate images.\n"
            "- Keep the same primary subject, same costume, same scene, same time moment, and same action.\n"
            "- Do not add new characters, new dialogue, new story events, or unrelated props.\n"
            "- Each cell must preserve the source image aspect ratio and orientation.\n"
            "- Do not crop each camera view into a different ratio.\n"
            "- Vary only camera coverage: shot size, camera height, lens distance, and angle.\n"
            "- Each panel must look like a usable director coverage frame from the same shot setup.\n"
            "- Add a small white label in the upper-left corner of every cell.\n"
            "- Use exactly these nine labels and shot types in reading order:\n"
            "  [KF1 | 3s | ELS] extreme long shot / full environment,\n"
            "  [KF2 | 2s | LS] long shot / full body,\n"
            "  [KF3 | 2s | MLS] medium long shot,\n"
            "  [KF4 | 2s | MS] medium shot,\n"
            "  [KF5 | 2s | MCU] medium close-up,\n"
            "  [KF6 | 2s | CU] close-up,\n"
            "  [KF7 | 1s | ECU] extreme close-up of the key hand/object/detail,\n"
            "  [KF8 | 2s | High-Angle] high-angle view,\n"
            "  [KF9 | 2s | Low-Angle] low-angle view.\n"
            "- Use thin dark grid lines between cells; no large white gutters, no decorative border.\n"
            "- Fill the whole output canvas; do not add black bars, letterboxing, UI, or watermark.\n"
            "- Preserve identity, costume, lighting mood, color tone, and scene continuity across all cells."
        ),
        "story_pitch_four_grid": (
            "Generate a 2x2 story pitch board from the source image.\n\n"
            "Output requirements:\n"
            "- Create four consecutive pitch frames that expand the current story moment.\n"
            "- Keep the same characters, scene, and dramatic context.\n"
            "- Emphasize clear story progression and emotional beats.\n"
            "- Each cell must preserve the source image aspect ratio and orientation.\n"
            "- Do not crop each story frame into a different ratio.\n"
            "- Arrange the four same-ratio frames in a clean 2x2 grid with thin dividers.\n"
            "- Fill the whole output canvas; do not add black bars, letterboxing, UI, or watermark."
        ),
        "character_face_three_view": (
            "Generate a clean three-view face sheet from the source image.\n\n"
            "Output requirements:\n"
            "- Show front view, three-quarter view, and side view of the same face.\n"
            "- Preserve facial identity, age, hairstyle, skin tone, and expression logic.\n"
            "- Use a clean reference-sheet style.\n"
            "- Final output must be a compact three-view face layout."
        ),
        "product_three_view": (
            "Generate a clean three-view product reference sheet from the source image.\n\n"
            "Output requirements:\n"
            "- Show front, side, and back/alternate view of the same product.\n"
            "- Preserve materials, silhouette, proportions, and key details.\n"
            "- Use a clean product reference layout with neutral presentation.\n"
            "- Final output must be a three-view sheet."
        ),
        "storyboard_25_grid": (
            "Generate a libtv-style 5x5 cinematic storyboard shot sequence from the source image.\n\n"
            "Output requirements:\n"
            "- Final output must be one readable 5x5 storyboard contact sheet, not 25 separate images.\n"
            "- Build a coherent shot progression around the same core event in the source image.\n"
            "- Do not create random variants, unrelated future scenes, or a new ending.\n"
            "- Preserve the visible subjects, identities, costumes/materials, environment, lighting mood, "
            "and key objects from the source image.\n"
            "- Adapt the sequence to the actual source content. Do not invent dialogue, extra characters, "
            "paper, weapons, vehicles, or props that are not visible or strongly implied.\n"
            "- Organize the 25 cells like an editable film sequence:\n"
            "  1-3 establishing coverage of the location, subject placement, and spatial relationship,\n"
            "  4-6 primary subject close-ups, detail views, or reaction shots when characters exist,\n"
            "  7-10 alternate angles, over-the-shoulder or eye-line coverage only when applicable,\n"
            "  11-15 step-by-step progression of the visible key action or the most plausible next micro-action,\n"
            "  16-19 inserts and extreme close-ups of visible key details: hands, face, eyes, object, "
            "texture, signage, machinery, landscape feature, or environment clue,\n"
            "  20-22 pause, reaction, consequence, or atmospheric detail beats,\n"
            "  23-25 restrained resolution frames that stay in the same scene and subject context.\n"
            "- Mix shot types deliberately: wide, medium, close-up, extreme close-up, insert, reaction/detail. "
            "Use OTS only when the source contains a valid over-shoulder relationship.\n"
            "- Avoid repeating the same two-shot or portrait composition across many cells.\n"
            "- Number each cell unobtrusively in the upper-left corner from 1 to 25.\n"
            "- Each cell must preserve the source image aspect ratio and orientation.\n"
            "- Do not crop each storyboard frame into a different ratio.\n"
            "- Arrange the twenty-five same-ratio frames in a clean 5x5 grid with thin dividers.\n"
            "- Fill the whole output canvas; do not add black bars, letterboxing, UI, or watermark."
        ),
        "cinematic_light_correction": (
            "Cinematically refine the source image lighting.\n\n"
            "Output requirements:\n"
            "- Improve light hierarchy, shadow structure, exposure balance, and atmosphere.\n"
            "- Preserve the source image aspect ratio, canvas dimensions, and orientation exactly.\n"
            "- Keep the same scene, same characters, and same camera framing.\n"
            "- Do not turn the image into a different composition.\n"
            "- Fill the whole existing canvas; do not add black bars, borders, or letterboxing.\n"
            "- Final output must remain a single frame with no collage, UI, watermark, or text."
        ),
        "character_three_view_generation": (
            "Generate a clean character three-view sheet from the source image.\n\n"
            "Output requirements:\n"
            "- Show front, side, and back/full-figure view of the same character.\n"
            "- Preserve face identity, body proportions, costume details, and style.\n"
            "- Keep the presentation clean and reference-friendly.\n"
            "- Final output must be a three-view character sheet."
        ),
        "image_projection_after_3s": (
            "Create a future keyframe from the source image, as if this is a libtv-style "
            "frame projection 3 seconds later in a video.\n\n"
            "Output requirements:\n"
            "- Preserve character identity, costume, environment, art style, and story continuity.\n"
            "- Preserve the source image aspect ratio, canvas dimensions, and orientation exactly.\n"
            "- Fill the whole existing canvas; do not add black bars, borders, or letterboxing.\n"
            "- Do not make a near-duplicate or simple retouch of the source image.\n"
            "- Create a clear time jump: the subject must be in a different action phase, "
            "body pose, walking position, hand position, gaze, and object placement.\n"
            "- Within the same frame size, use plausible camera pan, tilt, push, pull, or subject "
            "relocation to make the temporal change obvious.\n"
            "- Allow doors, props, cloth, hair, shadows, and nearby environment details to change "
            "according to the action, while keeping spatial continuity coherent.\n"
            "- The projected moment should feel like a real adjacent video frame, not a retouched still.\n"
            "- Final output must be one single frame with no collage, UI, watermark, or text."
        ),
        "image_projection_before_5s": (
            "Create a past keyframe from the source image, as if this is a libtv-style "
            "frame projection 5 seconds before in a video.\n\n"
            "Output requirements:\n"
            "- Preserve character identity, costume, environment, art style, and story continuity.\n"
            "- Preserve the source image aspect ratio, canvas dimensions, and orientation exactly.\n"
            "- Fill the whole existing canvas; do not add black bars, borders, or letterboxing.\n"
            "- Do not make a near-duplicate or simple retouch of the source image.\n"
            "- Create a clear earlier setup: the subject must be in a different action phase, "
            "body pose, walking position, hand position, gaze, and object placement.\n"
            "- Within the same frame size, use plausible camera pan, tilt, push, pull, or subject "
            "relocation to make the earlier moment obvious.\n"
            "- Allow doors, props, cloth, hair, shadows, and nearby environment details to change "
            "according to the preceding action, while keeping spatial continuity coherent.\n"
            "- The projected moment should feel like a real adjacent video frame, not a retouched still.\n"
            "- Final output must be one single frame with no collage, UI, watermark, or text."
        ),
    }
    template = templates.get(mode)
    if template is None:
        raise InvalidCreativeCanvasImageTemplateMode(
            f"unsupported template edit mode: {mode}"
        )
    return f"{template}{user_block}"


def resolve_image_template_aspect_ratio(mode: str) -> str:
    ratios = {
        "multi_camera_nine_grid": "original",
        "story_pitch_four_grid": "original",
        "character_face_three_view": "3:2",
        "product_three_view": "3:2",
        "storyboard_25_grid": "original",
        "cinematic_light_correction": "original",
        "character_three_view_generation": "16:9",
        "image_projection_after_3s": "original",
        "image_projection_before_5s": "original",
    }
    return ratios.get(mode, "16:9")


def resolve_image_template_image_size(mode: str) -> str:
    if mode in {
        "cinematic_light_correction",
        "image_projection_after_3s",
        "image_projection_before_5s",
    }:
        return "original"
    return "2K"


def _describe_color_temperature(kelvin: int | None) -> str | None:
    if kelvin is None:
        return None
    if kelvin < 2400:
        tone = "very warm candlelight / firelight"
    elif kelvin < 3500:
        tone = "warm tungsten / amber practical light"
    elif kelvin < 5000:
        tone = "soft warm white light"
    elif kelvin < 6200:
        tone = "neutral daylight-balanced white light"
    elif kelvin < 8000:
        tone = "cool white daylight"
    else:
        tone = "very cool blue-hour / overcast light"
    return f"{kelvin}K ({tone})"
