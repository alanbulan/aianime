// Copyright (c) 2026 AI anime

import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

import {
  CommercialApiError,
  isModelWriteMethod,
} from "./commercial-api-client.js";
import type { ModelRoute, PreparedBody } from "./commercial-model-route.js";
import { createRequiredRecord } from "./value-validation.js";

export async function requestByok(
  route: ModelRoute,
  input: {
    method: string;
    path: string;
    requestHeaders: IncomingMessage["headers"];
    signal: AbortSignal;
  },
  prepared: PreparedBody,
): Promise<Response> {
  if (!route.baseUrl) throw new CommercialApiError("BYOK Base URL 缺失");
  if (route.protocol === "ANTHROPIC") {
    return requestAnthropic(route, input, prepared);
  }
  if (route.protocol === "GEMINI") {
    return requestGemini(route, input, prepared);
  }
  const localUrl = new URL(input.path, "http://model-proxy.local");
  const relativePath = localUrl.pathname.replace(/^\/v1(?=\/|$)/, "") || "/";
  const upstreamUrl = new URL(`${route.baseUrl}${relativePath}`);
  upstreamUrl.search = localUrl.search;
  const headers = forwardedHeaders(input.requestHeaders, prepared.contentType);
  if (route.apiKey) headers.set("Authorization", `Bearer ${route.apiKey}`);
  if (isModelWriteMethod(input.method) && !headers.has("Idempotency-Key")) {
    headers.set("Idempotency-Key", randomUUID());
  }
  try {
    return await fetch(upstreamUrl, {
      method: input.method,
      headers,
      ...(prepared.body === undefined ? {} : { body: prepared.body }),
      signal: input.signal,
    });
  } catch (error) {
    throw new CommercialApiError(
      `${route.label} 请求失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function requestAnthropic(
  route: ModelRoute,
  input: {
    method: string;
    path: string;
    requestHeaders: IncomingMessage["headers"];
    signal: AbortSignal;
  },
  prepared: PreparedBody,
): Promise<Response> {
  if (!route.baseUrl) throw new CommercialApiError("Anthropic Base URL 缺失");
  const localUrl = new URL(input.path, "http://model-proxy.local");
  if (input.method !== "POST" || !localUrl.pathname.endsWith("/chat/completions")) {
    throw new CommercialApiError("Anthropic 原生协议仅支持文本对话", { status: 400 });
  }
  const payload = preparedJsonObject(prepared);
  const stream = payload.stream === true;
  const upstreamPayload = {
    ...openAiToAnthropicPayload(payload, route.modelId),
    ...(stream ? { stream: true } : {}),
  };
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
    "Anthropic-Version": "2023-06-01",
  });
  const beta = input.requestHeaders["anthropic-beta"];
  if (beta) headers.set("Anthropic-Beta", String(beta));
  if (route.apiKey) headers.set("X-Api-Key", route.apiKey);
  const response = await fetchByokUpstream(
    route,
    new URL("messages", `${route.baseUrl}/`),
    {
      method: "POST",
      headers,
      body: JSON.stringify(upstreamPayload),
      signal: input.signal,
    },
  );
  if (!response.ok) return response;
  return stream
    ? anthropicStreamToOpenAiResponse(response, route.modelId)
    : anthropicToOpenAiResponse(response, route.modelId);
}

async function requestGemini(
  route: ModelRoute,
  input: {
    method: string;
    path: string;
    requestHeaders: IncomingMessage["headers"];
    signal: AbortSignal;
  },
  prepared: PreparedBody,
): Promise<Response> {
  if (!route.baseUrl) throw new CommercialApiError("Gemini Base URL 缺失");
  const localUrl = new URL(input.path, "http://model-proxy.local");
  if (input.method !== "POST" || !localUrl.pathname.endsWith("/chat/completions")) {
    throw new CommercialApiError("Gemini 原生协议仅支持文本对话", { status: 400 });
  }
  const payload = preparedJsonObject(prepared);
  const stream = payload.stream === true;
  const upstreamPayload = openAiToGeminiPayload(payload);
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  if (route.apiKey) headers.set("X-Goog-Api-Key", route.apiKey);
  const modelPath = route.modelId
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const action = stream ? "streamGenerateContent" : "generateContent";
  const upstreamUrl = new URL(`models/${modelPath}:${action}`, `${route.baseUrl}/`);
  if (stream) upstreamUrl.searchParams.set("alt", "sse");
  const response = await fetchByokUpstream(
    route,
    upstreamUrl,
    {
      method: "POST",
      headers,
      body: JSON.stringify(upstreamPayload),
      signal: input.signal,
    },
  );
  if (!response.ok) return response;
  return stream
    ? geminiStreamToOpenAiResponse(response, route.modelId)
    : geminiToOpenAiResponse(response, route.modelId);
}

async function fetchByokUpstream(
  route: ModelRoute,
  url: URL,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    throw new CommercialApiError(
      `${route.label} 请求失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function preparedJsonObject(prepared: PreparedBody): Record<string, unknown> {
  if (typeof prepared.body !== "string") {
    throw new CommercialApiError("原生模型协议要求 JSON 请求体", { status: 400 });
  }
  const payload = JSON.parse(prepared.body) as unknown;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new CommercialApiError("原生模型协议请求体必须是对象", { status: 400 });
  }
  return payload as Record<string, unknown>;
}

function openAiToAnthropicPayload(
  payload: Record<string, unknown>,
  modelId: string,
): Record<string, unknown> {
  const rawMessages = Array.isArray(payload.messages) ? payload.messages : [];
  const system: string[] = [];
  const messages: Array<Record<string, unknown>> = [];
  for (const value of rawMessages) {
    const message = objectValue(value, "OpenAI message");
    const role = String(message.role ?? "").trim();
    if (role === "system" || role === "developer") {
      const text = textContent(message.content);
      if (text) system.push(text);
      continue;
    }
    if (role === "tool") {
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: String(message.tool_call_id ?? ""),
            content: textContent(message.content),
          },
        ],
      });
      continue;
    }
    if (role !== "user" && role !== "assistant") continue;
    const content = anthropicContent(message.content);
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    for (const callValue of toolCalls) {
      const call = objectValue(callValue, "OpenAI tool call");
      const fn = objectValue(call.function, "OpenAI tool function");
      content.push({
        type: "tool_use",
        id: String(call.id ?? randomUUID()),
        name: String(fn.name ?? ""),
        input: parseJsonArguments(fn.arguments),
      });
    }
    messages.push({ role, content });
  }
  const result: Record<string, unknown> = {
    model: modelId,
    max_tokens: positiveNumberOrFallback(
      payload.max_tokens ?? payload.max_completion_tokens,
      4096,
    ),
    messages,
  };
  if (system.length > 0) result.system = system.join("\n\n");
  if (typeof payload.temperature === "number") result.temperature = payload.temperature;
  if (typeof payload.top_p === "number") result.top_p = payload.top_p;
  if (typeof payload.stop === "string") result.stop_sequences = [payload.stop];
  if (Array.isArray(payload.stop)) result.stop_sequences = payload.stop;
  if (Array.isArray(payload.tools)) {
    result.tools = payload.tools.map((value) => {
      const tool = objectValue(value, "OpenAI tool");
      const fn = objectValue(tool.function, "OpenAI tool function");
      return {
        name: String(fn.name ?? ""),
        ...(fn.description ? { description: String(fn.description) } : {}),
        input_schema: fn.parameters ?? { type: "object", properties: {} },
      };
    });
  }
  return result;
}

function openAiToGeminiPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const rawMessages = Array.isArray(payload.messages) ? payload.messages : [];
  const system: string[] = [];
  const contents: Array<Record<string, unknown>> = [];
  const toolNames = new Map<string, string>();
  for (const value of rawMessages) {
    const message = objectValue(value, "OpenAI message");
    const role = String(message.role ?? "").trim();
    if (role === "system" || role === "developer") {
      const text = textContent(message.content);
      if (text) system.push(text);
      continue;
    }
    if (role === "tool") {
      const callId = String(message.tool_call_id ?? "");
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: toolNames.get(callId) ?? (callId || "tool"),
              response: { result: textContent(message.content) },
            },
          },
        ],
      });
      continue;
    }
    if (role !== "user" && role !== "assistant") continue;
    const parts = geminiParts(message.content);
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    for (const callValue of toolCalls) {
      const call = objectValue(callValue, "OpenAI tool call");
      const fn = objectValue(call.function, "OpenAI tool function");
      toolNames.set(String(call.id ?? ""), String(fn.name ?? ""));
      parts.push({
        functionCall: {
          name: String(fn.name ?? ""),
          args: parseJsonArguments(fn.arguments),
        },
      });
    }
    contents.push({ role: role === "assistant" ? "model" : "user", parts });
  }
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: positiveNumberOrFallback(
      payload.max_tokens ?? payload.max_completion_tokens,
      4096,
    ),
  };
  if (typeof payload.temperature === "number") {
    generationConfig.temperature = payload.temperature;
  }
  if (typeof payload.top_p === "number") generationConfig.topP = payload.top_p;
  if (typeof payload.stop === "string") generationConfig.stopSequences = [payload.stop];
  if (Array.isArray(payload.stop)) generationConfig.stopSequences = payload.stop;
  const responseFormat = payload.response_format;
  if (
    responseFormat &&
    typeof responseFormat === "object" &&
    !Array.isArray(responseFormat) &&
    (responseFormat as Record<string, unknown>).type === "json_object"
  ) {
    generationConfig.responseMimeType = "application/json";
  }
  const result: Record<string, unknown> = { contents, generationConfig };
  if (system.length > 0) {
    result.systemInstruction = { parts: [{ text: system.join("\n\n") }] };
  }
  if (Array.isArray(payload.tools)) {
    result.tools = [
      {
        functionDeclarations: payload.tools.map((value) => {
          const tool = objectValue(value, "OpenAI tool");
          const fn = objectValue(tool.function, "OpenAI tool function");
          return {
            name: String(fn.name ?? ""),
            ...(fn.description ? { description: String(fn.description) } : {}),
            parameters: fn.parameters ?? { type: "object", properties: {} },
          };
        }),
      },
    ];
  }
  return result;
}

