// Copyright (c) 2026 AI anime

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, type WriteStream } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { resolveHermesRuntimePaths } from "./hermes-runtime.js";
import type { CommercialModelCapabilitySnapshot } from "./commercial-contracts.js";
import {
  bundledBackendPath,
  bundledFfmpegPath,
  bundledWhisperModelPath,
  developmentSplatTransformCliPath,
  developmentSplatTransformNodePath,
  developmentFfmpegPath,
  developmentWhisperModelPath,
  packagedVideoCodec,
} from "./platform-runtime.js";
import type { InstalledWorldRuntimePaths } from "./platform-runtime.js";

const EVENT_PREFIX = "AI_ANIME_DESKTOP ";
const TOKEN_HEADER = "X-AI-Anime-Desktop-Token";
const START_TIMEOUT_MS = 120_000;
const HEALTH_CHECK_INTERVAL_MS = 10_000;
const HEALTH_CHECK_TIMEOUT_MS = 2_000;
const HEALTH_CHECK_FAILURE_THRESHOLD = 3;
export const MAX_BACKEND_RESTART_ATTEMPTS = 5;
const RESTART_STABILITY_WINDOW_MS = 60_000;

interface SocketBoundEvent {
  event: "socket_bound";
  host: string;
  port: number;
}

interface BackendLaunch {
  command: string;
  args: string[];
  frontendDist?: string;
  ffmpegPath?: string;
  whisperModelPath?: string;
  splatTransformCliPath?: string;
  splatTransformNodePath?: string;
  worldRuntimePath?: string;
}

interface DesktopAppRuntime {
  readonly isPackaged: boolean;
  getAppPath(): string;
  getPath(name: "userData"): string;
}

interface LocalBackendOptions {
  desktopApp: DesktopAppRuntime;
  repositoryRoot?: string;
  serveFrontend?: boolean;
  environment?: Readonly<Record<string, string>>;
  runtimeDependencyPaths?: InstalledWorldRuntimePaths;
  restartOnUnexpectedExit?: boolean;
  fetchImpl?: typeof fetch;
  onRestartExhausted?: (error: Error) => void;
}

interface ModelAccessInput {
  allowsCustomModels: boolean;
  mode: "mixed";
  modelAssignments?: Array<{
    modelId: string;
    role: string;
    priority: number;
    enabled: boolean;
    contextWindow?: number;
    maxOutputTokens?: number;
    reasoningEfforts?: string[];
    defaultReasoningEffort?: string;
  }>;
  modelCapabilities?: CommercialModelCapabilitySnapshot[];
}

export class LocalBackend {
  readonly token = randomBytes(32).toString("hex");
  readonly modelAdminToken = randomBytes(32).toString("hex");
  private readonly desktopApp: DesktopAppRuntime;
  private readonly configuredRepoRoot: string | undefined;
  private readonly serveFrontend: boolean;
  private readonly environment: Readonly<Record<string, string>>;
  private readonly runtimeDependencyPaths: InstalledWorldRuntimePaths | undefined;
  private readonly restartOnUnexpectedExit: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly onRestartExhausted: ((error: Error) => void) | undefined;
  private child: ChildProcessWithoutNullStreams | null = null;
  private readyChild: ChildProcessWithoutNullStreams | null = null;
  private logStream: WriteStream | null = null;
  private stopping = false;
  private _baseUrl: string | null = null;
  private boundPort: number | null = null;
  private startPromise: Promise<void> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private restartStabilityTimer: ReturnType<typeof setTimeout> | null = null;
  private restartStabilityChild: ChildProcessWithoutNullStreams | null = null;
  private restartAttempts = 0;
  private restartExhausted = false;
  private hasStarted = false;
  private modelAccess: ModelAccessInput | null = null;
  private healthCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private healthCheckChild: ChildProcessWithoutNullStreams | null = null;
  private healthCheckFailures = 0;

