// Copyright (c) 2026 AI anime
import { randomUUID } from "node:crypto";
import { CommercialApiError } from "./commercial-api-error.js";
import { exactMicroPoints, type CommercialMeteredQuote } from "./commercial-metered-billing.js";

/** Display-only IPC data. Quote identity, request hash and budget remain in main. */
export interface CommercialBudgetPrompt {
  requestId: string;
  modelCode: string;
  modelName: string;
  estimatedMicroPoints: string;
  maximumMicroPoints: string;
  tenantMultiplier: string;
  policyVersion: number;
  expiresAt: string;
  estimateOnly: boolean;
}

export interface CommercialBudgetState {
  revision: number;
  pendingCount: number;
  request: CommercialBudgetPrompt | null;
}

interface PendingBudget {
  prompt: CommercialBudgetPrompt;
  signal: AbortSignal;
  abort: () => void;
  timer: ReturnType<typeof setTimeout>;
  resolve: (accepted: boolean) => void;
}

/** One ordered confirmation queue, owned by main, never a native OS message box. */
export class MeteredBudgetDialog {
  private readonly pending: PendingBudget[] = [];
  private revision = 0;

  constructor(
    private readonly notify: (state: CommercialBudgetState) => boolean,
    private readonly now: () => number = Date.now,
  ) {}

  snapshot(): CommercialBudgetState {
    return {
      revision: this.revision,
      pendingCount: this.pending.length,
      request: this.pending[0] ? { ...this.pending[0].prompt } : null,
    };
  }

  confirm(quote: CommercialMeteredQuote, signal: AbortSignal): Promise<boolean> {
    const expires = Date.parse(quote.expiresAt);
    if (signal.aborted || !Number.isFinite(expires) || expires <= this.now() || this.pending.length >= 32) {
      return Promise.resolve(false);
    }
    const prompt: CommercialBudgetPrompt = {
      requestId: randomUUID(), modelCode: quote.modelCode,
      modelName: quote.publicModelName.replace(/[\u0000-\u001f\u007f]/gu, " ").slice(0, 180),
      estimatedMicroPoints: exactMicroPoints(quote.estimatedMicroPoints),
      maximumMicroPoints: exactMicroPoints(quote.maximumMicroPoints),
      tenantMultiplier: quote.tenantMultiplier, policyVersion: quote.policyVersion,
      expiresAt: quote.expiresAt, estimateOnly: quote.estimateOnly,
    };
    return new Promise<boolean>((resolve) => {
      const abort = () => this.finish(prompt.requestId, false);
      // An unattended request cannot hold the queue indefinitely.
      const timer = setTimeout(abort, Math.min(expires - this.now(), 10 * 60_000));
      this.pending.push({ prompt, signal, abort, timer, resolve });
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      else this.publish();
    });
  }

  respond(input: unknown): { applied: boolean } {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw this.invalidDecision();
    const value = input as Record<string, unknown>;
    if (Object.keys(value).length !== 2 || Object.keys(value).some((key) => key !== "requestId" && key !== "decision") || typeof value.requestId !== "string"
      || (value.decision !== "accept" && value.decision !== "cancel")) throw this.invalidDecision();
    const entry = this.pending[0];
    if (!entry || entry.prompt.requestId !== value.requestId) return { applied: false };
    const valid = !entry.signal.aborted && Date.parse(entry.prompt.expiresAt) > this.now();
    this.finish(value.requestId, valid && value.decision === "accept");
    return { applied: valid };
  }

  clear(): void {
    this.reset();
    this.publish();
  }

  private reset(): void {
    for (const entry of this.pending.splice(0)) {
      clearTimeout(entry.timer);
      entry.signal.removeEventListener("abort", entry.abort);
      entry.resolve(false);
    }
  }

  private finish(id: string, accepted: boolean): void {
    const index = this.pending.findIndex((entry) => entry.prompt.requestId === id);
    if (index < 0) return;
    const [entry] = this.pending.splice(index, 1);
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.signal.removeEventListener("abort", entry.abort);
    entry.resolve(accepted);
    this.publish();
  }

  private publish(): void {
    this.revision++;
    let delivered = false;
    try { delivered = this.notify(this.snapshot()); } catch { /* Window vanished: never approve. */ }
    if (!delivered) { this.reset(); this.revision++; }
  }

  private invalidDecision(): CommercialApiError {
    return new CommercialApiError("消费确认只能提交请求编号和确认或取消，不允许修改报价", { status: 400 });
  }
}
