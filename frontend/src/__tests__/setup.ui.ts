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

if (typeof window.scrollTo !== "function") {
  Object.defineProperty(window, "scrollTo", {
    value: () => undefined,
    writable: true,
    configurable: true,
  });
}

const isHappyDom = navigator.userAgent.includes("HappyDOM/");
const windowStorage =
  typeof window.localStorage?.setItem === "function"
    ? window.localStorage
    : undefined;

if (isHappyDom || !windowStorage) {
  class MemoryStorage implements Storage {
    readonly #store = new Map<string, string>();

    get length() {
      return this.#store.size;
    }

    key(index: number) {
      return [...this.#store.keys()][index] ?? null;
    }

    getItem(key: string) {
      return this.#store.get(String(key)) ?? null;
    }

    setItem(key: string, value: string) {
      this.#store.set(String(key), String(value));
    }

    removeItem(key: string) {
      this.#store.delete(String(key));
    }

    clear() {
      this.#store.clear();
    }
  }

  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "Storage", {
    value: MemoryStorage,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    writable: true,
    configurable: true,
  });
  if (globalThis !== window) {
    Object.defineProperty(window, "Storage", {
      value: MemoryStorage,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "localStorage", {
      value: storage,
      writable: true,
      configurable: true,
    });
  }
} else {
  if (globalThis.Storage !== window.Storage) {
    Object.defineProperty(globalThis, "Storage", {
      value: window.Storage,
      writable: true,
      configurable: true,
    });
  }
  if (globalThis.localStorage !== windowStorage) {
    Object.defineProperty(globalThis, "localStorage", {
      value: windowStorage,
      writable: true,
      configurable: true,
    });
  }
}

if (isHappyDom) {
  // Happy DOM exposes clipboard through a getter-only prototype property,
  // while these tests replace it with a deterministic mock per case.
  Object.defineProperty(navigator, "clipboard", {
    value: navigator.clipboard,
    writable: true,
    configurable: true,
  });

}

// UI tests must opt into a network mock. Keep this guard in both Happy DOM and
// real-browser projects so a migrated browser test cannot call an external API
// accidentally. A test can replace `fetch` explicitly when exercising it.
const rejectUnhandledFetch = () =>
  Promise.reject(new TypeError("Unhandled network request in UI test"));
Object.defineProperty(globalThis, "fetch", {
  value: rejectUnhandledFetch,
  writable: true,
  configurable: true,
});
if (globalThis !== window) {
  Object.defineProperty(window, "fetch", {
    value: rejectUnhandledFetch,
    writable: true,
    configurable: true,
  });
}

if (typeof Element.prototype.getAnimations !== "function") {
  // Base UI waits for subtree animations before measuring scroll areas.
  // Happy DOM has no animation engine, so an empty list is the accurate stub.
  Object.defineProperty(Element.prototype, "getAnimations", {
    value: () => [],
    writable: true,
    configurable: true,
  });
}
