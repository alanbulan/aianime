// Copyright (c) 2026 AI anime

import { randomUUID } from "node:crypto";

import { CommercialApiError } from "../commercial-api-client.js";
import type {
  CommercialModelProviderStrategy,
  ProviderDiscoveredModel,
  ProviderModelDiscoveryInput,
} from "./types.js";
import {
  createNativeProviderStrategy,
  discoveredModelFromRecord,
  fetchProvider,
  generatedCompletionId,
  jsonResponseLike,
  normalizeDiscoveredModelCatalog,
  objectValue,
  openAiEventChunk,
  parseEventPayload,
  parseJsonArguments,
  positiveNumberOrFallback,
  preparedJsonObject,
  providerJson,
  textContent,
  translateEventStream,
} from "./shared.js";

export const anthropicProviderStrategy: CommercialModelProviderStrategy =
  createNativeProviderStrategy({
    id: "anthropic",
    matches: () => true,
    canonicalHosts: new Set(["api.anthropic.com"]),
    discoverModelIds: discoverModels,
    discoverModels: discoverModelCatalog,
    validateAssignments: (assignments) => {
      const unsupported = assignments.find(
        (assignment) => assignment.role !== "TEXT",
      );
      if (unsupported) {
        throw new Error("ANTHROPIC 原生协议当前仅支持文本模型用途");
      }
    },
    request: requestAnthropic,
  });

async function discoverModels(
  input: Parameters<CommercialModelProviderStrategy["discoverModelIds"]>[0],
): Promise<string[]> {
  return (await discoverModelCatalog(input)).map((model) => model.id);
}

async function discoverModelCatalog(
  input: ProviderModelDiscoveryInput,
): Promise<ProviderDiscoveredModel[]> {
  const response = await input.fetchImpl(
    new URL("models", `${input.baseUrl}/`),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Anthropic-Version": "2023-06-01",
        ...(input.apiKey ? { "X-Api-Key": input.apiKey } : {}),
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const root = objectValue(
    await providerJson(response, input.providerName),
    `${input.providerName} model catalog`,
  );
  const data = Array.isArray(root.data) ? root.data : null;
  if (!data) throw new Error(`${input.providerName} 模型目录缺少 data 数组`);
  const discovered = data.map((item, index) => {
    const model = objectValue(item, `model[${index}]`);
    return discoveredModelFromRecord(String(model.id ?? ""), model);
  });
  return normalizeDiscoveredModelCatalog(discovered, input.providerName);
}

async function requestAnthropic(
  route: Parameters<CommercialModelProviderStrategy["request"]>[0],
  input: Parameters<CommercialModelProviderStrategy["request"]>[1],
  prepared: Parameters<CommercialModelProviderStrategy["request"]>[2],
): Promise<Response> {
  if (!route.baseUrl) throw new CommercialApiError("Anthropic Base URL 缺失");
  const localUrl = new URL(input.path, "http://model-proxy.local");
  if (
    route.role !== "TEXT" ||
    input.method !== "POST" ||
    !localUrl.pathname.endsWith("/chat/completions")
  ) {
    throw new CommercialApiError("Anthropic 原生协议仅支持文本对话", {
      status: 400,
    });
  }
  const payload = preparedJsonObject(prepared);
  const stream = payload.stream === true;
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
    "Anthropic-Version": "2023-06-01",
  });
  const beta = input.requestHeaders["anthropic-beta"];
  if (beta) headers.set("Anthropic-Beta", String(beta));
  if (route.apiKey) headers.set("X-Api-Key", route.apiKey);
  const response = await fetchProvider(
    route,
    new URL("messages", `${route.baseUrl}/`),
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...openAiToAnthropicPayload(payload, route.modelId),
        ...(stream ? { stream: true } : {}),
      }),
      signal: input.signal,
    },
  );
  if (!response.ok) return response;
  return stream
    ? streamToOpenAi(response, route.modelId)
    : toOpenAiResponse(response, route.modelId);
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
    const toolCalls = Array.isArray(message.tool_calls)
      ? message.tool_calls
      : [];
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
  if (typeof payload.temperature === "number") {
    result.temperature = payload.temperature;
  }
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

function anthropicContent(value: unknown): Array<Record<string, unknown>> {
  if (typeof value === "string") return [{ type: "text", text: value }];
  if (!Array.isArray(value)) return [];
  return value.flatMap<Record<string, unknown>>((partValue) => {
    const part = objectValue(partValue, "OpenAI content part");
    if (part.type === "text") {
      return [{ type: "text", text: String(part.text ?? "") }];
    }
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

async function toOpenAiResponse(
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
    id: String(payload.id ?? generatedCompletionId()),
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
        finish_reason: finishReason(payload.stop_reason),
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

function streamToOpenAi(response: Response, fallbackModelId: string): Response {
  let completionId = generatedCompletionId();
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
        chunks.push(
          openAiEventChunk(completionId, modelId, { role: "assistant" }),
        );
        roleSent = true;
      }
      if (type === "content_block_start") {
        const block = objectValue(
          payload.content_block,
          "Anthropic content block",
        );
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
            finishReason(delta.stop_reason),
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

function finishReason(value: unknown): string {
  if (value === "max_tokens") return "length";
  if (value === "tool_use") return "tool_calls";
  return "stop";
}
