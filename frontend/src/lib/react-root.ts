// Copyright (c) 2026 AI anime
import { createRoot, type Root } from "react-dom/client";

const REACT_ROOT_KEY = Symbol.for("ai_anime.reactRoot");

type ReactRootContainer = (Element | DocumentFragment) & {
  [REACT_ROOT_KEY]?: Root;
};

export function getOrCreateReactRoot(container: Element | DocumentFragment): Root {
  const rootContainer = container as ReactRootContainer;
  const existing = rootContainer[REACT_ROOT_KEY];
  if (existing) return existing;
  const root = createRoot(container);
  rootContainer[REACT_ROOT_KEY] = root;
  return root;
}
