---
version: 1.1.80
attention: medium
---
# v1.1.80

## 人脸直过正式发布 / Face Pass release

- 本版本与 1.1.79 功能相同：1.1.79 的云端发布在上传安装包时中断，改以 1.1.80 重新构建并发布，所有用户可直接更新到本版本。
- 人脸直过工具、图片处理运行环境的变更说明见下方 1.1.79 条目；已安装旧抠图环境的用户需在“设置 > 环境依赖”重新安装一次。
- Functionally identical to 1.1.79, whose cloud publication was interrupted during upload; this build is republished as 1.1.80 so every client can update directly.
- See the 1.1.79 entry below for the Face Pass tool and image processing runtime changes; reinstall the runtime once under Settings > Dependencies.

# v1.1.79

## 画布新增人脸直过 / Face Pass on the canvas

- 图片节点工具栏新增“人脸直过”：在本地用 YuNet 检测人脸，再以白底黑边方块遮住眼睛，结果输出为新的下游节点，不经过云端。
- 支持 YuNet（默认）与 Haar 级联两种检测器，可调遮挡大小（1–10）、每张脸只遮一只眼、以及跳过人脸检测全图找眼。
- “图片抠图运行环境”升级为“图片处理运行环境”，新增 YuNet 与 Haar 模型及 OpenCV 运行时；已安装抠图环境的用户需在“设置 > 环境依赖”重新安装一次。
- The image node toolbar gains Face Pass: faces are detected locally with YuNet and eyes are masked with white squares, producing a new downstream node without any cloud call.
- Choose between YuNet (default) and Haar cascades, adjust mask size (1–10), mask one eye per face, or skip face detection and scan the whole image.
- The matting runtime is now the image processing runtime and adds the YuNet, Haar, and OpenCV assets; reinstall it once under Settings > Dependencies.

# v1.1.78

## 创作点显示统一 / Creation point display

- 余额、预计费用、预算上限和消费记录统一显示“创作点”，1 元＝10 创作点。
- 原积分数字统一缩小 100 倍，实际费用与购买力不变。例如 217.5 积分显示为 2.175 创作点，991,110 积分余额显示为 9,911.1 创作点。
- 优化金额格式异常的中文提示，保留报价、授权上限和请求的原始精确金额，避免重复换算。
- 更新后请完全退出并重新启动客户端，使顶栏余额与预算确认框同时使用新口径。
- Balance, quotes, budget limits, and usage records now use creation points: CNY 1 = 10 creation points.
- Displayed values are divided by 100 while charges, purchasing power, and exact billing authorization remain unchanged.
- Restart the complete application after updating so the balance badge and budget confirmation use the same unit.

# v1.1.77

## 租户任务调度策略同步 / Tenant task scheduling policy sync

- 登录业务租户后读取当前租户的桌面并发与队列策略，并严格校验字段、范围和版本，异常时保留上一份已确认配置。
- 本地 Python sidecar 按通用任务和视频任务分别应用并发、排队限制；策略热更新降低限制时不取消已经受理的任务，sidecar 重启后会重新下发。
- 策略同步使用独立的主进程通道，不把调度字段混入模型能力或计费合同；退出登录、租户切换和失效响应均会清理旧策略。
- Added tenant-scoped desktop concurrency and queue synchronization with strict validation and stale-policy rejection.
- The local sidecar applies separate general and video lanes, preserves accepted work while limits are lowered, and reapplies the last verified policy after restart.
- Scheduling data remains separate from model capability and billing contracts; failed reads retain the previous verified policy.

# v1.1.76

## 应用内预算确认 / In-app budget confirmation

- 云端消费确认改用现有 UI 框架的弹窗，不再弹出 Windows/macOS 原生消息框；跟随应用主题，倍率去除多余零位。
- 并行任务逐个展示报价；取消、关闭、报价过期、窗口重载、退出登录和进程中断不会默认确认消费。
- 冻结的报价和金额仍保留在主进程，界面只能确认或取消当前请求，不能改预算；同一请求重试不会重复授权或提高价格。
- 保留1.1.75完整的账户、退款冻结、积分和模型能力合同修复。本次不修改上游模型、售价、用户积分或商户配置。
- Cloud usage confirmation now uses the application's themed dialog instead of a native operating-system message box.
- Concurrent requests are confirmed individually. Dismissal, expiry, navigation, sign-out and renderer failure never authorize a charge.
- Main owns the immutable quote and budget; the renderer can only accept or cancel its current request. Existing points and capability fixes are retained.

