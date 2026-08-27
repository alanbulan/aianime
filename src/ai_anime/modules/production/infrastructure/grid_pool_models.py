"""Persistence models for the Production grid image pool index."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class GridEntry(BaseModel):
    """网格图片元数据 - 追踪整图的 3 要素 (type + mode_key + beat_nums)。

    文件名模式: {type}_{mode_key}_{beats_str}_grid_{ts}.png
    例如: render_3x3_1-2-3-4-5-6-7-8-9_grid_20260227143052.png
    """

    type: str = Field(description="图片类型：render 或 sketch")
    mode_key: str = Field(description="生成模式，如 3x3, 1x1_9-16, 2x2_1-1")
    beat_nums: list[int] = Field(description="包含的 beat 编号列表")
    preset: str = Field(default="scene", description="preset 分组：scene / char / loc / custom")
    grid_path: str = Field(description="整图文件相对路径")
    prompt_path: str = Field(default="", description="提示词文件相对路径")
    model: str = Field(default="", description="实际生成模型 ID")
    model_selector: str = Field(default="", description="生成模型来源选择器")
    generated_at: Optional[datetime] = Field(default=None, description="生成时间")

    @property
    def beats_str(self) -> str:
        """beat 编号的 - 分隔字符串。"""
        return "-".join(str(b) for b in self.beat_nums)


class PoolImage(BaseModel):
    """图片池条目 - 用于灵活的图片选择系统。

    所有生成的图片（1x1, 3x3, 5x5 等）统一进入图片池，
    用户可以从池中自由选择任意图片分配给任意 beat。

    支持两种类型：
    - render: 渲染图（高清成品图）
    - sketch: 草图（构图参考）

    版本管理：
    - cell 文件统一存入 cells/ 目录，使用 beat 中心命名: cells/beat_01_t20260213143052.png
    - generated_at 记录生成时间，用于版本排序
    """

    id: str = Field(description="唯一标识，格式: beat_{NN}_t{timestamp}[_render|_sketch]")
    mode: str = Field(description="生成模式：1x1, 3x3, 5x5, regen 等")
    grid_index: int = Field(description="所属网格的索引（从1开始）")
    cell_index: int = Field(description="在网格中的单元格索引（从1开始，按行优先）")
    grid_path: str = Field(description="原始网格图片路径")
    cell_path: Optional[str] = Field(default=None, description="切割后的单元格图片路径")
    row: int = Field(description="在网格中的行号（从0开始）")
    col: int = Field(description="在网格中的列号（从0开始）")
    original_beat: int = Field(description="原始生成时对应的 beat 编号")
    generated_at: Optional[datetime] = Field(default=None, description="生成时间（用于版本管理）")
    type: str = Field(default="render", description="图片类型：render（渲染图）或 sketch（草图）")
    content_hash: Optional[str] = Field(default=None, description="内容哈希（用于去重）")
    beat_content_hash: Optional[str] = Field(
        default=None, description="生成时 beat 内容的 SHA256（用于 stale 判断）"
    )
    model: str = Field(default="", description="实际生成模型 ID")
    model_selector: str = Field(default="", description="生成模型来源选择器")


class PoolIndex(BaseModel):
    """图片池索引 - 管理一个集数的所有图片池条目。"""

    episode: int = Field(description="集数")
    generated_at: datetime = Field(default_factory=datetime.now, description="生成时间")
    version: int = Field(default=2, description="索引版本：1=旧格式, 2=新格式")
    modes: dict[str, dict] = Field(
        default_factory=dict,
        description="各模式统计，如 {'3x3': {'total_grids': 3, 'total_cells': 27}}",
    )
    grids: list[GridEntry] = Field(default_factory=list, description="所有整图元数据")
    images: list[PoolImage] = Field(default_factory=list, description="所有图片池条目")
    beat_assignments: dict[str, str] = Field(
        default_factory=dict,
        description="beat → render cell 映射，如 {'1': '3x3_g01_c01', '2': '3x3_g01_c02'}",
    )

    def get_cell_path(self, pool_id: str) -> Optional[str]:
        """根据 pool_id 获取单元格路径。"""
        for img in self.images:
            if img.id == pool_id:
                return img.cell_path
        return None

    def get_image(self, pool_id: str) -> Optional[PoolImage]:
        """根据 pool_id 获取图片条目。"""
        for img in self.images:
            if img.id == pool_id:
                return img
        return None

    def filter_by_beat_and_type(self, beat: int, img_type: str) -> list[PoolImage]:
        """按 beat 和类型筛选图片。"""
        return [img for img in self.images if img.original_beat == beat and img.type == img_type]

    def find_grid(self, grid_type: str, mode_key: str, beat_nums: list[int]) -> Optional[GridEntry]:
        """按 3 要素查找整图。"""
        beat_set = set(beat_nums)
        for g in self.grids:
            if g.type == grid_type and g.mode_key == mode_key and set(g.beat_nums) == beat_set:
                return g
        return None

    def add_grid(self, entry: GridEntry) -> None:
        """添加整图元数据。"""
        self.grids.append(entry)

    def has_duplicate_cell(self, beat_num: int, content_hash: str) -> bool:
        """检查池中是否已存在相同 beat 且内容一致的图片。"""
        for img in self.images:
            if img.original_beat == beat_num and img.content_hash == content_hash:
                return True
        return False


__all__ = ["GridEntry", "PoolImage", "PoolIndex"]
