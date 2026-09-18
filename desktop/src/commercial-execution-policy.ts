import { CommercialApiError } from "./commercial-api-error.js";

export interface CommercialExecutionPolicy {
  apiMaxInflight: number;
  desktopGeneralConcurrency: number;
  desktopGeneralQueue: number;
  desktopVideoConcurrency: number;
  desktopVideoQueue: number;
  version: number;
  activeApiRequests: number;
  updatedAt: string;
}

export type DesktopExecutionPolicy = Pick<CommercialExecutionPolicy,
  "desktopGeneralConcurrency" | "desktopGeneralQueue" | "desktopVideoConcurrency" | "desktopVideoQueue" | "version">;

export function parseExecutionPolicy(input: unknown): CommercialExecutionPolicy {
  const bounds: Record<string, readonly [number, number]> = {
    apiMaxInflight: [1, 512], desktopGeneralConcurrency: [1, 16], desktopGeneralQueue: [0, 256],
    desktopVideoConcurrency: [1, 8], desktopVideoQueue: [0, 256],
    version: [0, Number.MAX_SAFE_INTEGER], activeApiRequests: [0, Number.MAX_SAFE_INTEGER],
  };
  const keys = [...Object.keys(bounds), "updatedAt"];
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalid();
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))
    || typeof value.updatedAt !== "string" || (value.updatedAt !== "" && !Number.isFinite(Date.parse(value.updatedAt)))) throw invalid();
  for (const [key, [min, max]] of Object.entries(bounds)) {
    const number = value[key];
    if (typeof number !== "number" || !Number.isSafeInteger(number) || number < min || number > max) throw invalid();
  }
  return { ...value } as unknown as CommercialExecutionPolicy;
}

export function desktopExecutionPolicy(policy: CommercialExecutionPolicy): DesktopExecutionPolicy {
  return {
    desktopGeneralConcurrency: policy.desktopGeneralConcurrency, desktopGeneralQueue: policy.desktopGeneralQueue,
    desktopVideoConcurrency: policy.desktopVideoConcurrency, desktopVideoQueue: policy.desktopVideoQueue, version: policy.version,
  };
}

function invalid(): CommercialApiError {
  return new CommercialApiError("任务调度策略格式无效，请检查服务端与客户端版本", { status: 422 });
}

/** A dedicated main-process channel, not part of model-capability/balance data. */
export class ExecutionPolicySync {
  private epoch = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending: Promise<void> | null = null;
  private applyChain = Promise.resolve();
  private last = "";
  private lastScope = "";
  private lastVersion = -1;

  constructor(
    private readonly read: () => Promise<CommercialExecutionPolicy>,
    private readonly scope: () => Promise<string>,
    private readonly apply: (policy: DesktopExecutionPolicy | null) => Promise<void>,
  ) {}

  async start(): Promise<void> {
    if (!this.timer) {
      this.timer = setInterval(() => { void this.refresh().catch(() => {
        console.warn("[commercial] task policy refresh failed; previous verified policy retained");
      }); }, 30_000);
      this.timer.unref();
    }
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (this.pending) return this.pending;
    const epoch = this.epoch;
    const current = (async () => {
      const scope = await this.scope();
      const policy = desktopExecutionPolicy(parseExecutionPolicy(await this.read()));
      if (epoch !== this.epoch || scope !== await this.scope()) return;
      const signature = scope + ":" + JSON.stringify(policy);
      if (signature === this.last) return;
      if (scope === this.lastScope && policy.version <= this.lastVersion) throw invalid();
      const job = this.applyChain.catch(() => {}).then(async () => {
        if (epoch !== this.epoch) return;
        await this.apply(policy);
        if (epoch === this.epoch) { this.last = signature; this.lastScope = scope; this.lastVersion = policy.version; }
      });
      this.applyChain = job;
      await job;
    })();
    this.pending = current;
    try { await current; } finally { if (this.pending === current) this.pending = null; }
  }

  async reset(): Promise<void> {
    this.epoch++;
    if (this.timer) clearInterval(this.timer);
    this.timer = null; this.last = ""; this.lastScope = ""; this.lastVersion = -1; this.pending = null;
    const job = this.applyChain.catch(() => {}).then(() => this.apply(null));
    this.applyChain = job;
    await job;
  }
}
