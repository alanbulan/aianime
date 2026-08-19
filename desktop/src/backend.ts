// Copyright (c) 2026 AI anime

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, type WriteStream } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { app } from "electron";
import { resolveHermesRuntimePaths } from "./hermes-runtime.js";
import {
  bundledBackendPath,
  bundledWorldRuntimePath,
  bundledFfmpegPath,
  bundledWhisperModelPath,
  bundledSplatTransformCliPath,
  bundledSplatTransformNodePath,
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

interface LocalBackendOptions {
  repositoryRoot?: string;
  serveFrontend?: boolean;
  environment?: Readonly<Record<string, string>>;
  runtimeDependencyPaths?: InstalledWorldRuntimePaths;
}

export class LocalBackend {
  readonly token = randomBytes(32).toString("hex");
  readonly modelAdminToken = randomBytes(32).toString("hex");
  private readonly configuredRepoRoot: string | undefined;
  private readonly serveFrontend: boolean;
  private readonly environment: Readonly<Record<string, string>>;
  private readonly runtimeDependencyPaths: InstalledWorldRuntimePaths | undefined;
  private child: ChildProcessWithoutNullStreams | null = null;
  private logStream: WriteStream | null = null;
  private stopping = false;
  private _baseUrl: string | null = null;

  constructor(options: LocalBackendOptions = {}) {
    this.configuredRepoRoot = options.repositoryRoot;
    this.serveFrontend = options.serveFrontend ?? true;
    this.environment = options.environment ?? {};
    this.runtimeDependencyPaths = options.runtimeDependencyPaths;
  }

  get baseUrl(): string {
    if (!this._baseUrl) throw new Error("local backend has not started");
    return this._baseUrl;
  }

  get tokenHeader(): string {
    return TOKEN_HEADER;
  }

  async start(): Promise<void> {
    if (this.child) return;
    const launch = this.resolveLaunch();
    const hermesRuntime = resolveHermesRuntimePaths({
      packaged: app.isPackaged,
      repositoryRoot: this.repoRoot(),
      resourcesPath: process.resourcesPath,
    });
    const userData = app.getPath("userData");
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
      "0",
      "--data-root",
      dataRoot,
    ];
    if (launch.frontendDist) args.push("--frontend-dist", launch.frontendDist);
    if (launch.ffmpegPath) args.push("--ffmpeg-path", launch.ffmpegPath);

    const child = spawn(launch.command, args, {
      cwd: app.isPackaged ? app.getPath("userData") : this.repoRoot(),
      env: {
        ...process.env,
        ...(app.isPackaged ? { VIDEO_CODEC: packagedVideoCodec() } : {}),
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
      if (this.child === child) this.child = null;
    });

    const socketEvent = await this.waitForSocket(child);
    this._baseUrl = `http://${socketEvent.host}:${socketEvent.port}`;
    await this.waitForHealth();
  }

  async stop(): Promise<void> {
    if (!this.child || this.stopping) return;
    this.stopping = true;
    const child = this.child;
    try {
      if (this._baseUrl) {
        await fetch(`${this._baseUrl}/__desktop/shutdown`, {
          method: "POST",
          headers: { [TOKEN_HEADER]: this.token },
          signal: AbortSignal.timeout(2_000),
        }).catch(() => undefined);
      }
      await Promise.race([
        new Promise<void>((done) => child.once("exit", () => done())),
        new Promise<void>((done) => setTimeout(done, 4_000)),
      ]);
      if (child.exitCode === null) child.kill();
    } finally {
      // Same guard as the exit handler: never clear a handle that a concurrent
      // start() has already replaced.
      if (this.child === child) this.child = null;
      this._baseUrl = null;
      this.logStream?.end();
      this.logStream = null;
      this.stopping = false;
    }
  }

  async configureModelAccess(input: {
    allowsCustomModels: boolean;
    mode: "mixed";
    modelAssignments?: Array<{
      modelId: string;
      role: string;
      priority: number;
      enabled: boolean;
    }>;
    modelCapabilities?: Array<{
      modelId: string;
      referenceAudioMinSeconds?: number;
      referenceAudioMaxSeconds?: number;
      referenceAudioTotalMinSeconds?: number;
      referenceAudioTotalMaxSeconds?: number;
      referenceVideoMinSeconds?: number;
      referenceVideoMaxSeconds?: number;
      referenceVideoTotalMinSeconds?: number;
      referenceVideoTotalMaxSeconds?: number;
    }>;
  }): Promise<void> {
    const response = await fetch(
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
    if (app.isPackaged) {
      const executable = bundledBackendPath(process.resourcesPath);
      const frontendDist = join(process.resourcesPath, "frontend");
      if (!existsSync(executable)) throw new Error(`bundled backend not found: ${executable}`);
      if (!existsSync(frontendDist)) throw new Error(`bundled frontend not found: ${frontendDist}`);
      const ffmpegPath = bundledFfmpegPath(process.resourcesPath);
      const whisperModelPath = bundledWhisperModelPath(process.resourcesPath);
      const splatTransformCliPath = bundledSplatTransformCliPath(process.resourcesPath);
      const splatTransformNodePath = bundledSplatTransformNodePath(process.resourcesPath);
      const worldRuntimePath = bundledWorldRuntimePath(process.resourcesPath);
      const installed = this.runtimeDependencyPaths;
      const resolvedSplatTransformCliPath = installed?.splatTransformCliPath ?? splatTransformCliPath;
      const resolvedSplatTransformNodePath = installed?.splatTransformNodePath ?? splatTransformNodePath;
      const resolvedWorldRuntimePath = installed?.worldRuntimePath ?? worldRuntimePath;
      return {
        command: executable,
        args: [],
        frontendDist,
        ...(existsSync(ffmpegPath) ? { ffmpegPath } : {}),
        ...(existsSync(whisperModelPath) ? { whisperModelPath } : {}),
        ...(installed || (existsSync(splatTransformCliPath) && existsSync(splatTransformNodePath))
          ? {
              splatTransformCliPath: resolvedSplatTransformCliPath,
              splatTransformNodePath: resolvedSplatTransformNodePath,
            }
          : {}),
        ...(installed || existsSync(worldRuntimePath)
          ? { worldRuntimePath: resolvedWorldRuntimePath }
          : {}),
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
    const developmentFfmpeg = developmentFfmpegPath(app.getAppPath());
    const developmentWhisperModel = developmentWhisperModelPath(app.getAppPath());
    const developmentSplatTransformCli = developmentSplatTransformCliPath(app.getAppPath());
    const developmentSplatTransformNode = developmentSplatTransformNodePath(app.getAppPath());
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
    return this.configuredRepoRoot ?? resolve(app.getAppPath(), "..");
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
        const response = await fetch(`${this.baseUrl}/healthz`, {
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
}
