"""Creative Canvas mark selection rules."""

from dataclasses import dataclass


class CreativeCanvasMarkSelectionRequired(ValueError):
    pass


@dataclass(frozen=True)
class CreativeCanvasMarkSelection:
    point_x: float | None = None
    point_y: float | None = None
    box_x: float | None = None
    box_y: float | None = None
    box_width: float | None = None
    box_height: float | None = None

    @property
    def has_point(self) -> bool:
        return self.point_x is not None and self.point_y is not None

    @property
    def has_box(self) -> bool:
        return all(
            value is not None
            for value in (
                self.box_x,
                self.box_y,
                self.box_width,
                self.box_height,
            )
        )

    def require_target(self) -> None:
        if not (self.has_point or self.has_box):
            raise CreativeCanvasMarkSelectionRequired(
                "point or box selection is required"
            )
