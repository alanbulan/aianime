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

## 1.1.81 最终发布结果

服务端处理后再次触发 `publish-desktop.yml`（运行 35681399775），上传步骤不再收到
HTTP 400，但 Windows 包在脚本 35 分钟超时内仍未传完。对比历史：1.1.71 恢复、
1.1.77、1.1.78 三端全部上传均只需 2.5 到 5 分钟，当日四次尝试仅第一个包就耗时
3.5 到 35 分钟，判断为 GitHub 机房到服务器链路当日异常；本机向上传接口探测为 7 MB/s。

改为本机复用同一批构件发布：从运行 35672168569 下载三个构件，`release:combine`
对三端安装包与更新清单的字节数、SHA-256 及校验清单逐项核对通过，dry-run 通过后，
由用户提供平台管理员凭据，北京时间十三时二十三分执行 `release:publish` 成功。

| 平台 | 云端安装文件 | 字节数 | SHA-256 前 12 位 |
| --- | --- | ---: | --- |
| Windows x64 | `AI-anime-1.1.81-x64-setup.exe` | 678,439,140 | `712a8ad89bd1` |
| Intel Mac | `AI-anime-1.1.81-macos-x64.zip` | 811,311,778 | `93c5b176beb9` |
| Apple Silicon Mac | `AI-anime-1.1.81-macos-arm64.zip` | 794,982,483 | `ba7a96f09e2c` |

云端版本 ID `f27c7228-506f-48b3-9687-5b3549e82801`，状态 `PUBLISHED`，版本 `1.1.81`，
三个平台的安装包与更新清单摘要均与 CI 校验清单一致。1.1.79 与 1.1.80 未在云端登记。
本机未做三端人工安装验收；原生资源、签名与更新验证由构建运行 35672168569 执行。

## 1.1.81 真机复现 CSP 失败与改发 1.1.82

用户在 Windows 1.1.81 上执行人脸直过，弹窗报
`Evaluating a string as JavaScript violates the following Content Security Policy directive because 'unsafe-eval' is not an allowed source of script`。

根因：opencv.js 的 embind 绑定层 `craftInvokerFunction` 用 `newFunc(Function, args)`
动态生成每个 C++ 方法的调用器，官方 OpenCV.js 4.x 构建同样如此（本地下载核对，
含 `new Function(` 与 `craftInvokerFunction(`），因此任何 opencv.js 都离不开
`'unsafe-eval'`。onnxruntime-web 的 `new Function` 只在 emval 方法调用路径，
YuNet 推理不经过。

修复：桌面端 `desktop-session-security.ts` 只对可信来源、路径名为
`facePassHaarWorker(-hash).js` 的脚本响应下发含 `'unsafe-eval'` 的 CSP；专用 worker 的
策略来自自身脚本响应头，作用域仅该 worker（无 DOM，connect-src 不变）。页面、抠图
worker、YuNet worker、opencv.js 自身响应以及外部域名同名脚本均保持原策略。
前端 worker 文件头注明文件名契约，桌面测试断言前端源文件仍在原路径。

Chromium 实测（Playwright，加载正式构建的两个 worker 与真实模型/运行时文件）：
严格策略下 YuNet worker 正常、Haar worker 报出与用户截图一致的错误；
按修复后的策略，两个 worker 均正常返回，无控制台错误。

验证：桌面类型检查通过；桌面测试 318 通过、3 跳过；前端 Haar worker 一致性测试
5 通过；`git diff --check` 通过。版本升级到 `1.1.82` 并推送标签 `v1.1.82`。

## 1.1.82 最终发布结果

