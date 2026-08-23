---
version: 1.1.56
attention: medium
---
# v1.1.56

## User-facing Highlights (zh)

- **模型调用统一**：图片、视频与文本生成统一沿用现有云端协议、BYOK、目录路由与计价元数据；旧项目只保存模型值时仍可兼容回退。
- **配音前置条件明确**：旁白与角色声线缺失时不再静默生成异常音频；AI 声音模型、参考音频和已有声线沿用同一任务链路。
- **视频连续性与比例修复**：Beat 视频继承统一规划信息、素材约束和项目画幅，避免分段生成时首尾跳变、裁剪方向错误或模型静默忽略素材。
- **画布可靠性提升**：修复并发自动保存、旧任务覆盖新结果、外部文件跨节点丢失、蒙版定位、慢速上传超时以及大图节点解码卡顿。
- **导入与资产修复**：补齐小说导入前置校验、剧本场景解析、知识图谱保护和路径安全资产名；历史数据库与目录修复集中由版本化迁移脚本执行。
- **内置风格补齐**：现有风格选择器内置 45 套短剧风格，不新增独立风格节点；缩略图按显示尺寸、画布缩放和屏幕像素比自动选档。
- **版本同步**：Python、Electron、前端版本兜底、依赖锁文件、README 与发布说明统一更新为 1.1.56。

## User-facing Highlights (en)

- **Unified model calls**: Image, video, and text generation now share the existing cloud, BYOK, catalog-routing, and billing-metadata protocol, with fallback support for legacy saved model values.
- **Explicit voice prerequisites**: Missing narrator or character voices no longer fail silently; AI voices, reference audio, and configured voices use the same task pipeline.
- **Video continuity and aspect fixes**: Beat videos inherit shared planning context, media constraints, and project aspect ratios to reduce cut discontinuities, incorrect crops, and silently ignored references.
- **More reliable canvas**: Fixed concurrent autosaves, stale tasks overwriting newer results, lost external files during node conversion, mask localization, slow-upload timeouts, and full-resolution image decode stalls.
- **Import and asset hardening**: Restored novel prerequisites, screenplay scene parsing, knowledge-graph guards, and path-safe asset names; legacy database and filesystem repair now runs through versioned migration scripts.
- **Built-in styles restored**: The existing style picker now contains 45 short-drama presets without introducing a separate style node; thumbnails adapt to display size, canvas zoom, and device pixel ratio.
- **Version synchronization**: Python, Electron, frontend fallback, dependency lock, README, and release notes are synchronized to 1.1.56.