  constructor(options: LocalBackendOptions) {
    this.desktopApp = options.desktopApp;
    this.configuredRepoRoot = options.repositoryRoot;
    this.serveFrontend = options.serveFrontend ?? true;
    this.environment = options.environment ?? {};
    this.runtimeDependencyPaths = options.runtimeDependencyPaths;
    this.restartOnUnexpectedExit = options.restartOnUnexpectedExit ?? false;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.onRestartExhausted = options.onRestartExhausted;
  }

  get baseUrl(): string {
    if (!this._baseUrl) throw new Error("local backend has not started");
    return this._baseUrl;
  }

  get tokenHeader(): string {
    return TOKEN_HEADER;
  }

  async start(): Promise<void> {
    if (this.readyChild && this.child === this.readyChild) return;
    if (this.startPromise) return this.startPromise;
    if (this.stopping) throw new Error("local backend is stopping");
    const pending = this.startOnce();
    this.startPromise = pending;
    try {
      await pending;
    } finally {
      if (this.startPromise === pending) this.startPromise = null;
    }
  }

  private async startOnce(): Promise<void> {
    const launch = this.resolveLaunch();
    const hermesRuntime = resolveHermesRuntimePaths({
      packaged: this.desktopApp.isPackaged,
      repositoryRoot: this.repoRoot(),
      resourcesPath: process.resourcesPath,
    });
    const userData = this.desktopApp.getPath("userData");
    const dataRoot = join(userData, "data");
    const logDir = join(userData, "logs");
    mkdirSync(dataRoot, { recursive: true });
    mkdirSync(logDir, { recursive: true });
    this.logStream = createWriteStream(join(logDir, "backend.log"), {
      flags: "a",
      encoding: "utf8",
    });

    const args = [
      ...launch.args,
      "--host",
      "127.0.0.1",
      "--port",
      String(this.boundPort ?? 0),
      "--data-root",
      dataRoot,
    ];
    if (launch.frontendDist) args.push("--frontend-dist", launch.frontendDist);
    if (launch.ffmpegPath) args.push("--ffmpeg-path", launch.ffmpegPath);

    const child = spawn(launch.command, args, {
      cwd: this.desktopApp.isPackaged
        ? this.desktopApp.getPath("userData")
        : this.repoRoot(),
      env: {
        ...process.env,
        ...(this.desktopApp.isPackaged
          ? { VIDEO_CODEC: packagedVideoCodec() }
          : {}),
        HF_ENDPOINT: process.env.HF_ENDPOINT?.trim() || "https://hf-mirror.com",
        HF_HUB_DISABLE_XET: process.env.HF_HUB_DISABLE_XET?.trim() || "1",
        ...this.environment,
        AI_ANIME_DESKTOP_TOKEN: this.token,
        AI_ANIME_MODEL_ADMIN_TOKEN: this.modelAdminToken,
        HERMES_CLI_PATH: hermesRuntime.cliPath,
        AI_ANIME_HERMES_ASSETS_DIR: hermesRuntime.assetsPath,
        ...(launch.whisperModelPath
          ? { AI_ANIME_WHISPER_MODEL_DIR: launch.whisperModelPath }
          : {}),
        ...(launch.splatTransformCliPath && launch.splatTransformNodePath
          ? {
              AI_ANIME_SPLAT_TRANSFORM_BIN: launch.splatTransformCliPath,
              AI_ANIME_SPLAT_TRANSFORM_NODE: launch.splatTransformNodePath,
            }
          : {}),
        ...(launch.worldRuntimePath
          ? { AI_ANIME_WORLD_RUNTIME_BIN: launch.worldRuntimePath }
          : {}),
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
        PYTHONUNBUFFERED: "1",
      },
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin.end();
    this.child = child;
    child.stdout.on("data", (chunk: Buffer) => this.writeLog(chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => this.writeLog(chunk.toString()));
    child.once("exit", (code, signal) => {
      this.writeLog(`backend exited code=${String(code)} signal=${String(signal)}\n`);
      // Only clear the handle if it still refers to *this* child. A
      // stop()→start() sequence can install a replacement before the old
      // child's exit fires, and clearing unconditionally would orphan the new
      // process by making stop() a no-op.
      const exitedAfterReady = this.readyChild === child;
      this.stopHealthWatchdog(child);
      this.clearRestartStabilityTimer(child);
      if (this.child === child) {
        this.child = null;
        this.readyChild = null;
        this.endLogStream();
      }
      if (exitedAfterReady && !this.stopping && this.restartOnUnexpectedExit) {
        this.terminateChildTree(child);
        this.scheduleRestart(
          new Error(
            `backend exited unexpectedly code=${String(code)} signal=${String(signal)}`,
          ),
        );
      }
    });

    try {
      const socketEvent = await this.waitForSocket(child);
      this.boundPort = socketEvent.port;
      this._baseUrl = `http://${socketEvent.host}:${socketEvent.port}`;
      await this.waitForHealth();
      if (this.modelAccess) await this.postModelAccess(this.modelAccess);
      this.readyChild = child;
      this.startHealthWatchdog(child);
      const restarted = this.hasStarted;
      this.hasStarted = true;
      if (restarted) {
        this.scheduleRestartBudgetReset(child);
        this.writeLog("backend restart completed\n");
      } else {
        this.resetRestartBudget();
      }
    } catch (error) {
      this.terminateChildTree(child);
      if (this.child === child) {
        this.stopHealthWatchdog(child);
        this.child = null;
        this.readyChild = null;
        this.endLogStream();
      }
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    this.stopHealthWatchdog();
    this.clearRestartStabilityTimer();
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const child = this.child;
    try {
      if (child && this._baseUrl) {
        await this.fetchImpl(`${this._baseUrl}/__desktop/shutdown`, {
          method: "POST",
          headers: { [TOKEN_HEADER]: this.token },
          signal: AbortSignal.timeout(2_000),
        }).catch(() => undefined);
      }
      if (child) {
        await Promise.race([
          new Promise<void>((done) => child.once("exit", () => done())),
          new Promise<void>((done) => setTimeout(done, 4_000)),
        ]);
        this.terminateChildTree(child);
      }
    } finally {
      // Same guard as the exit handler: never clear a handle that a concurrent
      // start() has already replaced.
      if (this.child === child) this.child = null;
      if (this.readyChild === child) this.readyChild = null;
      this._baseUrl = null;
      this.endLogStream();
      this.stopping = false;
    }
  }

  async configureModelAccess(input: ModelAccessInput): Promise<void> {
    const snapshot: ModelAccessInput = {
      ...input,
      ...(input.modelAssignments
        ? {
            modelAssignments: input.modelAssignments.map((item) => ({
              ...item,
              ...(item.reasoningEfforts
                ? { reasoningEfforts: [...item.reasoningEfforts] }
                : {}),
            })),
          }
        : {}),
      ...(input.modelCapabilities
        ? {
            modelCapabilities: input.modelCapabilities.map((item) => ({
              ...item,
              ...(item.imageRatioOptions
                ? { imageRatioOptions: [...item.imageRatioOptions] }
                : {}),
              ...(item.imageSizeOptions
                ? { imageSizeOptions: [...item.imageSizeOptions] }
                : {}),
              ...(item.videoRatioOptions
                ? { videoRatioOptions: [...item.videoRatioOptions] }
                : {}),
              ...(item.videoResolutionOptions
                ? { videoResolutionOptions: [...item.videoResolutionOptions] }
                : {}),
              ...(item.videoSizeOptions
                ? { videoSizeOptions: [...item.videoSizeOptions] }
                : {}),
              ...(item.videoExtraParameterNames
                ? {
                    videoExtraParameterNames: [
                      ...item.videoExtraParameterNames,
                    ],
                  }
                : {}),
              ...(item.videoSceneOptimizeOptions
                ? {
                    videoSceneOptimizeOptions: [
                      ...item.videoSceneOptimizeOptions,
                    ],
                  }
                : {}),
              ...(item.videoDurationOptions
                ? { videoDurationOptions: [...item.videoDurationOptions] }
                : {}),
            })),
          }
        : {}),
    };
    this.modelAccess = snapshot;
    await this.postModelAccess(snapshot);
  }

  private async postModelAccess(input: ModelAccessInput): Promise<void> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/api/v1/model-gateway/internal/capability`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [TOKEN_HEADER]: this.token,
          "X-AI-Anime-Model-Admin-Token": this.modelAdminToken,
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) {
      throw new Error(`model capability update returned HTTP ${response.status}`);
    }
  }

  private resolveLaunch(): BackendLaunch {
    if (this.desktopApp.isPackaged) {
      const executable = bundledBackendPath(process.resourcesPath);
      const frontendDist = join(process.resourcesPath, "frontend");
      if (!existsSync(executable)) throw new Error(`bundled backend not found: ${executable}`);
      if (!existsSync(frontendDist)) throw new Error(`bundled frontend not found: ${frontendDist}`);
      const ffmpegPath = bundledFfmpegPath(process.resourcesPath);
      const whisperModelPath = bundledWhisperModelPath(process.resourcesPath);
      const installed = this.runtimeDependencyPaths;
      return {
        command: executable,
        args: [],
        frontendDist,
        ...(existsSync(ffmpegPath) ? { ffmpegPath } : {}),
        ...(existsSync(whisperModelPath) ? { whisperModelPath } : {}),
        ...(installed
          ? {
              splatTransformCliPath: installed.splatTransformCliPath,
              splatTransformNodePath: installed.splatTransformNodePath,
            }
          : {}),
        ...(installed ? { worldRuntimePath: installed.worldRuntimePath } : {}),
      };
    }

    let frontendDist: string | undefined;
    if (this.serveFrontend) {
      frontendDist = join(this.repoRoot(), "frontend", "dist");
      if (!existsSync(frontendDist)) {
        throw new Error(`frontend build not found: ${frontendDist}`);
      }
    }
    const configuredFfmpeg = process.env.FFMPEG_PATH?.trim();
    const appPath = this.desktopApp.getAppPath();
    const developmentFfmpeg = developmentFfmpegPath(appPath);
    const developmentWhisperModel = developmentWhisperModelPath(appPath);
    const developmentSplatTransformCli = developmentSplatTransformCliPath(appPath);
    const developmentSplatTransformNode = developmentSplatTransformNodePath(appPath);
    const ffmpegPath = configuredFfmpeg || (existsSync(developmentFfmpeg) ? developmentFfmpeg : undefined);
    return {
      command: process.env.AI_ANIME_UV_COMMAND?.trim() || "uv",
      args: ["run", "python", "-m", "ai_anime.desktop_server"],
      ...(frontendDist ? { frontendDist } : {}),
      ...(ffmpegPath ? { ffmpegPath } : {}),
      ...(existsSync(developmentWhisperModel)
        ? { whisperModelPath: developmentWhisperModel }
        : {}),
      ...(existsSync(developmentSplatTransformCli) && existsSync(developmentSplatTransformNode)
        ? {
            splatTransformCliPath: developmentSplatTransformCli,
            splatTransformNodePath: developmentSplatTransformNode,
          }
        : {}),
    };
  }

  private repoRoot(): string {
    return this.configuredRepoRoot ?? resolve(this.desktopApp.getAppPath(), "..");
  }

  private waitForSocket(child: ChildProcessWithoutNullStreams): Promise<SocketBoundEvent> {
    return new Promise((resolveSocket, rejectSocket) => {
      const lines = createInterface({ input: child.stdout });
      const timeout = setTimeout(() => {
        lines.close();
        rejectSocket(new Error("local backend did not bind a port before timeout"));
      }, START_TIMEOUT_MS);

      const fail = (error: Error) => {
        clearTimeout(timeout);
        lines.close();
        child.off("error", fail);
        child.off("exit", onExit);
        rejectSocket(error);
      };
      const onExit = (code: number | null) => {
        fail(new Error(`local backend exited during startup (${String(code)})`));
      };
      child.once("error", fail);
      child.once("exit", onExit);
      lines.on("line", (line) => {
        if (!line.startsWith(EVENT_PREFIX)) return;
        try {
          const event = JSON.parse(line.slice(EVENT_PREFIX.length)) as Partial<SocketBoundEvent>;
          if (event.event !== "socket_bound" || typeof event.host !== "string" || typeof event.port !== "number") return;
          clearTimeout(timeout);
          child.off("error", fail);
          child.off("exit", onExit);
          lines.close();
          resolveSocket(event as SocketBoundEvent);
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }

  private async waitForHealth(): Promise<void> {
    const deadline = Date.now() + START_TIMEOUT_MS;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        const response = await this.fetchImpl(`${this.baseUrl}/healthz`, {
          headers: { [TOKEN_HEADER]: this.token },
          signal: AbortSignal.timeout(2_000),
        });
        if (response.ok) return;
        lastError = new Error(`health check returned HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      await new Promise((done) => setTimeout(done, 250));
    }
    throw new Error(`local backend health check timed out: ${String(lastError)}`);
  }

  private writeLog(line: string): void {
    this.logStream?.write(line);
  }

  private endLogStream(): void {
    this.logStream?.end();
    this.logStream = null;
  }

  private startHealthWatchdog(child: ChildProcessWithoutNullStreams): void {
    this.stopHealthWatchdog();
    this.healthCheckChild = child;
    this.healthCheckFailures = 0;
    this.scheduleHealthCheck(child);
  }

  private stopHealthWatchdog(
    child?: ChildProcessWithoutNullStreams,
  ): void {
    if (child && this.healthCheckChild !== child) return;
    if (this.healthCheckTimer) {
      clearTimeout(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    this.healthCheckChild = null;
    this.healthCheckFailures = 0;
  }

  private scheduleHealthCheck(child: ChildProcessWithoutNullStreams): void {
    if (
      this.stopping ||
      this.healthCheckTimer ||
      this.healthCheckChild !== child ||
      this.readyChild !== child ||
      this.child !== child ||
      child.exitCode !== null
    ) {
      return;
    }
    this.healthCheckTimer = setTimeout(() => {
      this.healthCheckTimer = null;
      void this.checkHealth(child);
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private async checkHealth(child: ChildProcessWithoutNullStreams): Promise<void> {
    if (
      this.stopping ||
      this.healthCheckChild !== child ||
      this.readyChild !== child ||
      this.child !== child ||
      child.exitCode !== null ||
      !this._baseUrl
    ) {
      return;
    }

    let failure: unknown = null;
    try {
      const response = await this.fetchImpl(`${this._baseUrl}/healthz`, {
        headers: { [TOKEN_HEADER]: this.token },
        signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
      });
      if (!response.ok) {
        failure = new Error(`health check returned HTTP ${response.status}`);
      }
    } catch (error) {
      failure = error;
    }

    if (failure === null) {
      this.healthCheckFailures = 0;
      this.scheduleHealthCheck(child);
      return;
    }

    this.healthCheckFailures += 1;
    this.writeLog(
      `backend health check failed (${this.healthCheckFailures}/${HEALTH_CHECK_FAILURE_THRESHOLD}): ${String(failure)}\n`,
    );
    if (this.healthCheckFailures >= HEALTH_CHECK_FAILURE_THRESHOLD) {
      this.writeLog("backend health watchdog terminating unresponsive process\n");
      console.error(
        "[backend] health watchdog terminating unresponsive process:",
        failure instanceof Error ? failure.message : String(failure),
      );
      this.terminateChildTree(child);
    }
    this.scheduleHealthCheck(child);
  }

  private terminateChildTree(child: ChildProcessWithoutNullStreams): void {
    terminateBackendProcessTree(child);
  }

  private scheduleRestart(lastError?: unknown): void {
    if (this.stopping || this.restartTimer || !this.restartOnUnexpectedExit) return;
    if (this.restartAttempts >= MAX_BACKEND_RESTART_ATTEMPTS) {
      this.exhaustRestartBudget(lastError);
      return;
    }
    const attempt = this.restartAttempts + 1;
    this.restartAttempts = attempt;
    const delayMs = backendRestartDelayMs(attempt);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.stopping) return;
      void this.start().catch((error) => {
        console.error(
          `[backend] restart attempt ${attempt} failed:`,
          error instanceof Error ? error.message : String(error),
        );
        this.scheduleRestart(error);
      });
    }, delayMs);
  }

  private scheduleRestartBudgetReset(child: ChildProcessWithoutNullStreams): void {
    this.clearRestartStabilityTimer();
    this.restartStabilityChild = child;
    this.restartStabilityTimer = setTimeout(() => {
      this.restartStabilityTimer = null;
      this.restartStabilityChild = null;
      if (this.stopping || this.readyChild !== child || this.child !== child) return;
      this.resetRestartBudget();
      this.writeLog("backend restart stability window completed\n");
    }, RESTART_STABILITY_WINDOW_MS);
  }

  private clearRestartStabilityTimer(
    child?: ChildProcessWithoutNullStreams,
  ): void {
    if (child && this.restartStabilityChild !== child) return;
    if (this.restartStabilityTimer) clearTimeout(this.restartStabilityTimer);
    this.restartStabilityTimer = null;
    this.restartStabilityChild = null;
  }

  private resetRestartBudget(): void {
    this.restartAttempts = 0;
    this.restartExhausted = false;
  }

  private exhaustRestartBudget(lastError?: unknown): void {
    if (this.restartExhausted) return;
    this.restartExhausted = true;
    const detail = lastError instanceof Error
      ? lastError.message
      : String(lastError || "unknown restart failure");
    const error = new Error(
      `local backend stopped after ${MAX_BACKEND_RESTART_ATTEMPTS} restart attempts: ${detail}`,
    );
    this.writeLog(`${error.message}\n`);
    console.error(`[backend] ${error.message}`);
    this.onRestartExhausted?.(error);
  }
}

export function backendRestartDelayMs(attempt: number): number {
  const normalizedAttempt = Math.max(1, Math.trunc(attempt));
  return Math.min(
    500 * 2 ** Math.min(normalizedAttempt - 1, 5),
    10_000,
  );
}

export function terminateBackendProcessTree(
  child: ChildProcessWithoutNullStreams,
  platform: NodeJS.Platform = process.platform,
  spawnImpl: typeof spawn = spawn,
  killImpl: typeof process.kill = process.kill,
): void {
  if (platform !== "win32") {
    if (!child.pid) {
      if (child.exitCode === null) child.kill();
      return;
    }
    try {
      killImpl(-child.pid, "SIGTERM");
    } catch {
      if (child.exitCode === null) child.kill();
    }
    return;
  }
  if (child.exitCode !== null) return;
  if (!child.pid) {
    child.kill();
    return;
  }
  const killer = spawnImpl(
    "taskkill",
    ["/PID", String(child.pid), "/T", "/F"],
    { windowsHide: true, stdio: "ignore" },
  );
  const fallback = () => {
    if (child.exitCode === null) child.kill();
  };
  killer.once("error", fallback);
  killer.once("exit", fallback);
}