function anthropicContent(value: unknown): Array<Record<string, unknown>> {
  if (typeof value === "string") return [{ type: "text", text: value }];
  if (!Array.isArray(value)) return [];
  return value.flatMap<Record<string, unknown>>((partValue) => {
    const part = objectValue(partValue, "OpenAI content part");
    if (part.type === "text") return [{ type: "text", text: String(part.text ?? "") }];
    if (part.type !== "image_url") return [];
    const image = objectValue(part.image_url, "OpenAI image URL");
    const url = String(image.url ?? "");
    const data = /^data:([^;,]+);base64,(.+)$/s.exec(url);
    return [
      {
        type: "image",
        source: data
          ? { type: "base64", media_type: data[1], data: data[2] }
          : { type: "url", url },
      },
    ];
  });
}

function geminiParts(value: unknown): Array<Record<string, unknown>> {
  if (typeof value === "string") return [{ text: value }];
  if (!Array.isArray(value)) return [];
  return value.flatMap<Record<string, unknown>>((partValue) => {
    const part = objectValue(partValue, "OpenAI content part");
    if (part.type === "text") return [{ text: String(part.text ?? "") }];
    if (part.type !== "image_url") return [];
    const image = objectValue(part.image_url, "OpenAI image URL");
    const url = String(image.url ?? "");
    const data = /^data:([^;,]+);base64,(.+)$/s.exec(url);
    if (!data) {
      throw new CommercialApiError("Gemini 原生协议的图片输入必须是 data URL", {
        status: 400,
      });
    }
    return [{ inlineData: { mimeType: data[1], data: data[2] } }];
  });
}

async function anthropicToOpenAiResponse(
  response: Response,
  modelId: string,
): Promise<Response> {
  const payload = objectValue(await response.json(), "Anthropic response");
  const blocks = Array.isArray(payload.content) ? payload.content : [];
  const text = blocks
    .map((value) => objectValue(value, "Anthropic content block"))
    .filter((value) => value.type === "text")
    .map((value) => String(value.text ?? ""))
    .join("");
  const toolCalls = blocks
    .map((value) => objectValue(value, "Anthropic content block"))
    .filter((value) => value.type === "tool_use")
    .map((value) => ({
      id: String(value.id ?? randomUUID()),
      type: "function",
      function: {
        name: String(value.name ?? ""),
        arguments: JSON.stringify(value.input ?? {}),
      },
    }));
  const usage = objectValue(payload.usage ?? {}, "Anthropic usage");
  return jsonResponseLike(response, {
    id: String(payload.id ?? `chatcmpl-${randomUUID()}`),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: String(payload.model ?? modelId),
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: anthropicFinishReason(payload.stop_reason),
      },
    ],
    usage: {
      prompt_tokens: Number(usage.input_tokens ?? 0),
      completion_tokens: Number(usage.output_tokens ?? 0),
      total_tokens:
        Number(usage.input_tokens ?? 0) + Number(usage.output_tokens ?? 0),
    },
  });
}

