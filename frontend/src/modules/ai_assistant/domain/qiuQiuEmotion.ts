// Copyright (c) 2026 AI anime
import type { ChatMessage } from "@/modules/ai_assistant/domain/contracts";
import {
  isAssistantCompletionNotice,
  isAssistantErrorReply,
  isToolMessage,
} from "@/modules/ai_assistant/domain/messagePresentationRules";

export const QIUQIU_EMOTIONS = {
  "00": { name: "睡眠", group: "life" },
  "01": { name: "唤醒", group: "life" },
  "02": { name: "待机放空", group: "life" },
  "03": { name: "好奇", group: "life" },
  "04": { name: "发呆", group: "life" },
  "05": { name: "加载苏醒", group: "life" },
  "06": { name: "休眠", group: "life" },
  "07": { name: "抖动唤醒", group: "life" },
  "10": { name: "开心", group: "emotion" },
  "11": { name: "疑惑", group: "emotion" },
  "12": { name: "失落", group: "emotion" },
  "13": { name: "惊讶", group: "emotion" },
  "14": { name: "害羞", group: "emotion" },
  "15": { name: "疲惫", group: "emotion" },
  "16": { name: "专注", group: "emotion" },
  "17": { name: "慌张", group: "emotion" },
  "18": { name: "无奈", group: "emotion" },
  "19": { name: "满意", group: "emotion" },
  "20": { name: "困惑", group: "emotion" },
  "21": { name: "生气", group: "emotion" },
  "30": { name: "思考中", group: "agent" },
  "31": { name: "接收任务", group: "agent" },
  "32": { name: "处理中忙碌", group: "agent" },
  "33": { name: "任务完成", group: "agent" },
  "34": { name: "出错", group: "agent" },
  "35": { name: "等待输入", group: "agent" },
  "36": { name: "联网加载", group: "agent" },
  "37": { name: "复述回忆", group: "agent" },
  "38": { name: "拒绝/受限", group: "agent" },
  "39": { name: "输出回复", group: "agent" },
  "40": { name: "检索资料", group: "agent" },
  "41": { name: "停止终止", group: "agent" },
} as const;

export type QiuQiuEmotionId = keyof typeof QIUQIU_EMOTIONS;

const STOP_PATTERN = /(?:^|[_\s./-])(abort|cancel|kill|stop|terminate)(?:$|[_\s./-])|取消|停止|终止/iu;
const RESTRICTED_PATTERN = /denied|forbidden|permission|policy|quota|refus|restricted|unauthorized|禁止|拒绝|受限|权限|未授权|额度|配额/iu;
const WAITING_INPUT_PATTERN = /approval|confirm|prompt|request[_\s-]?user|user[_\s-]?input|等待.{0,4}(?:输入|确认|选择)|审批|确认|用户输入/iu;
const RECEIVE_PATTERN = /(?:^|[_\s./-])(create|dispatch|enqueue|patch|post|put|schedule|send|start|submit)(?:$|[_\s./-])|创建|派发|排队|提交|启动|下发/iu;
const RECALL_PATTERN = /(?:^|[_\s./-])(cache|context|conversation|history|memory|recall|restore|resume|session|thread)(?:$|[_\s./-])|会话|回忆|恢复上下文|历史|记忆/iu;
const RETRIEVAL_PATTERN = /(?:^|[_\s./-])(find|get|glob|grep|inspect|list|lookup|query|read|resolve|retrieve|scan|search)(?:$|[_\s./-])|获取|检索|读取|扫描|搜索|查询|查找|列出/iu;
const NETWORK_PATTERN = /(?:^|[_\s./-])(api|browser|cloud|download|fetch|http|network|remote|upload|url|web)(?:$|[_\s./-])|联网|浏览器|网络|下载|远程|上传/iu;
const THINKING_PATTERN = /(?:^|[_\s./-])(analy[sz]e|plan|reason|think)(?:$|[_\s./-])|分析|规划|思考|推理/iu;
const FOCUS_PATTERN = /(?:^|[_\s./-])(build|check|compile|lint|test|typecheck|validate|verify)(?:$|[_\s./-])|测试|检查|构建|验证/iu;

