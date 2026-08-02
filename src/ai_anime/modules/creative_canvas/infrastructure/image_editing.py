"""Creative Canvas image editing adapters."""

from pathlib import Path

from PIL import Image

from ai_anime.modules.creative_canvas.domain.image_editing import (
    CreativeCanvasImageCameraConfig,
    CreativeCanvasImageStyleConfig,
    plan_outpaint_canvas,
)
from ai_anime.modules.creative_canvas.domain.image_prompts import (
    merge_image_prompt_with_style_and_camera,
)
from ai_anime.modules.creative_canvas.infrastructure.image_models import (
    resolve_configured_image_model,
)
from ai_anime.modules.creative_canvas.infrastructure.paths import (
    safe_upload_filename,
    uploads_dir,
)


class PillowCreativeCanvasImageEditingStorage:
    def size(self, source_path: Path) -> tuple[int, int]:
        with Image.open(source_path) as image:
            return image.size

    def prepare_outpaint_base(
        self,
        *,
        source_path: Path,
        project_dir: Path,
        target_aspect_ratio: str,
    ) -> Path:
        with Image.open(source_path) as image:
            image_rgba = image.convert("RGBA")
            plan = plan_outpaint_canvas(
                image_rgba.width,
                image_rgba.height,
                target_aspect_ratio,
            )
            if plan.width == image_rgba.width and plan.height == image_rgba.height:
                return source_path

            canvas = Image.new(
                "RGBA",
                (plan.width, plan.height),
                (255, 255, 255, 0),
            )
            canvas.alpha_composite(image_rgba, (plan.offset_x, plan.offset_y))

        padded_name = safe_upload_filename(f"outpaint_base_{source_path.stem}.png")
        padded_path = uploads_dir(project_dir) / padded_name
        padded_path.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(padded_path, format="PNG")
        return padded_path


class FreezoneCreativeCanvasImagePromptComposer:
    def compose(
        self,
        prompt: str,
        style: CreativeCanvasImageStyleConfig | None,
        camera: CreativeCanvasImageCameraConfig | None,
    ) -> str:
        return merge_image_prompt_with_style_and_camera(prompt, style, camera)


class FreezoneCreativeCanvasImageModelRouter:
    def resolve(self, model: str) -> str:
        return resolve_configured_image_model(model)
