// Copyright (c) 2026 AI anime

import { randomUUID } from "node:crypto";

import { CommercialApiError } from "../commercial-api-client.js";
import type {
  CommercialModelProviderStrategy,
  ProviderDiscoveredModel,
  ProviderModelDiscoveryInput,
} from "./types.js";
import {
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

const SUPPORTED_ROLES = new Set([
  "TEXT",
  "EMBEDDING",
  "IMAGE_GENERATION",
  "IMAGE_EDIT",
]);

export const geminiProviderStrategy: CommercialModelProviderStrategy = {
  id: "gemini",
  matches: () => true,
  normalizeBaseUrl: (url) => {
    const baseUrl = url.toString().replace(/\/+$/, "");
    return /\/v\d+(?:beta\d*)?$/.test(baseUrl)
      ? baseUrl
      : `${baseUrl}/v1beta`;
  },
  discoverModelIds: discoverModels,
  discoverModels: discoverModelCatalog,
  parameterSchema: () => null,
  validateAssignments: (assignments) => {
    const unsupported = assignments.find(
      (assignment) => !SUPPORTED_ROLES.has(assignment.role),
    );
    if (unsupported) {
      throw new Error(
        `GEMINI 原生协议不支持 ${unsupported.role}；该用途请使用对应厂商的 OpenAI 兼容协议`,
      );
    }
  },
  request: requestGemini,
};

async function discoverModels(
  input: Parameters<CommercialModelProviderStrategy["discoverModelIds"]>[0],
): Promise<string[]> {
  return (await discoverModelCatalog(input)).map((model) => model.id);
}

async function discoverModelCatalog(
  input: ProviderModelDiscoveryInput,
): Promise<ProviderDiscoveredModel[]> {
  const url = new URL("models", `${input.baseUrl}/`);
  url.searchParams.set("pageSize", "1000");
  const response = await input.fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(input.apiKey ? { "X-Goog-Api-Key": input.apiKey } : {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const root = objectValue(
    await providerJson(response, input.providerName),
    `${input.providerName} model catalog`,
  );
  const models = Array.isArray(root.models) ? root.models : null;
  if (!models) throw new Error(`${input.providerName} 模型目录缺少 models 数组`);
  const discovered = models.map((item, index) => {
    const model = objectValue(item, `model[${index}]`);
    return discoveredModelFromRecord(String(model.name ?? ""), model);
  });
  return normalizeDiscoveredModelCatalog(discovered, input.providerName);
}

async function requestGemini(
  route: Parameters<CommercialModelProviderStrategy["request"]>[0],
  input: Parameters<CommercialModelProviderStrategy["request"]>[1],
  prepared: Parameters<CommercialModelProviderStrategy["request"]>[2],
): Promise<Response> {
  if (!route.baseUrl) throw new CommercialApiError("Gemini Base URL 缺失");
  if (input.method !== "POST") {
    throw new CommercialApiError("Gemini 原生协议仅支持 POST 请求", {
      status: 405,
    });
  }
  if (route.role === "TEXT") {
    return requestText(route, input, prepared);
  }
  if (route.role === "EMBEDDING") {
    return requestEmbedding(route, input, prepared);
  }
  if (route.role === "IMAGE_GENERATION" || route.role === "IMAGE_EDIT") {
    return requestImage(route, input, prepared);
  }
  throw new CommercialApiError(
    `Gemini 原生协议不支持当前模型用途 ${route.role}`,
    { status: 422 },
  );
}

async function requestText(
  route: Parameters<CommercialModelProviderStrategy["request"]>[0],
  input: Parameters<CommercialModelProviderStrategy["request"]>[1],
  prepared: Parameters<CommercialModelProviderStrategy["request"]>[2],
): Promise<Response> {
  const pathname = new URL(input.path, "http://model-proxy.local").pathname;
  if (!pathname.endsWith("/chat/completions")) {
    throw new CommercialApiError("Gemini 原生文本策略仅支持 chat/completions", {
      status: 400,
    });
  }
  const payload = preparedJsonObject(prepared);
  const stream = payload.stream === true;
  const action = stream ? "streamGenerateContent" : "generateContent";
  const url = modelActionUrl(route, action);
  if (stream) url.searchParams.set("alt", "sse");
  const response = await fetchProvider(route, url, {
    method: "POST",
    headers: geminiHeaders(route),
    body: JSON.stringify(openAiToGeminiPayload(payload)),
    signal: input.signal,
  });
  if (!response.ok) return response;
  return stream
    ? streamToOpenAi(response, route.modelId)
    : textToOpenAiResponse(response, route.modelId);
}

async function requestEmbedding(
  route: Parameters<CommercialModelProviderStrategy["request"]>[0],
  input: Parameters<CommercialModelProviderStrategy["request"]>[1],
  prepared: Parameters<CommercialModelProviderStrategy["request"]>[2],
): Promise<Response> {
  const payload = preparedJsonObject(prepared);
  const values = Array.isArray(payload.input) ? payload.input : [payload.input];
  const texts = values.map((value, index) => {
    if (typeof value !== "string" || !value.trim()) {
      throw new CommercialApiError(`Gemini embedding input[${index}]不能为空`, {
        status: 422,
      });
    }
    return value;
  });
  const dimensions =
    typeof payload.dimensions === "number" && payload.dimensions > 0
      ? Math.floor(payload.dimensions)
      : undefined;
  const modelName = `models/${route.modelId.replace(/^models\//, "")}`;
  const batch = texts.length > 1;
  const body = batch
    ? {
        requests: texts.map((text) => ({
          model: modelName,
          content: { parts: [{ text }] },
          ...(dimensions ? { outputDimensionality: dimensions } : {}),
        })),
      }
    : {
        content: { parts: [{ text: texts[0] }] },
        ...(dimensions ? { outputDimensionality: dimensions } : {}),
      };
  const response = await fetchProvider(
    route,
    modelActionUrl(route, batch ? "batchEmbedContents" : "embedContent"),
    {
      method: "POST",
      headers: geminiHeaders(route),
      body: JSON.stringify(body),
      signal: input.signal,
    },
  );
  if (!response.ok) return response;
  const root = objectValue(await response.json(), "Gemini embedding response");
  const rawEmbeddings = batch
    ? Array.isArray(root.embeddings)
      ? root.embeddings
      : []
    : [root.embedding];
  const data = rawEmbeddings.map((value, index) => {
    const embedding = objectValue(value, `Gemini embedding[${index}]`);
    if (!Array.isArray(embedding.values)) {
      throw new CommercialApiError("Gemini embedding 响应缺少 values", {
        status: 502,
      });
    }
    return { object: "embedding", index, embedding: embedding.values };
  });
  return jsonResponseLike(response, {
    object: "list",
    data,
    model: route.modelId,
    usage: { prompt_tokens: 0, total_tokens: 0 },
  });
}

async function requestImage(
  route: Parameters<CommercialModelProviderStrategy["request"]>[0],
  input: Parameters<CommercialModelProviderStrategy["request"]>[1],
  prepared: Parameters<CommercialModelProviderStrategy["request"]>[2],
): Promise<Response> {
  const imageInput = await imageRequestParts(prepared);
  const response = await fetchProvider(
    route,
    modelActionUrl(route, "generateContent"),
    {
      method: "POST",
      headers: geminiHeaders(route),
      body: JSON.stringify({
        contents: [{ role: "user", parts: imageInput.parts }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          ...(imageInput.aspectRatio
            ? {
                responseFormat: {
                  image: { aspectRatio: imageInput.aspectRatio },
                },
              }
            : {}),
        },
      }),
      signal: input.signal,
    },
  );
  if (!response.ok) return response;
  const root = objectValue(await response.json(), "Gemini image response");
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  const images = candidates.flatMap((candidateValue, candidateIndex) => {
    const candidate = objectValue(
      candidateValue,
      `Gemini image candidate[${candidateIndex}]`,
    );
    const content = objectValue(candidate.content ?? {}, "Gemini image content");
    const parts = Array.isArray(content.parts) ? content.parts : [];
    return parts.flatMap((partValue) => {
      const part = objectValue(partValue, "Gemini image part");
      if (!part.inlineData || typeof part.inlineData !== "object") return [];
      const inlineData = objectValue(part.inlineData, "Gemini inline image");
      const data = String(inlineData.data ?? "").trim();
      return data ? [{ b64_json: data }] : [];
    });
  });
  if (images.length === 0) {
    throw new CommercialApiError("Gemini 图片响应未返回图片数据", {
      status: 502,
    });
  }
  return jsonResponseLike(response, {
    created: Math.floor(Date.now() / 1000),
    data: images,
  });
}

async function imageRequestParts(prepared: Parameters<CommercialModelProviderStrategy["request"]>[2]): Promise<{
  parts: Array<Record<string, unknown>>;
  aspectRatio: string;
}> {
  if (prepared.body instanceof FormData) {
    const parts: Array<Record<string, unknown>> = [];
    const prompt = String(prepared.body.get("prompt") ?? "").trim();
    if (prompt) parts.push({ text: prompt });
    for (const key of ["image", "image[]", "mask"]) {
      for (const value of prepared.body.getAll(key)) {
        if (!(value instanceof Blob)) continue;
        parts.push({
          inlineData: {
            mimeType: value.type || "application/octet-stream",
            data: Buffer.from(await value.arrayBuffer()).toString("base64"),
          },
        });
      }
    }
    if (parts.length === 0) {
      throw new CommercialApiError("Gemini 图片编辑请求缺少提示词或图片", {
        status: 422,
      });
    }
    return {
      parts,
      aspectRatio: aspectRatioFromSize(
        String(prepared.body.get("size") ?? ""),
      ),
    };
  }

  const payload = preparedJsonObject(prepared);
  const prompt = String(payload.prompt ?? "").trim();
  if (!prompt) {
    throw new CommercialApiError("Gemini 图片生成提示词不能为空", {
      status: 422,
    });
  }
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  const images = Array.isArray(payload.image) ? payload.image : [payload.image];
  for (const value of images) {
    if (typeof value !== "string" || !value.trim()) continue;
    const data = /^data:([^;,]+);base64,(.+)$/s.exec(value);
    if (!data) {
      throw new CommercialApiError("Gemini 图片输入必须是 data URL", {
        status: 400,
      });
    }
    parts.push({ inlineData: { mimeType: data[1], data: data[2] } });
  }
  return { parts, aspectRatio: aspectRatioFromSize(String(payload.size ?? "")) };
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
    const toolCalls = Array.isArray(message.tool_calls)
      ? message.tool_calls
      : [];
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
  if (typeof payload.stop === "string") {
    generationConfig.stopSequences = [payload.stop];
  }
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

function geminiParts(value: unknown): Array<Record<string, unknown>> {
  if (typeof value === "string") return [{ text: value }];
  if (!Array.isArray(value)) return [];
  return value.flatMap<Record<string, unknown>>((partValue) => {
    const part = objectValue(partValue, "OpenAI content part");
    if (part.type === "text") return [{ text: String(part.text ?? "") }];
    if (part.type !== "image_url") return [];
    const image = objectValue(part.image_url, "OpenAI image URL");
    const data = /^data:([^;,]+);base64,(.+)$/s.exec(String(image.url ?? ""));
    if (!data) {
      throw new CommercialApiError("Gemini 原生协议的图片输入必须是 data URL", {
        status: 400,
      });
    }
    return [{ inlineData: { mimeType: data[1], data: data[2] } }];
  });
}

async function textToOpenAiResponse(
  response: Response,
  modelId: string,
): Promise<Response> {
  const payload = objectValue(await response.json(), "Gemini response");
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const candidate = candidates[0]
    ? objectValue(candidates[0], "Gemini candidate")
    : {};
  const content = objectValue(candidate.content ?? {}, "Gemini content");
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const text = parts
    .map((value) => objectValue(value, "Gemini part"))
    .map((value) => (typeof value.text === "string" ? value.text : ""))
    .join("");
  const toolCalls = parts
    .map((value) => objectValue(value, "Gemini part"))
    .filter(
      (value) => value.functionCall && typeof value.functionCall === "object",
    )
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
    id: generatedCompletionId(),
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
        finish_reason: finishReason(candidate.finishReason),
      },
    ],
    usage: {
      prompt_tokens: Number(usage.promptTokenCount ?? 0),
      completion_tokens: Number(usage.candidatesTokenCount ?? 0),
      total_tokens: Number(usage.totalTokenCount ?? 0),
    },
  });
}

