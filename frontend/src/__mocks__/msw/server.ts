// Copyright (c) 2026 AI anime
import { setupServer } from "msw/node";
import { handlers } from "./handlers/tasks";

export const server = setupServer(...handlers);
