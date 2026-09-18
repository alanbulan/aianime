---
version: 1.1.74
attention: medium
---
# v1.1.74

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
