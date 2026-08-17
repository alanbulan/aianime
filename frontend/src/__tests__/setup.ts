// Copyright (c) 2026 AI anime
import "@testing-library/jest-dom/vitest";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";

if (!i18next.isInitialized) {
  void i18next.use(initReactI18next).init({
    lng: "zh",
    fallbackLng: "zh",
    initAsync: false,
    interpolation: { escapeValue: false },
    resources: { zh: { translation: {} } },
  });
}

// jsdom does not implement scrolling. Components may legitimately request it
// after a dialog opens, so provide the browser method instead of logging a
// false failure during otherwise unrelated interaction tests.
Object.defineProperty(window, "scrollTo", {
  value: () => undefined,
  writable: true,
  configurable: true,
});

// jsdom v29 + Node.js >=22 exposes a broken localStorage (plain object without
// Storage methods) when --localstorage-file is not set. Provide a spec-compliant
// in-memory replacement so zustand/persist and other code that relies on
// localStorage.setItem / getItem / removeItem works correctly in tests.
if (typeof globalThis.localStorage === "undefined" || typeof globalThis.localStorage.setItem !== "function") {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };

  Object.defineProperty(globalThis, "localStorage", { value: storage, writable: true, configurable: true });
  Object.defineProperty(window, "localStorage", { value: storage, writable: true, configurable: true });
}

import { server } from "@/__mocks__/msw/server";
import { beforeAll, afterAll, afterEach } from "vitest";

// `bypass` (not `error`): the repo has test files that own their own `setupServer`
// instance (e.g. render-plan.test.tsx). With two MSW instances listening, `error`
// from the global server would reject requests the test-local server would handle.
// `bypass` lets non-matching requests pass through to other interceptors or fail
// naturally, without MSW crying foul.
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
