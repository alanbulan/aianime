// Copyright (c) 2026 AI anime
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import * as ts from "typescript/unstable/ast";
import { API } from "typescript/unstable/sync";
import { afterAll, describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(process.cwd(), "src");
const TOOLTIP_PRIMITIVES = new Set([
  "Button",
  "SelectTrigger",
  "UiButton",
  "UiCheckbox",
  "UiChipButton",
  "UiIconButton",
]);

function productionTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : productionTsxFiles(path);
    }
    return entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")
      ? [path]
      : [];
  });
}

const typeScriptApi = new API({ cwd: process.cwd() });
let typeScriptSnapshot: ReturnType<API["updateSnapshot"]> | undefined;

function parseSourceFile(path: string): ts.SourceFile {
  typeScriptSnapshot ??= typeScriptApi.updateSnapshot({
    openFiles: [resolve(SOURCE_ROOT, "main.tsx")],
  });
  const project = typeScriptSnapshot.getDefaultProjectForFile(path);
  const source = project?.program.getSourceFile(path);
  if (!source) throw new Error(`TypeScript could not parse ${path}`);
  return source;
}

afterAll(() => {
  typeScriptSnapshot?.dispose();
  typeScriptApi.close();
});

function location(source: ts.SourceFile, node: ts.Node): string {
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
  return `${relative(SOURCE_ROOT, source.fileName)}:${line + 1}`;
}

describe("native tooltip boundary", () => {
  it("keeps browser-native title attributes out of rendered HTML", () => {
    const violations: string[] = [];

    for (const file of productionTsxFiles(SOURCE_ROOT)) {
      const source = parseSourceFile(file);

      const visit = (node: ts.Node) => {
        if (
          ts.isJsxAttribute(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === "title"
        ) {
          const opening = node.parent.parent;
          const tag =
            (ts.isJsxOpeningElement(opening) ||
              ts.isJsxSelfClosingElement(opening)) &&
            opening.tagName.getText(source);
          if (
            tag &&
            (tag[0] === tag[0].toLowerCase() || TOOLTIP_PRIMITIVES.has(tag))
          ) {
            violations.push(location(source, node));
          }
        }
        node.forEachChild(visit);
      };

      visit(source);
    }

    expect(violations).toEqual([]);
  });
});
