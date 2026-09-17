// Copyright (c) 2026 AI anime

import { createHash } from "node:crypto";
import { CommercialApiError } from "./commercial-api-error.js";
import type { PreparedBody } from "./commercial-model-route.js";

export const METERED_BILLING_VERSION = "METERED_V2";
const MAX_MICRO_POINTS = BigInt("9000000000000000");
const ENVELOPE_FIELDS = ["billing_quote_id", "billing_version", "client_version", "max_cost_micro_points"] as const;

export class CommercialBudgetError extends CommercialApiError {
  constructor(message: string) {
    super(message, { status: 409, code: "BILLING_AUTHORIZATION_REQUIRED" });
    this.name = "CommercialBudgetError";
  }
}

export interface CommercialMeteredQuote {
  id: string;
  billingVersion: "METERED_V2";
  modelCode: string;
  publicModelName: string;
  policyId: string;
  policyVersion: number;
  estimatedMicroPoints: string;
  maximumMicroPoints: string;
  tenantMultiplier: string;
  expiresAt: string;
  requestHash: string;
  status: string;
  estimateOnly: boolean;
}

export function exactMicroPoints(value: unknown): string {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,15})$/u.test(value) || BigInt(value) > MAX_MICRO_POINTS) {
    throw new CommercialApiError("计费金额必须是范围内的精确微积分字符串", { status: 422 });
  }
  return value;
}

