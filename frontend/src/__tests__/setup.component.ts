// Copyright (c) 2026 AI anime
import {
  ReadableStream,
  TransformStream,
  WritableStream,
} from "node:stream/web";
import { BroadcastChannel } from "node:worker_threads";

// Vitest's VM pools create a fresh context that does not inherit every Web API
// exposed by Node. MSW and application code expect these standards-compatible
// globals, so fill only the APIs missing from the selected DOM environment.
const nodeWebApis = {
  BroadcastChannel,
  ReadableStream,
  TransformStream,
  WritableStream,
};

for (const [name, implementation] of Object.entries(nodeWebApis)) {
  if (!(name in globalThis)) {
    Object.defineProperty(globalThis, name, {
      value: implementation,
      writable: true,
      configurable: true,
    });
  }
}
