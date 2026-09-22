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

## 1.1.79 发布中断与改发 1.1.80

标签 `v1.1.79` 触发的运行
[35625587331](https://github.com/alanbulan/aianime/actions/runs/35625587331)
三端打包全部成功，草稿 Release 已保存全部制品；最后的“Publish verified packages to cloud”
在上传 Windows 安装包（fileId 3887，678,441,275 字节）24 分钟后收到云端 HTTP 400 中止，
版本未在云端登记。对比 1.1.78 同一步骤仅用 2 分半，判断为本次云端上传通道异常。

随后用 `publish-desktop.yml` 复用原构件重发（运行 35668466076），用户此时本机已安装
1.1.79，要求改以新版本发布，因此取消该重发运行，版本统一升级到 `1.1.80` 并推送
标签 `v1.1.80` 重新触发三端构建。1.1.80 与 1.1.79 源码功能相同，仅版本号与发布说明不同。

## 二次评审修复与改发 1.1.81

1.1.80 构建（运行 35668909419）进行中，另一轮评审确认三处真问题：Haar 级联分类器
每次处理都新建且不释放（WASM 堆泄漏）、结果节点未使用 facePass 类型与标题、表单
label 未关联控件；并顺带去掉源图 base64 往返。修复提交 `080e5ef2` 全量门禁通过
（单元 2305、组件 2128 通过 1 跳过、浏览器 42、架构 411、类型检查、正式构建）。
用户要求停止 1.1.80 构建并带修复重新发布，因此取消该运行，版本升级到 `1.1.81`
并推送标签 `v1.1.81` 重新触发三端构建。1.1.79 与 1.1.80 均未在云端登记。

## 1.1.81 云端上传三次失败的证据

标签 `v1.1.81`（提交 `8703f460`）运行
[35672168569](https://github.com/alanbulan/aianime/actions/runs/35672168569)
三端打包全部成功，草稿 Release 已保存全部制品；上传云端在 Windows 安装包
（fileId 3890，678,439,140 字节）3 分 33 秒后收到 HTTP 400。复用同批构件的
[35676074254](https://github.com/alanbulan/aianime/actions/runs/35676074254)
再次在同一文件（fileId 3891）24 分 06 秒后收到 HTTP 400。加上 1.1.79 的一次，
同一步骤同一文件连续三次失败，macOS 两个安装包始终未轮到上传。

网关侧（aigo-cloud `fileproxy.Upload`）把请求体直接转发到 S3 兼容对象存储的
预签名 PUT，任何错误都经 go-zero 默认处理映射为 HTTP 400，因此客户端日志看不到
真实原因；真实原因在网关日志中以 `write managed file` 或
`does not match declared size` 开头的行，以及对象存储自身日志。

| 版本 | Windows 安装包字节数 | 上传结果 |
| --- | ---: | --- |
| 1.1.74 | 678,350,441 | 成功 |
| 1.1.75 | 678,341,513 | 成功 |
| 1.1.77 | 678,378,886 | 成功 |
| 1.1.78 | 678,300,347 | 成功 |
| 1.1.79 | 678,441,275 | HTTP 400 |
| 1.1.81 | 678,439,140 | HTTP 400 ×2 |

历次成功的安装包都不超过 678,378,886 字节，三次失败的都不小于 678,439,140 字节，
647 MiB（678,428,672 字节）正落在两者之间，指向对象存储或其前置代理的请求体上限，
或存储卷剩余空间不足。该问题不在桌面仓库内，需在服务端核对后再用
`publish-desktop.yml`（输入 `35672168569`）复用已签名构件发布，无需重新构建。