function streamToOpenAi(response: Response, modelId: string): Response {
  const completionId = generatedCompletionId();
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
      const candidates = Array.isArray(payload.candidates)
        ? payload.candidates
        : [];
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
            finishReason(candidate.finishReason),
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

function modelActionUrl(
  route: Parameters<CommercialModelProviderStrategy["request"]>[0],
  action: string,
): URL {
  const modelPath = route.modelId
    .replace(/^models\//, "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return new URL(`models/${modelPath}:${action}`, `${route.baseUrl}/`);
}

function geminiHeaders(
  route: Parameters<CommercialModelProviderStrategy["request"]>[0],
): Headers {
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  if (route.apiKey) headers.set("X-Goog-Api-Key", route.apiKey);
  return headers;
}

function aspectRatioFromSize(value: string): string {
  const match = /^(\d+)x(\d+)$/i.exec(value.trim());
  if (!match) return "";
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!(width > 0 && height > 0)) return "";
  const ratio = width / height;
  const supported = [
    ["1:1", 1],
    ["3:2", 3 / 2],
    ["2:3", 2 / 3],
    ["4:3", 4 / 3],
    ["3:4", 3 / 4],
    ["16:9", 16 / 9],
    ["9:16", 9 / 16],
  ] as const;
  return supported.reduce((best, current) =>
    Math.abs(current[1] - ratio) < Math.abs(best[1] - ratio) ? current : best,
  )[0];
}

function finishReason(value: unknown): string {
  return value === "MAX_TOKENS" ? "length" : "stop";
}
