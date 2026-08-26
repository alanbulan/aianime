// PlayCanvas uses `self` in browser workers and falls back to Node's
// `worker_threads` only outside browsers. Keep that unreachable fallback
// resolvable so Vite does not emit a Node builtin into the renderer bundle.
export const parentPort = undefined;