function valueText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toolSearchText(message: ChatMessage): string {
  return [
    message.toolName,
    message.text,
    valueText(message.toolInput),
    valueText(message.toolOutput),
    valueText(message.toolError),
  ].filter(Boolean).join(" ");
}

function resolveToolEmotion(message: ChatMessage): QiuQiuEmotionId {
  const text = toolSearchText(message);
  const state = message.toolState ?? "success";

  if (state === "error") return RESTRICTED_PATTERN.test(text) ? "38" : "34";
  if (state === "pending") return "15";
  if (state === "success") {
    if (STOP_PATTERN.test(text)) return "41";
    if (RESTRICTED_PATTERN.test(text)) return "38";
    if (WAITING_INPUT_PATTERN.test(text)) return "35";
    return "33";
  }

  if (STOP_PATTERN.test(text)) return "41";
  if (WAITING_INPUT_PATTERN.test(text)) return "35";
  if (RECEIVE_PATTERN.test(text)) return "31";
  if (RECALL_PATTERN.test(text)) return "37";
  if (RETRIEVAL_PATTERN.test(text)) return "40";
  if (NETWORK_PATTERN.test(text)) return "36";
  if (THINKING_PATTERN.test(text)) return "30";
  if (FOCUS_PATTERN.test(text)) return "16";
  return "32";
}

const ASSISTANT_RULES: ReadonlyArray<readonly [RegExp, QiuQiuEmotionId]> = [
  [/出错|错误|失败|异常/iu, "34"],
  [/睡眠|睡着|晚安|闭眼/iu, "00"],
  [/休眠|休息|暂停待命/iu, "06"],
  [/重试|恢复连接|重新连接|抖动唤醒/iu, "07"],
  [/唤醒|醒来|已经启动|已启动/iu, "01"],
  [/初始化|加载苏醒|正在启动|载入中|加载中/iu, "05"],
  [/收到|已接收|开始处理|交给我/iu, "31"],
  [/正在处理|处理中|正在执行|正在生成|忙碌/iu, "32"],
  [/正在联网|连接网络|请求网络|打开网页/iu, "36"],
  [/回忆|历史记录|根据上下文|此前对话/iu, "37"],
  [/检索|搜索|查找|查询资料|读取文件/iu, "40"],
  [/思考|推理|分析中|规划中/iu, "30"],
  [/完成|成功|已生成|已保存|已更新/iu, "33"],
  [/满意|符合预期|结果稳定/iu, "19"],
  [/开心|高兴|太好了|庆祝/iu, "10"],
  [/不好意思|害羞/iu, "14"],
  [/惊讶|没想到|出乎意料/iu, "13"],
  [/生气|愤怒|恼火/iu, "21"],
  [/慌张|着急|惊慌/iu, "17"],
  [/疲惫|累了|耗时很久/iu, "15"],
  [/失落|遗憾|难过/iu, "12"],
  [/无奈|没办法|只能这样/iu, "18"],
  [/困惑|不清楚|存在歧义|互相矛盾/iu, "20"],
  [/疑惑|不确定|有疑问/iu, "11"],
  [/好奇|想了解|看看是什么/iu, "03"],
  [/专注|仔细检查|认真处理/iu, "16"],
  [/发呆|放空/iu, "04"],
];

export function resolveQiuQiuEmotion(
  message: ChatMessage,
  streaming = false,
): QiuQiuEmotionId {
  if (isToolMessage(message)) return resolveToolEmotion(message);
  if (streaming) return "39";
  if (isAssistantErrorReply(message)) return "34";
  if (isAssistantCompletionNotice(message)) return "33";

  const text = message.text.trim();
  if (!text) return "04";
  if (STOP_PATTERN.test(text)) return "41";
  if (RESTRICTED_PATTERN.test(text)) return "38";
  if (/[?？]\s*$/u.test(text) || /请.{0,8}(?:提供|确认|选择|输入|上传)|需要你|等待.{0,4}(?:输入|确认|选择)/u.test(text)) {
    return "35";
  }

  for (const [pattern, emotionId] of ASSISTANT_RULES) {
    if (pattern.test(text)) return emotionId;
  }
  return "02";
}

export function qiuQiuEmotionName(emotionId: QiuQiuEmotionId): string {
  return QIUQIU_EMOTIONS[emotionId].name;
}
