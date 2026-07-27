"""Local Creative Canvas bootstrap storage."""

from ai_anime.freezone import canvas_store
from ai_anime.freezone.canvas_lock import CanvasLockBusy
from ai_anime.freezone.paths import canvases_dir, freezone_root, uploads_dir
from ai_anime.modules.creative_canvas.application.bootstrap import (
    CreativeCanvasBootstrapBusy,
    CreativeCanvasBootstrapCorrupt,
    CreativeCanvasBootstrapResult,
    InitializeCreativeCanvasCommand,
)


class LocalCreativeCanvasBootstrapStorage:
    def initialize(
        self,
        command: InitializeCreativeCanvasCommand,
    ) -> CreativeCanvasBootstrapResult:
        root = freezone_root(command.project_dir)
        root.mkdir(parents=True, exist_ok=True)
        uploads_dir(command.project_dir).mkdir(parents=True, exist_ok=True)
        canvases_dir(command.canvas_state_dir).mkdir(parents=True, exist_ok=True)
        try:
            default_canvas = canvas_store.ensure_default_canvas(
                command.canvas_state_dir,
                project_id=command.project_id,
                actor_id=command.actor_id,
            )
        except canvas_store.CanvasCorruptError as exc:
            raise CreativeCanvasBootstrapCorrupt(str(exc)) from exc
        except CanvasLockBusy as exc:
            raise CreativeCanvasBootstrapBusy(exc.canvas_id) from exc
        return CreativeCanvasBootstrapResult(
            freezone_dir=root,
            default_canvas_id="default",
            default_canvas_created=default_canvas.created,
            default_canvas_revision=default_canvas.payload.get("revision"),
        )
