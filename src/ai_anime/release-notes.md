---
version: 1.1.61
attention: high
---
# v1.1.61

## User-facing Highlights (zh)

- **云端声线设计恢复**: Desktop 已识别并显式请求 `AUDIO_VOICE_DESIGN`，不会再从完整模型目录中过滤该 operation。
- **文字生成声线**: 解说声线与角色声线弹窗均可填写音色描述、试听文本和语言，参数上限与默认值直接来自云端模型 schema。
- **年龄段与身份绑定**: 新声线生成后会加入账号声线库，并直接绑定到当前年龄段或身份；实际合成继续按“身份专属 → 年龄段 → 角色默认”解析。
- **模型路由契约**: 客户端内部保留 `cloud:<code>` 选择器，发送到 Gateway 前转换为原始 model code，并透传 `X-Voice-Id`。
- **模型能力一致性**: 模型界面按 operation 与服务端 schema 展示能力和参数，不再根据模型名称推断，避免同一模型仅因命名不同出现两套面板。
- **版本同步**: Python 包、Electron 安装器、前端版本兜底、依赖锁文件和 README 已统一更新为 1.1.61。

## User-facing Highlights (en)

- **Cloud voice design restored**: Desktop recognizes and explicitly requests `AUDIO_VOICE_DESIGN` instead of filtering it out of the complete catalog.
- **Text-designed voices**: Narrator and character voice dialogs accept a voice description, preview text, and language. Limits and defaults come from the cloud model schema.
- **Age and identity binding**: A generated voice is added to the account library and immediately bound to the selected age slot or identity. Resolution remains identity, age, then character default.
- **Model routing contract**: Desktop keeps the local `cloud:<code>` selector, sends the raw model code to the Gateway, and forwards `X-Voice-Id`.
- **Consistent model capabilities**: Model controls are derived from operation and server schema rather than display names, so aliases no longer produce different parameter panels.
- **Version synchronization**: Python, Electron, frontend fallback, dependency lock, and README versions are synchronized to 1.1.61.
