// Copyright (c) 2026 AI anime
export interface SaveErrorBody {
  detail?: { code?: unknown };
}

export function saveErrorStatusAndBody(error: unknown): {
  status: number | null;
  body: SaveErrorBody | undefined;
} {
  if (typeof error !== "object" || error === null) {
    return { status: null, body: undefined };
  }
  const status = (error as { status?: unknown }).status;
  const body = (error as { body?: unknown }).body;
  return {
    status: typeof status === "number" ? status : null,
    body: body as SaveErrorBody | undefined,
  };
}