## v1.1.75 保留启动修复

## 启动与积分合同修复 / Startup and points contract fix

- 修复界面层仍使用旧账户字段表、拒绝退款冻结字段导致无法进入的问题；账户与每个额度桶均校验当前完整字段。
- 云端响应、Electron、IPC、界面解析和查询缓存统一使用 `MICRO_POINT_V1`，冻结数量为零时也明确传递；不把缺失版本当作旧单位兼容。
- 保留服务端给出的可用积分，不在客户端重新计算或把冻结积分变成可消费余额。
- 增加从主进程输出到界面启动、余额刷新、失败重试的回归；三平台发布前执行这些检查。
- Fixed the renderer rejecting current refund-hold fields during application bootstrap.
- Aligned the current point asset version and account/bucket fields across Gateway, Electron, IPC and renderer caches.
- Preserve the server-authoritative spendable balance. Startup, refresh and retry checks now gate all three native builds.

## v1.1.74 模型能力修复

## 模型能力同步修复 / Model capability synchronization

- 修复云端计费元数据被误传给本地执行接口而导致的 HTTP 422，模型能力按双方声明的合同传递。
- 报价、预算、定价可用性仍由 Electron 代理校验；不放宽本地接口、软件许可或积分检查。
- 能力同步失败时保留上一份已确认的重启状态，并报告安全的字段位置，不输出密钥或请求正文。
- 安装时应整体更新并重启，不要混用不同版本的 Electron、前端和 Python 后端。
- Fix HTTP 422 caused by forwarding cloud billing metadata to the local execution router.
- Preserve quote and budget enforcement in Electron and strict schema validation in Python.
- Keep the last acknowledged restart snapshot on failure and report field paths without sensitive values.
- Install and restart the complete client; do not mix Electron, renderer and Python files from different builds.

## v1.1.73 保留修复 / Retained fixes

## 启动与余额修复 / Startup and balance fixes

- 对齐云端积分资产版本、账户和额度桶的退款冻结字段，修复启动时严格字段校验失败的问题。
- 启动资料读取异常与实际缺少软件许可分开提示，技术详情默认折叠，不再将接口合同错误误报为许可失效。
- Align quota asset versions and refund holds with the current Gateway response contract.
- Distinguish startup verification failures from missing licenses and keep technical details collapsed.

## 精细积分计费兼容 / Metered billing compatibility

- 云端模型在提交前显示当前请求的预估积分与最高授权预算，默认取消。
- 同一调用重试保留原报价和预算；取消、参数变化、过期或鉴权失败不会转投其他模型消费。
- 图片、视频和语音媒体报价绑定实际字节；文本、流式与嵌入使用同一套报价合同。
- 可变价目录不显示伪造单次价格；余额与调用记录按各自资产版本显示精确积分。
- 自定义与本地模型仍直接连接，不进入平台积分报价与扣费。
- Cloud requests require native confirmation of estimated and maximum point budgets before generation.
- Retries retain one approved quote; cancellation, changed inputs and expired quotes never fall back to another paid provider.
- Media quotes bind actual bytes. Variable model prices, balances and invocation history retain explicit billing versions.
- BYOK and local model calls remain direct and outside platform billing.

## v1.1.72 已有界面修复

## User-facing Highlights (zh)

- **弹窗与下拉菜单**：统一桌面客户端的弹窗、菜单、子菜单和提示层级，修复菜单被遮挡、选项无法点击以及预览层相互覆盖的问题。
- **生成参数面板**：视频、图像、运镜、打光、多角度和放大参数面板会避让窗口边缘；长面板可滚动，画布平移或缩放后继续跟随按钮。
- **桌面窗口控制**：弹窗打开时仍可使用窗口最小化、最大化和关闭按钮。
- **更新提示**：安装后重新启动客户端即可使用修复后的界面。

## User-facing Highlights (en)

- **Dialogs and menus**: Unify stacking for dialogs, menus, submenus and tooltips. Fix hidden menus, unclickable options and overlapping previews.
- **Generation settings**: Video, image, camera, lighting, angle and upscale panels stay within the window. Long panels scroll and follow their buttons when the canvas pans or zooms.
- **Window controls**: Minimize, maximize and close remain accessible while a dialog is open.
- **Update notice**: Restart the client after installation to use the updated interface.