async function geminiToOpenAiResponse(
  response: Response,
  modelId: string,
): Promise<Response> {
  const payload = objectValue(await response.json(), "Gemini response");
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const candidate = candidates[0] ? objectValue(candidates[0], "Gemini candidate") : {};
  const content = objectValue(candidate.content ?? {}, "Gemini content");
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const text = parts
    .map((value) => objectValue(value, "Gemini part"))
    .map((value) => (typeof value.text === "string" ? value.text : ""))
    .join("");
  const toolCalls = parts
    .map((value) => objectValue(value, "Gemini part"))
    .filter((value) => value.functionCall && typeof value.functionCall === "object")
    .map((value) => {
      const call = objectValue(value.functionCall, "Gemini function call");
      return {
        id: `call-${randomUUID()}`,
        type: "function",
        function: {
          name: String(call.name ?? ""),
          arguments: JSON.stringify(call.args ?? {}),
        },
      };
    });
  const usage = objectValue(payload.usageMetadata ?? {}, "Gemini usage");
  return jsonResponseLike(response, {
    id: `chatcmpl-${randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: modelId,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: geminiFinishReason(candidate.finishReason),
      },
    ],
    usage: {
      prompt_tokens: Number(usage.promptTokenCount ?? 0),
      completion_tokens: Number(usage.candidatesTokenCount ?? 0),
      total_tokens: Number(usage.totalTokenCount ?? 0),
    },
  });
}

function anthropicStreamToOpenAiResponse(
  response: Response,
  fallbackModelId: string,
): Response {
  let completionId = `chatcmpl-${randomUUID()}`;
  let modelId = fallbackModelId;
  let roleSent = false;
  let finished = false;
  const toolIndexes = new Map<number, number>();
  let nextToolIndex = 0;

  return translateEventStream(
    response,
    (_eventName, data) => {
      const payload = parseEventPayload(data, "Anthropic stream event");
      const type = String(payload.type ?? "");
      const chunks: string[] = [];
      if (type === "message_start") {
        const message = objectValue(payload.message, "Anthropic stream message");
        completionId = String(message.id ?? completionId);
        modelId = String(message.model ?? modelId);
      }
      if (!roleSent && type !== "ping") {
        chunks.push(openAiEventChunk(completionId, modelId, { role: "assistant" }));
        roleSent = true;
      }
      if (type === "content_block_start") {
        const block = objectValue(payload.content_block, "Anthropic content block");
        if (block.type === "tool_use") {
          const sourceIndex = Number(payload.index ?? 0);
          const toolIndex = nextToolIndex++;
          toolIndexes.set(sourceIndex, toolIndex);
          chunks.push(
            openAiEventChunk(completionId, modelId, {
              tool_calls: [
                {
                  index: toolIndex,
                  id: String(block.id ?? `call-${randomUUID()}`),
                  type: "function",
                  function: { name: String(block.name ?? ""), arguments: "" },
                },
              ],
            }),
          );
        }
      } else if (type === "content_block_delta") {
        const delta = objectValue(payload.delta, "Anthropic content delta");
        if (delta.type === "text_delta") {
          chunks.push(
            openAiEventChunk(completionId, modelId, {
              content: String(delta.text ?? ""),
            }),
          );
        } else if (delta.type === "input_json_delta") {
          const sourceIndex = Number(payload.index ?? 0);
          chunks.push(
            openAiEventChunk(completionId, modelId, {
              tool_calls: [
                {
                  index: toolIndexes.get(sourceIndex) ?? sourceIndex,
                  function: { arguments: String(delta.partial_json ?? "") },
                },
              ],
            }),
          );
        }
      } else if (type === "message_delta") {
        const delta = objectValue(payload.delta, "Anthropic message delta");
        chunks.push(
          openAiEventChunk(
            completionId,
            modelId,
            {},
            anthropicFinishReason(delta.stop_reason),
          ),
        );
        finished = true;
      } else if (type === "message_stop") {
        if (!finished) {
          chunks.push(openAiEventChunk(completionId, modelId, {}, "stop"));
          finished = true;
        }
        chunks.push("data: [DONE]\n\n");
      }
      return chunks;
    },
    () => {
      if (finished) return [];
      finished = true;
      return [
        openAiEventChunk(completionId, modelId, {}, "stop"),
        "data: [DONE]\n\n",
      ];
    },
  );
}

function geminiStreamToOpenAiResponse(
  response: Response,
  modelId: string,
): Response {
  const completionId = `chatcmpl-${randomUUID()}`;
  let roleSent = false;
  let finished = false;

  return translateEventStream(
    response,
    (_eventName, data) => {
      const payload = parseEventPayload(data, "Gemini stream event");
      const chunks: string[] = [];
      if (!roleSent) {
        chunks.push(openAiEventChunk(completionId, modelId, { role: "assistant" }));
        roleSent = true;
      }
      const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
      const candidate = candidates[0]
        ? objectValue(candidates[0], "Gemini stream candidate")
        : {};
      const content = objectValue(candidate.content ?? {}, "Gemini stream content");
      const parts = Array.isArray(content.parts) ? content.parts : [];
      parts.forEach((value, index) => {
        const part = objectValue(value, "Gemini stream part");
        if (typeof part.text === "string" && part.text) {
          chunks.push(
            openAiEventChunk(completionId, modelId, { content: part.text }),
          );
        }
        if (part.functionCall && typeof part.functionCall === "object") {
          const call = objectValue(part.functionCall, "Gemini function call");
          chunks.push(
            openAiEventChunk(completionId, modelId, {
              tool_calls: [
                {
                  index,
                  id: `call-${randomUUID()}`,
                  type: "function",
                  function: {
                    name: String(call.name ?? ""),
                    arguments: JSON.stringify(call.args ?? {}),
                  },
                },
              ],
            }),
          );
        }
      });
      if (candidate.finishReason) {
        chunks.push(
          openAiEventChunk(
            completionId,
            modelId,
            {},
            geminiFinishReason(candidate.finishReason),
          ),
        );
        chunks.push("data: [DONE]\n\n");
        finished = true;
      }
      return chunks;
    },
    () => {
      if (finished) return [];
      finished = true;
      return [
        openAiEventChunk(completionId, modelId, {}, "stop"),
        "data: [DONE]\n\n",
      ];
    },
  );
}

function translateEventStream(
  source: Response,
  translate: (eventName: string, data: string) => string[],
  finish: () => string[],
): Response {
  if (!source.body) {
    throw new CommercialApiError("模型流式响应缺少正文", { status: 502 });
  }
  const reader = source.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (chunks: readonly string[]) => {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      };
      const drain = (final: boolean) => {
        while (true) {
          const boundary = /\r?\n\r?\n/.exec(buffer);
          if (!boundary) break;
          const block = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary[0].length);
          const parsed = parseServerSentEvent(block);
          if (parsed) emit(translate(parsed.eventName, parsed.data));
        }
        if (final && buffer.trim()) {
          const parsed = parseServerSentEvent(buffer);
          buffer = "";
          if (parsed) emit(translate(parsed.eventName, parsed.data));
        }
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          drain(false);
        }
        buffer += decoder.decode();
        drain(true);
        emit(finish());
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
  const headers = new Headers({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  for (const name of ["x-request-id", "request-id"]) {
    const value = source.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(body, { status: source.status, headers });
}

function parseServerSentEvent(
  block: string,
): { eventName: string; data: string } | null {
  let eventName = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  return data.length > 0 ? { eventName, data: data.join("\n") } : null;
}

function parseEventPayload(data: string, name: string): Record<string, unknown> {
  try {
    return objectValue(JSON.parse(data) as unknown, name);
  } catch (error) {
    if (error instanceof CommercialApiError) throw error;
    throw new CommercialApiError(`${name} 不是有效 JSON`, { status: 502 });
  }
}

function openAiEventChunk(
  id: string,
  model: string,
  delta: Record<string, unknown>,
  finishReason: string | null = null,
): string {
  return `data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`;
}

function jsonResponseLike(source: Response, payload: unknown): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  for (const name of ["x-request-id", "request-id"]) {
    const value = source.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(JSON.stringify(payload), { status: source.status, headers });
}

const objectValue = createRequiredRecord(
  (name) => new CommercialApiError(`${name} 必须是对象`, { status: 502 }),
);

function textContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((partValue) => objectValue(partValue, "OpenAI content part"))
    .filter((part) => part.type === "text")
    .map((part) => String(part.text ?? ""))
    .join("\n");
}

function parseJsonArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    throw new CommercialApiError("工具参数不是有效 JSON", { status: 400 });
  }
}

function positiveNumberOrFallback(value: unknown, fallback: number): number {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function anthropicFinishReason(value: unknown): string {
  if (value === "max_tokens") return "length";
  if (value === "tool_use") return "tool_calls";
  return "stop";
}

function geminiFinishReason(value: unknown): string {
  if (value === "MAX_TOKENS") return "length";
  return "stop";
}

export function forwardedHeaders(
  source: IncomingMessage["headers"],
  contentType?: string,
): Headers {
  const headers = new Headers();
  if (source.accept) headers.set("Accept", String(source.accept));
  if (contentType) headers.set("Content-Type", contentType);
  if (source.range) headers.set("Range", String(source.range));
  if (source["anthropic-version"]) {
    headers.set("Anthropic-Version", String(source["anthropic-version"]));
  }
  if (source["anthropic-beta"]) {
    headers.set("Anthropic-Beta", String(source["anthropic-beta"]));
  }
  if (source["idempotency-key"]) {
    headers.set("Idempotency-Key", String(source["idempotency-key"]));
  }
  return headers;
}