标签 `v1.1.82`（提交 `4d1e9b35`）运行
[35694801821](https://github.com/alanbulan/aianime/actions/runs/35694801821)
三端打包全部成功；统一发布任务的云端上传运行 25 分钟仍停在第一个包，链路仍慢，
取消该运行后本机复用同批构件发布：下载三个构件，`release:combine` 字节与 SHA-256
核对通过，dry-run 通过，北京时间十五时四十八分 `release:publish` 成功。

| 平台 | 云端安装文件 | 字节数 | SHA-256 前 12 位 |
| --- | --- | ---: | --- |
| Windows x64 | `AI-anime-1.1.82-x64-setup.exe` | 678,443,026 | `55cccacc1acc` |
| Intel Mac | `AI-anime-1.1.82-macos-x64.zip` | 811,313,919 | `0b77104146cc` |
| Apple Silicon Mac | `AI-anime-1.1.82-macos-arm64.zip` | 794,983,955 | `34fe7de9b4b8` |

云端版本 ID `019d65d8-6c62-4316-a235-baf3d21c07a5`，状态 `PUBLISHED`，版本 `1.1.82`。
本机未做三端人工安装验收；原生资源、签名与更新验证由构建运行执行。

## 1.1.82 真机结果不可用：默认参数下的三处偏差修正

用户在 1.1.82 上用默认参数处理一张实拍人像，结果出现三种异常：整张脸盖一层橙色
半透明阴影；两只眼睛都被白方块遮住；下巴以下的毛衣、头发上散布六个小白方块。
同一张图在上游线上站 face.83zi.com 默认参数只遮右眼一个方块，其余干净。

复现与定位（GitHub 快照 `ddbba868` 的 `lib/detect-eyes.js` 在本机 Node 直跑同一张图）：

| 现象 | 根因 | 证据 |
| --- | --- | --- |
| 橙色阴影 | 上游 `paintFaceOverlay` 是 Haar 补获脸的调试彩绘，GitHub 快照无条件画；线上版只在 `debug=1` 才画 | 线上 API 文档 `debug` 字段说明 |
| 第二只眼被遮 | GitHub 快照 onnx 路径的 Haar 兜底必跑，且过滤条件把中心点当矩形传给 `centerInside` 得到 NaN，从不过滤，同一张脸被 Haar 再遮一次；线上版新增 `haarFallback`，省略时只在 YuNet 未检出人脸才启用 | 本机直跑 GitHub 快照 onnx 路径 `eyeCount=8`，线上默认参数 `eyeCount=1` |
| 身上的小白方块 | Haar 正脸级联 `minSize` 固定 30px，1122×1402 的图上把毛衣纹理、发丝当成 44–64px 的脸；`minNeighbors` 2 时误检 6 处 | 参数扫描：`minSize` 提到 60px 以上时只剩真脸（346,258,544×544） |

修正（`facePassHaarWorker.js`、`facePassGeometry.ts`、`facePassOptions.ts`、
`canvasToolCatalog.ts`）：

- 新增 `haarFallback` 参数，语义与线上版一致：默认 `auto` 只在 YuNet 一张脸都没检出时
  启用 Haar 兜底；`always` 总是启用并真正过滤掉已被 YuNet 覆盖的脸；`off` 关闭。
  表单新增对应下拉项。
- 删除橙色调试彩绘。
- Haar 人脸 `minSize` 改为短边的 6%，且不低于上游的 30px；`detectAllFaces` 三次
  调用共用该值。

本机用上游 opencv.js/YuNet 运行时执行修正后的 worker 几何与兜底判断：YuNet 检出
1 张脸，`auto`/`always` 下 Haar 额外脸均为 0，输出只遮右眼一个方块，与线上站默认
结果一致。Haar 检测器路径 `minSize=67` 只检出真脸 1 张。

验证：定向单元 24 通过；`pnpm --dir frontend test:unit` 2309 通过；
`pnpm --dir frontend typecheck` 通过；`pnpm --dir frontend test:architecture` 411 通过。
版本升级到 `1.1.83` 并推送标签 `v1.1.83` 触发三端构建。未做桌面安装包真机验收，需用户安装 1.1.83 后用同一张图复核。
