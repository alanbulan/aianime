# 1.1.75：当前积分合同与完整启动链修复

## 故障与复现

用户截图显示 `commercial quota account fields must be exactly ...`，
已发布1.1.74的Renderer代码可以稳定复现该错误，不能从截图推断用户的实际安装版本。
本轮先使用当前云端字段构造响应，再执行 `projectCommercialQuota`、结构化克隆
模拟IPC和Renderer实际 `parseCommercialQuota`。修复前稳定得到与截图逐字相同的
异常，包括零余额、无额度桶用户，说明不是用户缺少许可或模型不兼容。

根因：Electron已在账户和额度桶快照里发出 `refundFrozenUnits`，Renderer仍按
旧字段表验证。此前检查只覆盖TypeScript声明中的字段，没有验证主进程输出能否
被界面真正解析。1.1.74的Electron/Python能力修复和原生打包成功不能证明这条链通过。

## 当前统一合同

- 只接受明确的 `MICRO_POINT_V1` 资产版本。账户、每个额度桶都必须包含
  `refundFrozenUnits`，数值为零也明确传递，不以缺失字段兼容旧余额。
- Cloud `.api`、Electron快照、preload类型、Renderer解析器和查询缓存同步更新。
  冻结数量与其他积分金额均为安全非负整数，缺字段、未知字段、负数、浮点数、
  非有限数值和错误类型继续拒绝；不会通过忽略额外字段绕开错误。
- `spendableUnits` 由云端确定，客户端保留原值，不能把预占或退款冻结加回可消费余额。
  余额徽标只按当前积分版本格式化，不再把无版本的存储整数当作显示积分。
- 报价和预算元数据仍留在Electron；Python只接收现有执行能力。这一轮保留并重新
  验证1.1.74的能力投影，不降低许可、租户隔离、预算确认和扣费约束。

## 回归与发布门禁

新增跨进程回归覆盖主进程正式投影到Renderer、账户和非空额度桶、零余额和空桶，
以及缺失/非法冻结字段。应用级测试覆盖真实 `ensureCommercialBootstrap` 初始化
身份、模型、余额和版本查询缓存，错误后的再次核验，以及启动成功后的余额刷新。

实际云端联调使用已有租户14、管理账号17和已存在的个人账户18，只读取已授权
目录和个人余额。读取前确认账户已存在，不初始化用户、不产生模型任务、不充值或扣款。
数据通过正式Gateway投影、Electron、IPC、Renderer和Python schema；实际模型/余额
快照只保存在工作机 `/tmp`，不提交用户数据或认证材料。

`.github/workflows/build-desktop.yml` 增加 `Verify current quota and renderer startup contract`。
三个原生构建都需先通过该项，再构建、签名、上传和统一发布。最终验收同时检查该步骤、
源码SHA、版本、三平台制品及云端更新合同，而不是只看Actions总状态。

## 影响与交付边界

不修改现存余额、充值、商户设置、价格、倍率、许可或本地创作数据，不清库、不引入旧
单位转换。服务端此前已发送这些字段，本次接口声明补齐必需性，实际业务金额不变。

1.1.75必须完整构建并安装，旧1.1.74不能通过刷新或重新核验获得Renderer代码修复。
回归结果、提交、Actions与实际发布回执在完成后追加；本文件本身不代表安装包已发布，
CI和服务器验证也不等同于已经在用户个人设备完成登录。

## 本轮实际验证（发布前）

2026-09-18重新读取当前运行服务的公开模型与既有个人余额，再经过正式Gateway投影、
Electron投影、结构化克隆、Renderer实际解析和Python真实能力接口。12个模型及当前
余额通过，未激活设备、未发起生成、未扣积分。Renderer应用级测试同时验证初始化、
故障后重试、余额刷新和查询缓存，不能只凭类型声明或原生打包成功判断启动可用。

- `pnpm --dir frontend test`：纯逻辑2288项通过，组件2125项通过、1项现场资料条件跳过，
  浏览器35项通过。现场资料条件项随后使用实际只读快照运行，启动及余额组件15项通过。
- `pnpm --dir desktop typecheck`、`pnpm --dir frontend typecheck`：通过。
- `pnpm --dir desktop test`：301项通过、5项明确跳过（4项宿主条件及独立目录证据测试）；
  本轮实际云端完整启动合同测试已运行，并非跳过。
- `pnpm --dir desktop build`、`release:verify`：通过；CE前端和主进程完整重建为1.1.75。
  构建仍有既有大块JavaScript体积警告，没有将警告隐藏或声称无告警。
- `uv run --locked pytest tests/test_sidecar_capability_contract.py tests/test_model_gateway_settings.py tests/architecture -q`：228项通过。

执行日志使用 `/tmp/aianime-quota-final-*`，只读真实数据快照不提交仓库。
安装包需要新的1.1.75三平台Actions运行完成后才能视为已发布；1.1.74的既有运行成功
只证明旧制品发布完成，不证明当前Renderer账户合同修复已经包含在其中。
