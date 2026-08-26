// Copyright (c) 2026 AI anime
import { afterAll, afterEach, beforeAll } from "vitest";

import { server } from "@/__mocks__/msw/server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

export { server };
