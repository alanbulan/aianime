// Copyright (c) 2026 AI anime

export class CommercialApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly requestId: string | null;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string | null;
      requestId?: string | null;
    } = {},
  ) {
    super(message);
    this.name = "CommercialApiError";
    this.status = options.status ?? 0;
    this.code = options.code ?? null;
    this.requestId = options.requestId ?? null;
  }
}
