// Copyright (c) 2026 AI anime

export class StalePoolSelectError extends Error {
  readonly stale = true;

  constructor(message: string) {
    super(message);
    this.name = "StalePoolSelectError";
  }
}