export function formatMicroPoints(value: string): string {
  const integer = BigInt(exactMicroPoints(value));
  const whole = integer / BigInt(1000000);
  const fraction = (integer % BigInt(1000000)).toString().padStart(6, "0").replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function parseMeteredQuote(value: unknown, model: string, now = Date.now()): CommercialMeteredQuote {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CommercialApiError("服务端报价格式无效");
  const quote = value as Record<string, unknown>;
  if (typeof quote.id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u.test(quote.id)
    || quote.billingVersion !== METERED_BILLING_VERSION || quote.modelCode !== model
    || typeof quote.policyId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u.test(quote.policyId)
    || !Number.isSafeInteger(quote.policyVersion) || Number(quote.policyVersion) < 1
    || typeof quote.publicModelName !== "string" || typeof quote.expiresAt !== "string"
    || !Number.isFinite(Date.parse(quote.expiresAt)) || Date.parse(quote.expiresAt) <= now
    || typeof quote.requestHash !== "string" || !/^[0-9a-f]{64}$/u.test(quote.requestHash)
    || typeof quote.tenantMultiplier !== "string" || !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/u.test(quote.tenantMultiplier)
    || quote.status !== "QUOTED" || typeof quote.estimateOnly !== "boolean") {
    throw new CommercialApiError("报价已过期、不可执行或与当前模型不一致，请重新确认", { status: 409 });
  }
  const estimated = exactMicroPoints(quote.estimatedMicroPoints);
  const maximum = exactMicroPoints(quote.maximumMicroPoints);
  if (BigInt(estimated) > BigInt(maximum)) throw new CommercialApiError("报价上界低于预计费用", { status: 409 });
  return { id: quote.id, billingVersion: METERED_BILLING_VERSION, modelCode: model,
    policyId: quote.policyId, policyVersion: Number(quote.policyVersion),
    publicModelName: quote.publicModelName, estimatedMicroPoints: estimated, maximumMicroPoints: maximum,
    tenantMultiplier: quote.tenantMultiplier, expiresAt: quote.expiresAt, requestHash: quote.requestHash,
    status: quote.status, estimateOnly: quote.estimateOnly };
}

export function modelQuoteKind(path: string): string | null {
  const url = new URL(path, "http://model-proxy.local");
  if (url.origin !== "http://model-proxy.local") return null;
  const kinds: Record<string, string> = {
    "/v1/chat/completions": "chat", "/v1/completions": "completion", "/v1/responses": "responses",
    "/v1/responses/compact": "compact", "/v1/embeddings": "embedding", "/v1/messages": "messages",
    "/v1/images/generations": "image", "/v1/images/edits": "image-edit", "/v1/videos": "video",
    "/v1/audio/speech": "speech", "/v1/audio/music/generations": "music",
  };
  const knownKind = kinds[url.pathname];
  if (knownKind !== undefined) return knownKind;
  if (videoRemixQuoteOrigin(path) !== null) return "video-remix";
  const action = /^\/v1(?:beta)?\/models\/[^/:]+:(generateContent|streamGenerateContent|embedContent|batchEmbedContents)$/u.exec(url.pathname)?.[1];
  return action ? ({ generateContent: "gemini-generate", streamGenerateContent: "gemini-stream", embedContent: "gemini-embed", batchEmbedContents: "gemini-batch-embed" }[action] ?? null) : null;
}

export function videoRemixQuoteOrigin(path: string): string | null {
  const url = new URL(path,"http://model-proxy.local");
  if (url.search || url.hash) return null;
  return /^\/v1\/videos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/remix$/u.exec(url.pathname)?.[1] ?? null;
}

function rawBytes(body: BodyInit | undefined): Uint8Array {
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  throw new CommercialApiError("此模型请求不能安全绑定消费报价", { status: 422 });
}

export async function billingRequestFingerprint(model: string, path: string, prepared: PreparedBody): Promise<string> {
  const hash = createHash("sha256");
  hash.update(JSON.stringify([model, path, prepared.contentType?.split(";")[0] ?? ""]));
  if (prepared.body instanceof FormData) {
    for (const [name, value] of prepared.body.entries()) {
      if (ENVELOPE_FIELDS.some((field) => field === name)) throw new CommercialApiError("客户端不能自行填写计费凭证", { status: 422 });
      if (typeof value === "string") hash.update(JSON.stringify([name, value]));
      else { hash.update(JSON.stringify([name, value.type, value.size])); hash.update(new Uint8Array(await value.arrayBuffer())); }
    }
  } else hash.update(rawBytes(prepared.body));
  return hash.digest("hex");
}

export function attachBillingQuote(prepared: PreparedBody, quote: CommercialMeteredQuote, version: string): PreparedBody {
  const envelope = { billing_quote_id: quote.id, billing_version: METERED_BILLING_VERSION,
    client_version: version, max_cost_micro_points: exactMicroPoints(quote.maximumMicroPoints) };
  if (prepared.body instanceof FormData) {
    const body = new FormData();
    for (const [key, value] of prepared.body.entries()) {
      if (key in envelope) throw new CommercialApiError("不能覆盖已有计费凭证", { status: 422 });
      body.append(key, value);
    }
    for (const [key, value] of Object.entries(envelope)) body.set(key, value);
    return { body };
  }
  let value: unknown;
  try { value = JSON.parse(Buffer.from(rawBytes(prepared.body)).toString("utf8")); }
  catch { throw new CommercialApiError("计费请求必须是 JSON 对象", { status: 422 }); }
  if (!value || typeof value !== "object" || Array.isArray(value) || ENVELOPE_FIELDS.some((key) => key in value)) {
    throw new CommercialApiError("计费请求无效或含有客户端填写的计费凭证", { status: 422 });
  }
  return { body: JSON.stringify({ ...value, ...envelope }), contentType: "application/json" };
}

type Confirmation = (quote: CommercialMeteredQuote, signal: AbortSignal) => Promise<boolean>;

// One customer intent keeps one accepted budget across retries. An expired,
// rejected or changed intent never silently becomes a newly priced generation.
export class MeteredBudgetAuthorizer {
  private readonly intents = new Map<string, { fingerprint: string; quote: Promise<CommercialMeteredQuote> }>();
  constructor(private readonly confirm: Confirmation, private readonly now: () => number = Date.now) {}
  clear(): void { this.intents.clear(); }
  async authorize(key: string, model: string, path: string, prepared: PreparedBody, version: string,
    request: () => Promise<CommercialMeteredQuote>, signal: AbortSignal): Promise<PreparedBody> {
    signal.throwIfAborted();
    const fingerprint = await billingRequestFingerprint(model, path, prepared);
    let entry = this.intents.get(key);
    if (entry && entry.fingerprint !== fingerprint) throw new CommercialApiError("原调用的参数已改变，不能重用原消费确认", { status: 409 });
    if (!entry) {
      if (this.intents.size >= 1000) throw new CommercialApiError("本会话消费确认记录已满，请结束当前任务后重新登录", { status: 429 });
      const quote = Promise.resolve().then(async () => {
        const value = parseMeteredQuote(await request(), model, this.now());
        signal.throwIfAborted();
        if (!await this.confirm(value, signal)) throw new CommercialApiError("已取消消费确认，没有提交模型生成", { status: 403 });
        signal.throwIfAborted();
        if (Date.parse(value.expiresAt) <= this.now()) throw new CommercialApiError("确认期间报价已过期，没有提交模型生成", { status: 409 });
        return value;
      });
      entry = { fingerprint, quote };
      this.intents.set(key, entry);
    }
    const quote = await entry.quote;
    signal.throwIfAborted();
    if (Date.parse(quote.expiresAt) <= this.now()) throw new CommercialApiError("原报价已过期，请先查询原任务，不能自动重新计价生成", { status: 409 });
    return attachBillingQuote(prepared, quote, version);
  }
}
