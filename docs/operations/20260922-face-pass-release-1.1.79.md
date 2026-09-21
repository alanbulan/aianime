# 人脸直过与一一点一点七十九发布记录

## 时间与原因

北京时间二〇二六年九月二十二日，用户完成画布“人脸直过”工具的新文件后，要求评审、
修复到无问题，再按既有流程推送两个远端并触发三平台构建。本轮发布版本 `1.1.79`，
不覆盖 `1.1.78` 的安装包。

## 评审结论与修复

人脸直过在浏览器 Worker 内完成：YuNet（onnxruntime-web，module worker）检测人脸，
Haar 兜底与绘制在 classic worker 里用 opencv.js 完成，不经过云端。几何公式、检测
解码、NMS、直方图均衡与兜底顺序均与上游 `seedance2-real-people` 提交
`ddbba868` 的 `lib/detect-eyes.js`、`lib/detectors/yunet.js` 逐项比对一致，
包括上游 `centerInside` 传中心点导致 Haar 补获人脸不被过滤的既有行为。

依赖清单中六个新文件（YuNet 模型、三份 Haar 级联、opencv.js、opencv_js.wasm）
已从清单列出的下载源实际下载，字节数与 SHA-256 全部与清单一致。

发现并修复四处：

| 问题 | 处理 |
| --- | --- |
| 网关用 `fetch(dataUrl)` 取源图 Blob，桌面 CSP 的 `connect-src` 不含 `data:`，正式包会失败 | 改为与既有资产读取一致的 `dataUrlToBlob` 直接解码 |
| Haar worker 内嵌的几何实现没有任何门禁，与 domain 版本会静默分歧 | 新增 `facePassHaarWorker.test.ts`，用 `require` 载入 worker 源逐函数比对 |
| Haar worker 在顶层直接给 `self.onmessage` 赋值，Node 中 `require` 会抛错 | 入口改为函数，仅在 worker 环境挂载 |
| 两份翻译文件 `matteName`/`matteDescription` 缩进被破坏 | 恢复原缩进 |

保留但需知悉的边界：Haar worker 与 domain 保留两份几何实现，原因是 classic worker
无法 import ES 模块，现由一致性测试约束；上游默认检测器在 YuNet 不可用时回落
Haar，本实现固定默认 YuNet，模型缺失时提示前往环境依赖安装，属有意差异。

## 本地验证

| 检查 | 结果 |
| --- | --- |
| 前端定向单元（facePass 几何、选项、worker 一致性、工具处理器） | 20 通过 |
| 前端类型检查 `pnpm --dir frontend typecheck` | 通过 |
| 前端架构门禁 | 411 通过 |
| 完整前端 `pnpm --dir frontend test` | 单元 2,305 通过；组件 2,128 通过、1 跳过；浏览器 42 通过 |
| 桌面类型检查与 `pnpm --dir desktop test` | 317 通过、3 跳过 |
| Python `uv run pytest tests/test_api_app_factory.py` | 7 通过 |
| `pnpm --dir desktop build` | 通过，两个 worker 分别产出 |
| `pnpm --dir desktop release:verify` | 工作区版本统一为 `1.1.79` |
| `git diff --check` | 通过 |

未执行：三平台人工安装、实际安装环境依赖后对真实照片的人脸直过验收。
后者需要用户在“设置 > 环境依赖”重新安装图片处理运行环境后在真机验证。

## 发布步骤

版本、发布说明同步为 `1.1.79`。提交后推送 Gitee 与 GitHub 的 `master`，再推送
注释标签 `v1.1.79` 触发 `build-desktop.yml` 三平台构建与统一发布。运行编号与
结果在后续记录追加。
