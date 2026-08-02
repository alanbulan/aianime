import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Readable } from "node:stream";

import type { CommercialDeviceSigner } from "./commercial-device.js";
import { CommercialApiClient, CommercialApiError } from "./commercial.js";

const MAX_MODEL_BODY_BYTES = 40 * 1024 * 1024;
const FORBIDDEN_CLOUD_FIELDS = new Set([
  "apikey",
  "baseurl",
  "authorization",
  "headers",
  "xapikey",
  "xgoogapikey",
]);

export class CommercialModelProxy {
  readonly token = randomBytes(32).toString("hex");
  private server: Server | null = null;
  private origin: string | null = null;

  constructor(
    private readonly client: CommercialApiClient,
    private readonly deviceIdentity: CommercialDeviceSigner,
  ) {}

  get baseUrl(): string {
    if (!this.origin) throw new Error("commercial model proxy has not started");
    return `${this.origin}/v1`;
  }

  async start(): Promise<void> {
    if (this.server) return;
    const server = createServer((request, response) => {
      void this.handle(request, response);
    });
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      await this.stop();
      throw new Error("commercial model proxy failed to bind a TCP port");
    }
    this.origin = `http://127.0.0.1:${address.port}`;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.origin = null;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    try {
      assertLoopbackRequest(request);
      assertLocalAuthorization(request, this.token);
      const method = String(request.method ?? "GET").toUpperCase();
      if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(method)) {
        throw new CommercialApiError("不支持的模型代理方法", { status: 405 });
      }
      const path = request.url ?? "/";
      const contentType = String(request.headers["content-type"] ?? "");
      const body =
        method === "GET" || method === "HEAD"
          ? undefined
          : await modelRequestBody(request, contentType);
      const device = await this.deviceIdentity.summary();
      const abortController = new AbortController();
      const abortUpstream = () => abortController.abort();
      request.once("aborted", abortUpstream);
      response.once("close", abortUpstream);
      const upstream = await this.client.modelRequest({
        method,
        path,
        headers: {
          ...(request.headers.accept ? { Accept: request.headers.accept } : {}),
          ...(contentType ? { "Content-Type": contentType } : {}),
          ...(request.headers.range ? { Range: request.headers.range } : {}),
          ...(request.headers["anthropic-version"]
            ? {
                "Anthropic-Version": String(
                  request.headers["anthropic-version"],
                ),
              }
            : {}),
          ...(request.headers["anthropic-beta"]
            ? {
                "Anthropic-Beta": String(request.headers["anthropic-beta"]),
              }
            : {}),
          ...(request.headers["idempotency-key"]
            ? { "Idempotency-Key": String(request.headers["idempotency-key"]) }
            : {}),
        },
        ...(body === undefined ? {} : { body }),
        devicePublicKeyHash: device.publicKeyHash,
        signal: abortController.signal,
      });
      response.statusCode = upstream.status;
      for (const header of [
        "content-type",
        "content-length",
        "content-disposition",
        "cache-control",
        "etag",
        "accept-ranges",
        "content-range",
        "location",
        "retry-after",
        "x-request-id",
      ]) {
        const value = upstream.headers.get(header);
        if (value) response.setHeader(header, value);
      }
      if (!upstream.body || method === "HEAD") {
        response.end();
        return;
      }
      const bodyStream = Readable.fromWeb(upstream.body as never);
      bodyStream.once("error", (error) => {
        if (!response.destroyed) response.destroy(error);
      });
      response.once("close", () => bodyStream.destroy());
      bodyStream.pipe(response);
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      const status =
        error instanceof CommercialApiError && error.status > 0
          ? error.status
          : 502;
      response.statusCode = status;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(
        JSON.stringify({
          error: {
            message: error instanceof Error ? error.message : "云端模型代理失败",
            type: status === 401 ? "authentication_error" : "proxy_error",
            code: error instanceof CommercialApiError ? error.code : null,
          },
        }),
      );
    }
  }
}

async function modelRequestBody(
  request: IncomingMessage,
  contentType: string,
): Promise<BodyInit> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > MAX_MODEL_BODY_BYTES) {
      throw new CommercialApiError("模型请求体超过 40 MiB", { status: 413 });
    }
    chunks.push(bytes);
  }
  const body = Buffer.concat(chunks);
  const normalizedContentType = contentType.trim().toLowerCase();
  if (normalizedContentType.startsWith("multipart/form-data")) {
    await assertMultipartFieldsAllowed(body, contentType);
    return body;
  }
  if (!normalizedContentType.startsWith("application/json")) return body;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8")) as unknown;
  } catch {
    throw new CommercialApiError("模型请求体不是有效 JSON", { status: 400 });
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const key of Object.keys(parsed)) {
      if (isForbiddenCloudField(key)) {
        throw new CommercialApiError(`云端模型请求禁止字段 ${key}`, {
          status: 400,
        });
      }
    }
  }
  return body;
}

async function assertMultipartFieldsAllowed(
  body: Buffer,
  contentType: string,
): Promise<void> {
  let form: FormData;
  try {
    form = await new Request("http://model-proxy.local", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: body as unknown as BodyInit,
    }).formData();
  } catch {
    throw new CommercialApiError("模型 multipart 请求体无效", { status: 400 });
  }
  let forbiddenField: string | null = null;
  form.forEach((_value, key) => {
    if (forbiddenField === null && isForbiddenCloudField(key)) {
      forbiddenField = key;
    }
  });
  if (forbiddenField !== null) {
    throw new CommercialApiError(`云端模型请求禁止字段 ${forbiddenField}`, {
      status: 400,
    });
  }
}

function isForbiddenCloudField(value: string): boolean {
  return FORBIDDEN_CLOUD_FIELDS.has(
    value.toLowerCase().replaceAll("_", "").replaceAll("-", ""),
  );
}

function assertLoopbackRequest(request: IncomingMessage): void {
  const address = request.socket.remoteAddress ?? "";
  if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") {
    throw new CommercialApiError("模型代理只接受本机请求", { status: 403 });
  }
}

function assertLocalAuthorization(
  request: IncomingMessage,
  expectedToken: string,
): void {
  if (request.headers.authorization !== `Bearer ${expectedToken}`) {
    throw new CommercialApiError("模型代理认证失败", { status: 401 });
  }
}
