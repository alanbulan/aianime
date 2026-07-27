"""文件下载端点（带路径遍历防护）。"""

from fastapi import APIRouter, Depends

from ai_anime.api.auth import get_api_user
from ai_anime.api.project_file_delivery import serve_project_file

router = APIRouter()


@router.get("/projects/{project}/files/{file_path:path}")
async def download_file(
    project: str,
    file_path: str,
    user: dict = Depends(get_api_user),
):
    """下载项目内的生成文件。

    路径相对于 output/{username}/{project}/，
    自动防止目录遍历攻击。
    """
    return await serve_project_file(
        project=project,
        file_path=file_path,
        user=user,
        as_download=True,
    )


@router.get("/projects/{project}/media/{file_path:path}")
async def preview_file(
    project: str,
    file_path: str,
    user: dict = Depends(get_api_user),
):
    """预览项目内媒体文件。

    与 /files 使用同样的鉴权和路径防护，但返回 inline 响应，供 React 的
    <img>/<video>/<audio> 直接使用，避免裸 /static 依赖 NiceGUI session。
    """
    return await serve_project_file(
        project=project,
        file_path=file_path,
        user=user,
        as_download=False,
    )
