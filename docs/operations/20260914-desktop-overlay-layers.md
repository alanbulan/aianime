# 2026-09-14 桌面客户端弹层修复与构建发布记录

## 目标与环境

- 用户反馈视频高级参数下拉菜单被面板和其他界面遮挡，要求统一桌面客户端层级并按既有流程构建三平台安装包。
- 代码仓为 Gitee `mingcheng_software/ai-manga-desktop`，发布仓为 GitHub `alanbulan/aianime`；目标版本 `1.1.72`。
- 实施前重新拉取 Gitee 主分支，并读取 GitHub 主分支：两端均为 `fa2c0013ebf25309e3abce6c1950d391dcb6596a`，本地没有未提交改动。
- 云端发布目标仍为 `https://aianime.mingcw.com`，账户与签名使用既有 Actions Secrets。

## 原因与变更

- 原有界面混用局部绝对定位、直接挂载到页面根部的弹层，以及独立的 Base UI 定位容器。仅提高内部菜单的 `z-index` 无法脱离父级层叠上下文，也无法修复 `overflow` 裁切。
- 新增共享 `OverlayRoot`、`OverlayPortal`：公共弹窗、确认框、抽屉、下拉菜单、子菜单、提示、媒体预览、画布工具弹窗和更新界面使用同一套归属规则；共 60 个界面实现接入共享弹层。
- 子菜单的门户挂到所属弹层的独立容器，保留视口坐标定位，避免穿过后打开的同级弹窗。委托提示根据实际触发元素查找归属。弹层外空白区域不截获点击。
- 页面根部和画布建立层叠隔离；小地图控件与画布右键菜单使用具名层级。桌面标题栏独立保留窗口控制操作。
- 视频、图像、风格、运镜、生成数量、打光、多角度、擦除、扩图和放大参数面板复用实际尺寸测量：避让窗口及标题栏、自动选择上下方向、长内容滚动，并在画布平移、缩放时跟随触发器。
- 移除图像模型参数面板的内嵌定位分支，调用方统一使用共享门户；保留模型参数值、可选项与请求合同。
- 增加原生门户所有权门禁，原生 `createPortal` 仅保留共享弹层实现和页面插槽用途；更新原有静态所有权断言。浏览器测试统一加载生产样式；组件命令测试在浮层测量帧后执行断言。

## 验证记录

- `pnpm --dir frontend test`：通过，单元与架构 2283 项、组件 2116 项、Chromium 浏览器 35 项，共 4434 项。
- 标题栏避让调整后补跑 `pnpm --dir frontend test:browser`：35 项全部通过。
- 浏览器回归验证实际命中元素与选项点击，覆盖弹窗内两套选择器、子菜单、提示、嵌套确认、后打开同级弹窗的遮挡、窗口控制、长下拉列表，以及缩放且被裁切的画布中的 H3 `max` 操作。
- `pnpm --dir frontend typecheck`、`pnpm --dir frontend build:ce`：通过。构建保留既有的大分块提示，无构建错误。
- `pnpm --dir desktop typecheck`、`pnpm --dir desktop test`：通过，281 项通过、4 项既有平台相关跳过。
- `uv run --locked --default-index https://pypi.org/simple pytest tests/architecture/test_agent_guidance.py tests/modules/platform_release/test_release_notes.py -q`：4 项通过。
- `pnpm --dir desktop release:verify`：确认全部版本标记为 `1.1.72`。
- `actionlint .github/workflows/build-desktop.yml .github/workflows/publish-desktop.yml`、`git diff --check`：通过。

## 构建与发布步骤

1. 提交并同步 Gitee、GitHub 主分支，提交记录包含说明过用途的 `[skip ci]`，避免 Gitee 再次自动升版。
2. 只手动触发一次 `build-desktop.yml`，构建 Windows x64、macOS Intel、macOS Apple Silicon；新增的弹层浏览器回归纳入三平台构建前检查。
3. 沿用已修复的产物收集和换行规范化校验，三端全部成功后自动发布到当前服务器。
4. 工作流启动信息由后续实施记录补齐；不反复触发或重建同一版本。

## 影响、限制与回退

- 影响桌面客户端的公共弹层与画布交互，不调整 GPU 服务、模型能力、服务端合同或数据库。
- 本地验证使用 Linux 上的 Chromium；三平台打包与资源冒烟交由各自的原生 Actions Runner。本次没有宣称已经完成三台真实机器的干净安装、登录、生成或更新验收。
- 本记录中的构建触发不等于服务器发布完成；服务器切换版本由最终发布任务执行。正在使用的 `1.1.71` 在新版本发布前继续可用。
- 若后续仅发布步骤失败，使用 `publish-desktop.yml` 和本次构建运行编号复用成功的产物，避免重新构建。若发现界面回归，回退本次界面变更并发布更高补丁版本，不覆盖同版本已发布的安装包。
