import { createHash } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";

import {
  readEncryptedJsonFile,
  writeEncryptedJsonFile,
  type SecureStorageAdapter,
} from "./secure-file-store.js";

export type LocalModelInvocationState =
  | "PENDING"
  | "IN_FLIGHT"
  | "SUCCEEDED"
  | "FAILED"
  | "OUTCOME_UNKNOWN";

export interface StoredModelResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyBase64: string;
}

export interface StoredModelInvocation {
  schemaVersion: 1;
  subject: string;
  operation: string;
  idempotencyKey: string;
  requestHash: string;
  taskId: string;
  routeKey: string;
  routeSource: "cloud" | "byok" | "";
  state: LocalModelInvocationState;
  cancellationRequested: boolean;
  cancellationReason: string;
  cancellationRequestedAt: string;
  response: StoredModelResponse | null;
  responseExpiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelInvocationIdentity {
  subject: string;
  operation: string;
  idempotencyKey: string;
}

export interface ModelInvocationClaim extends ModelInvocationIdentity {
  requestHash: string;
  taskId: string;
  routeKey: string;
  routeSource: "cloud" | "byok";
}

export interface ModelInvocationRoute {
  key: string;
  source: "cloud" | "byok";
}

export interface ModelInvocationClaimResult {
  kind: "created" | "existing" | "conflict";
  record: StoredModelInvocation;
}

export interface StoredTaskCancellation {
  schemaVersion: 1;
  subject: string;
  taskId: string;
  reason: string;
  requestedAt: string;
}

export interface ModelInvocationStore {
  claim(input: ModelInvocationClaim): Promise<ModelInvocationClaimResult>;
  markStarted(
    identity: ModelInvocationIdentity,
    route: ModelInvocationRoute,
  ): Promise<StoredModelInvocation>;
  complete(
    identity: ModelInvocationIdentity,
    state: Exclude<LocalModelInvocationState, "PENDING" | "IN_FLIGHT">,
    response: StoredModelResponse | null,
  ): Promise<StoredModelInvocation>;
  requestCancellation(
    identity: ModelInvocationIdentity,
    reason: string,
  ): Promise<StoredModelInvocation>;
  requestTaskCancellation(
    subject: string,
    taskId: string,
    reason: string,
  ): Promise<StoredTaskCancellation>;
  taskCancellation(
    subject: string,
    taskId: string,
  ): Promise<StoredTaskCancellation | null>;
  recordsForTask(subject: string, taskId: string): Promise<StoredModelInvocation[]>;
}

const RESPONSE_RETENTION_MS = 24 * 60 * 60_000;
const MAX_STORED_RESPONSE_BYTES = 32 * 1024 * 1024;

export class InMemoryModelInvocationStore implements ModelInvocationStore {
  private readonly records = new Map<string, StoredModelInvocation>();
  private readonly taskCancellations = new Map<string, StoredTaskCancellation>();

  constructor(private readonly now: () => number = Date.now) {}

  async claim(input: ModelInvocationClaim): Promise<ModelInvocationClaimResult> {
    await this.pruneExpiredResponses();
    const identity = normalizeIdentity(input);
    const key = memoryKey(identity);
    const existing = this.records.get(key);
    if (existing) {
      if (existing.requestHash && existing.requestHash !== input.requestHash) {
        return { kind: "conflict", record: existing };
      }
      const next = {
        ...existing,
        requestHash: existing.requestHash || input.requestHash,
        taskId: existing.taskId || input.taskId,
        routeKey: existing.routeKey || input.routeKey,
        routeSource: existing.routeSource || input.routeSource,
        updatedAt: new Date(this.now()).toISOString(),
      };
      this.records.set(key, next);
      return { kind: "existing", record: next };
    }
    const timestamp = new Date(this.now()).toISOString();
    const record: StoredModelInvocation = {
      schemaVersion: 1,
      ...identity,
      requestHash: required(input.requestHash, "requestHash"),
      taskId: optional(input.taskId),
      routeKey: required(input.routeKey, "routeKey"),
      routeSource: input.routeSource,
      state: "PENDING",
      cancellationRequested: false,
      cancellationReason: "",
      cancellationRequestedAt: "",
      response: null,
      responseExpiresAt: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.records.set(key, record);
    return { kind: "created", record };
  }

  async markStarted(identityInput: ModelInvocationIdentity, route: ModelInvocationRoute): Promise<StoredModelInvocation> {
    const identity = normalizeIdentity(identityInput);
    const key = memoryKey(identity);
    const record = this.require(key);
    const next: StoredModelInvocation = {
      ...record,
      routeKey: required(route.key, "route.key"),
      routeSource: route.source,
      state:
        record.state === "PENDING" && !record.cancellationRequested
          ? "IN_FLIGHT"
          : record.state,
      updatedAt: new Date(this.now()).toISOString(),
    };
    this.records.set(key, next);
    return next;
  }

  async complete(
    identityInput: ModelInvocationIdentity,
    state: Exclude<LocalModelInvocationState, "PENDING" | "IN_FLIGHT">,
    response: StoredModelResponse | null,
  ): Promise<StoredModelInvocation> {
    const identity = normalizeIdentity(identityInput);
    const key = memoryKey(identity);
    const record = this.require(key);
    const responseBytes = response ? Buffer.byteLength(response.bodyBase64, "base64") : 0;
    const retainedResponse = response && responseBytes <= MAX_STORED_RESPONSE_BYTES ? response : null;
    const next: StoredModelInvocation = {
      ...record,
      state,
      response: retainedResponse,
      responseExpiresAt: retainedResponse ? new Date(this.now() + RESPONSE_RETENTION_MS).toISOString() : "",
      updatedAt: new Date(this.now()).toISOString(),
    };
    this.records.set(key, next);
    return next;
  }

  async requestCancellation(identityInput: ModelInvocationIdentity, reasonInput: string): Promise<StoredModelInvocation> {
    const identity = normalizeIdentity(identityInput);
    const key = memoryKey(identity);
    const timestamp = new Date(this.now()).toISOString();
    const existing = this.records.get(key);
    const record: StoredModelInvocation = existing ?? {
      schemaVersion: 1,
      ...identity,
      requestHash: "",
      taskId: "",
      routeKey: "",
      routeSource: "",
      state: "PENDING",
      cancellationRequested: false,
      cancellationReason: "",
      cancellationRequestedAt: "",
      response: null,
      responseExpiresAt: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const next = record.cancellationRequested ? record : {
      ...record,
      cancellationRequested: true,
      cancellationReason: required(reasonInput, "reason"),
      cancellationRequestedAt: timestamp,
      updatedAt: timestamp,
    };
    this.records.set(key, next);
    return next;
  }

  async requestTaskCancellation(
    subjectInput: string,
    taskIdInput: string,
    reasonInput: string,
  ): Promise<StoredTaskCancellation> {
    const subject = required(subjectInput, "subject");
    const taskId = required(taskIdInput, "taskId");
    const key = taskMemoryKey(subject, taskId);
    const existing = this.taskCancellations.get(key);
    if (existing) return existing;
    const cancellation: StoredTaskCancellation = {
      schemaVersion: 1,
      subject,
      taskId,
      reason: required(reasonInput, "reason"),
      requestedAt: new Date(this.now()).toISOString(),
    };
    this.taskCancellations.set(key, cancellation);
    return cancellation;
  }

  async taskCancellation(
    subjectInput: string,
    taskIdInput: string,
  ): Promise<StoredTaskCancellation | null> {
    return this.taskCancellations.get(
      taskMemoryKey(
        required(subjectInput, "subject"),
        required(taskIdInput, "taskId"),
      ),
    ) ?? null;
  }

  async recordsForTask(subjectInput: string, taskIdInput: string): Promise<StoredModelInvocation[]> {
    await this.pruneExpiredResponses();
    const subject = required(subjectInput, "subject");
    const taskId = required(taskIdInput, "taskId");
    return [...this.records.values()]
      .filter((record) => record.subject === subject && record.taskId === taskId);
  }

  async pruneExpiredResponses(): Promise<void> {
    for (const [key, record] of this.records) {
      const expired = expireResponse(record, this.now());
      if (expired !== record) this.records.set(key, expired);
    }
  }

  private require(key: string): StoredModelInvocation {
    const record = this.records.get(key);
    if (!record) throw new Error("model invocation idempotency record is missing");
    const expired = expireResponse(record, this.now());
    if (expired !== record) this.records.set(key, expired);
    return expired;
  }
}

export class EncryptedFileModelInvocationStore implements ModelInvocationStore {
  private readonly lockTails = new Map<string, Promise<void>>();
  private readonly taskIndex = new Map<string, Map<string, ModelInvocationIdentity>>();
  private readonly responseExpirations = new Map<string, { identity: ModelInvocationIdentity; expiresAt: number }>();
  private initialization: Promise<void> | null = null;
  private maintenanceEnabled = false;
  private maintenanceTimer: ReturnType<typeof setInterval> | null = null;
  private maintenanceInFlight: Promise<void> | null = null;

  constructor(
    private readonly directory: string,
    private readonly secureStorage: SecureStorageAdapter,
    private readonly now: () => number = Date.now,
  ) {}

  initialize(): Promise<void> {
    this.initialization ??= this.loadIndex();
    return this.initialization;
  }

  async startMaintenance(onError: (error: unknown) => void): Promise<void> {
    this.maintenanceEnabled = true;
    await this.pruneExpiredResponses();
    if (!this.maintenanceEnabled || this.maintenanceTimer) return;
    this.maintenanceTimer = setInterval(() => {
      void this.pruneExpiredResponses().catch(onError);
    }, 60_000);
    this.maintenanceTimer.unref();
  }

  async stopMaintenance(): Promise<void> {
    this.maintenanceEnabled = false;
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
    this.maintenanceTimer = null;
    await this.maintenanceInFlight;
  }

  async pruneExpiredResponses(): Promise<void> {
    if (this.maintenanceInFlight) return this.maintenanceInFlight;
    const pending = (async () => {
      await this.initialize();
      for (const { identity, expiresAt } of [...this.responseExpirations.values()]) {
        if (expiresAt <= this.now()) {
          await this.withLock(identity, () => this.readMetadataUnlocked(identity));
        }
      }
    })();
    this.maintenanceInFlight = pending;
    try {
      await pending;
    } finally {
      if (this.maintenanceInFlight === pending) this.maintenanceInFlight = null;
    }
  }

  private async loadIndex(): Promise<void> {
    const directory = join(this.directory, "invocations");
    const names = await this.fileNames(directory);
    const retainedResponses = new Set<string>();
    for (const name of names) {
      if (!name.endsWith(".bin")) continue;
      const record = await readEncryptedJsonFile(join(directory, name), this.secureStorage,
        parseStoredModelInvocation, { preserveValidationError: true });
      if (!record) continue;
      // 旧版本将正文放在记录内；首次读取时迁出正文，保留原幂等身份与执行状态。
      const expired = expireResponse(record, this.now());
      if (record.response || expired !== record) await this.writeUnlocked(expired);
      else this.indexRecord(record);
      if (expired.responseExpiresAt) retainedResponses.add(basename(this.responsePath(record)));
    }
    // 回收正文已写入但元数据未提交时留下的文件，不删除任何幂等记录。
    const responseDirectory = join(this.directory, "responses");
    for (const name of await this.fileNames(responseDirectory)) {
      if (name.endsWith(".bin") && !retainedResponses.has(name)) {
        await rm(join(responseDirectory, name), { force: true });
      }
    }
  }

  private async fileNames(directory: string): Promise<string[]> {
    try { return await readdir(directory); }
    catch (error) { if (isMissingPath(error)) return []; throw error; }
  }

  async claim(input: ModelInvocationClaim): Promise<ModelInvocationClaimResult> {
    const identity = normalizeIdentity(input);
    return this.withLock(identity, async () => {
      const existing = await this.readUnlocked(identity);
      if (existing) {
        if (existing.requestHash && existing.requestHash !== input.requestHash) {
          return { kind: "conflict", record: existing };
        }
        const next: StoredModelInvocation = {
          ...existing,
          requestHash: existing.requestHash || input.requestHash,
          taskId: existing.taskId || input.taskId,
          routeKey: existing.routeKey || input.routeKey,
          routeSource: existing.routeSource || input.routeSource,
          updatedAt: new Date(this.now()).toISOString(),
        };
        await this.writeUnlocked(next);
        return { kind: "existing", record: next };
      }
      const timestamp = new Date(this.now()).toISOString();
      const record: StoredModelInvocation = {
        schemaVersion: 1,
        ...identity,
        requestHash: required(input.requestHash, "requestHash"),
        taskId: optional(input.taskId),
        routeKey: required(input.routeKey, "routeKey"),
        routeSource: input.routeSource,
        state: "PENDING",
        cancellationRequested: false,
        cancellationReason: "",
        cancellationRequestedAt: "",
        response: null,
        responseExpiresAt: "",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await this.writeUnlocked(record);
      return { kind: "created", record };
    });
  }

  async markStarted(
    identityInput: ModelInvocationIdentity,
    route: ModelInvocationRoute,
  ): Promise<StoredModelInvocation> {
    const identity = normalizeIdentity(identityInput);
    return this.withLock(identity, async () => {
      const record = await this.requireUnlocked(identity);
      const next: StoredModelInvocation = {
        ...record,
        routeKey: required(route.key, "route.key"),
        routeSource: route.source,
        state:
          record.state === "PENDING" && !record.cancellationRequested
            ? "IN_FLIGHT"
            : record.state,
        updatedAt: new Date(this.now()).toISOString(),
      };
      await this.writeUnlocked(next);
      return next;
    });
  }

  async complete(
    identityInput: ModelInvocationIdentity,
    state: Exclude<LocalModelInvocationState, "PENDING" | "IN_FLIGHT">,
    response: StoredModelResponse | null,
  ): Promise<StoredModelInvocation> {
    const identity = normalizeIdentity(identityInput);
    return this.withLock(identity, async () => {
      const record = await this.requireUnlocked(identity);
      const responseBytes = response
        ? Buffer.byteLength(response.bodyBase64, "base64")
        : 0;
      const retainedResponse =
        response && responseBytes <= MAX_STORED_RESPONSE_BYTES ? response : null;
      const timestamp = new Date(this.now()).toISOString();
      const next: StoredModelInvocation = {
        ...record,
        state,
        response: retainedResponse,
        responseExpiresAt: retainedResponse
          ? new Date(this.now() + RESPONSE_RETENTION_MS).toISOString()
          : "",
        updatedAt: timestamp,
      };
      await this.writeUnlocked(next);
      return next;
    });
  }

  async requestCancellation(
    identityInput: ModelInvocationIdentity,
    reasonInput: string,
  ): Promise<StoredModelInvocation> {
    const identity = normalizeIdentity(identityInput);
    const reason = required(reasonInput, "reason");
    return this.withLock(identity, async () => {
      const existing = await this.readMetadataUnlocked(identity);
      const timestamp = new Date(this.now()).toISOString();
      const record: StoredModelInvocation = existing ?? {
        schemaVersion: 1,
        ...identity,
        requestHash: "",
        taskId: "",
        routeKey: "",
        routeSource: "",
        state: "PENDING",
        cancellationRequested: false,
        cancellationReason: "",
        cancellationRequestedAt: "",
        response: null,
        responseExpiresAt: "",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const next = record.cancellationRequested
        ? record
        : {
            ...record,
            cancellationRequested: true,
            cancellationReason: reason,
            cancellationRequestedAt: timestamp,
            updatedAt: timestamp,
          };
      await this.writeUnlocked(next);
      return next;
    });
  }

  async requestTaskCancellation(
    subjectInput: string,
    taskIdInput: string,
    reasonInput: string,
  ): Promise<StoredTaskCancellation> {
    const subject = required(subjectInput, "subject");
    const taskId = required(taskIdInput, "taskId");
    const reason = required(reasonInput, "reason");
    return this.withSerializedLock(taskMemoryKey(subject, taskId), async () => {
      const path = this.taskPath(subject, taskId);
      const existing = await readEncryptedJsonFile(
        path,
        this.secureStorage,
        parseStoredTaskCancellation,
        { preserveValidationError: true },
      );
      if (existing) return existing;
      const cancellation: StoredTaskCancellation = {
        schemaVersion: 1,
        subject,
        taskId,
        reason,
        requestedAt: new Date(this.now()).toISOString(),
      };
      await writeEncryptedJsonFile(path, this.secureStorage, cancellation);
      return cancellation;
    });
  }

  async taskCancellation(
    subjectInput: string,
    taskIdInput: string,
  ): Promise<StoredTaskCancellation | null> {
    const subject = required(subjectInput, "subject");
    const taskId = required(taskIdInput, "taskId");
    return this.withSerializedLock(taskMemoryKey(subject, taskId), () =>
      readEncryptedJsonFile(
        this.taskPath(subject, taskId),
        this.secureStorage,
        parseStoredTaskCancellation,
        { preserveValidationError: true },
      ),
    );
  }

  async recordsForTask(
    subjectInput: string,
    taskIdInput: string,
  ): Promise<StoredModelInvocation[]> {
    const subject = required(subjectInput, "subject");
    const taskId = required(taskIdInput, "taskId");
    await this.initialize();
    const records: StoredModelInvocation[] = [];
    const identities = this.taskIndex.get(taskMemoryKey(subject, taskId));
    for (const identity of identities?.values() ?? []) {
      const record = await this.withLock(identity, () => this.readMetadataUnlocked(identity));
      if (record?.subject === subject && record.taskId === taskId) {
        records.push(record);
      }
    }
    return records;
  }

  private async requireUnlocked(
    identity: ModelInvocationIdentity,
  ): Promise<StoredModelInvocation> {
    const record = await this.readMetadataUnlocked(identity);
    if (!record) throw new Error("model invocation idempotency record is missing");
    return record;
  }

  private async readUnlocked(
    identity: ModelInvocationIdentity,
  ): Promise<StoredModelInvocation | null> {
    const record = await this.readMetadataUnlocked(identity);
    if (!record || !record.responseExpiresAt) return record;
    const response = await readEncryptedJsonFile(this.responsePath(identity), this.secureStorage,
      parseStoredResponse, { preserveValidationError: true });
    return { ...record, response };
  }

  private async readMetadataUnlocked(
    identity: ModelInvocationIdentity,
  ): Promise<StoredModelInvocation | null> {
    const path = this.pathFor(identity);
    const record = await readEncryptedJsonFile(
      path,
      this.secureStorage,
      parseStoredModelInvocation,
      { preserveValidationError: true },
    );
    if (!record) return null;
    const expired = expireResponse(record, this.now());
    if (expired !== record) await this.writeUnlocked(expired);
    return expired;
  }

  private async writeUnlocked(record: StoredModelInvocation): Promise<void> {
    if (record.response) {
      await writeEncryptedJsonFile(this.responsePath(record), this.secureStorage, record.response);
    } else if (!record.responseExpiresAt) {
      await rm(this.responsePath(record), { force: true });
    }
    const metadata = { ...record, response: null };
    await writeEncryptedJsonFile(this.pathFor(record), this.secureStorage, metadata);
    this.indexRecord(metadata);
  }

  private indexRecord(record: StoredModelInvocation): void {
    const identity = normalizeIdentity(record);
    const key = memoryKey(identity);
    if (record.taskId) {
      const taskKey = taskMemoryKey(record.subject, record.taskId);
      let entries = this.taskIndex.get(taskKey);
      if (!entries) { entries = new Map(); this.taskIndex.set(taskKey, entries); }
      entries.set(key, identity);
    }
    if (record.responseExpiresAt) {
      this.responseExpirations.set(key, { identity, expiresAt: Date.parse(record.responseExpiresAt) || 0 });
    } else {
      this.responseExpirations.delete(key);
    }
  }

  private responsePath(identity: ModelInvocationIdentity): string {
    return join(this.directory, "responses", basename(this.pathFor(identity)));
  }

  private pathFor(identity: ModelInvocationIdentity): string {
    const digest = createHash("sha256")
      .update(identity.subject)
      .update("\0")
      .update(identity.operation)
      .update("\0")
      .update(identity.idempotencyKey)
      .digest("hex");
    return join(this.directory, "invocations", `${digest}.bin`);
  }

  private taskPath(subject: string, taskId: string): string {
    const digest = createHash("sha256")
      .update(subject)
      .update("\0")
      .update(taskId)
      .digest("hex");
    return join(this.directory, "tasks", `${digest}.bin`);
  }

  private withLock<T>(
    identity: ModelInvocationIdentity,
    action: () => Promise<T>,
  ): Promise<T> {
    return this.initialize().then(() => this.withSerializedLock(memoryKey(identity), action));
  }

  private async withSerializedLock<T>(
    key: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const previous = this.lockTails.get(key) ?? Promise.resolve();
    let release: () => void = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.lockTails.set(key, current);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.lockTails.get(key) === current) this.lockTails.delete(key);
    }
  }
}

function memoryKey(identity: ModelInvocationIdentity): string {
  return `${identity.subject}\0${identity.operation}\0${identity.idempotencyKey}`;
}

function taskMemoryKey(subject: string, taskId: string): string {
  return `${subject}\0task\0${taskId}`;
}

function normalizeIdentity(input: ModelInvocationIdentity): ModelInvocationIdentity {
  return {
    subject: required(input.subject, "subject"),
    operation: required(input.operation, "operation"),
    idempotencyKey: required(input.idempotencyKey, "idempotencyKey"),
  };
}

function expireResponse(
  record: StoredModelInvocation,
  now: number,
): StoredModelInvocation {
  if (
    !record.responseExpiresAt ||
    Date.parse(record.responseExpiresAt) > now
  ) {
    return record;
  }
  return { ...record, response: null, responseExpiresAt: "" };
}

function parseStoredModelInvocation(value: unknown): StoredModelInvocation {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("invalid model invocation record");
  }
  const source = text(value.routeSource);
  if (source !== "" && source !== "cloud" && source !== "byok") {
    throw new Error("invalid model invocation route source");
  }
  const state = text(value.state) as LocalModelInvocationState;
  if (!["PENDING", "IN_FLIGHT", "SUCCEEDED", "FAILED", "OUTCOME_UNKNOWN"].includes(state)) {
    throw new Error("invalid model invocation state");
  }
  const response = value.response === null
    ? null
    : parseStoredResponse(value.response);
  return {
    schemaVersion: 1,
    subject: required(value.subject, "subject"),
    operation: required(value.operation, "operation"),
    idempotencyKey: required(value.idempotencyKey, "idempotencyKey"),
    requestHash: text(value.requestHash),
    taskId: text(value.taskId),
    routeKey: text(value.routeKey),
    routeSource: source,
    state,
    cancellationRequested: boolean(value.cancellationRequested),
    cancellationReason: text(value.cancellationReason),
    cancellationRequestedAt: text(value.cancellationRequestedAt),
    response,
    responseExpiresAt: text(value.responseExpiresAt),
    createdAt: required(value.createdAt, "createdAt"),
    updatedAt: required(value.updatedAt, "updatedAt"),
  };
}

function parseStoredTaskCancellation(value: unknown): StoredTaskCancellation {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("invalid task cancellation record");
  }
  return {
    schemaVersion: 1,
    subject: required(value.subject, "subject"),
    taskId: required(value.taskId, "taskId"),
    reason: required(value.reason, "reason"),
    requestedAt: required(value.requestedAt, "requestedAt"),
  };
}

function parseStoredResponse(value: unknown): StoredModelResponse {
  if (!isRecord(value) || !Number.isInteger(value.status)) {
    throw new Error("invalid stored model response");
  }
  const headersValue = value.headers;
  if (!isRecord(headersValue)) throw new Error("invalid stored response headers");
  const headers: Record<string, string> = {};
  for (const [key, item] of Object.entries(headersValue)) {
    headers[key] = text(item);
  }
  return {
    status: value.status as number,
    statusText: text(value.statusText),
    headers,
    bodyBase64: text(value.bodyBase64),
  };
}

function required(value: unknown, name: string): string {
  const result = text(value).trim();
  if (!result) throw new Error(`${name} is required`);
  return result;
}

function optional(value: unknown): string {
  return text(value).trim();
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("expected string");
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("expected boolean");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingPath(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
