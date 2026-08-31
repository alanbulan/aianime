// Copyright (c) 2026 AI anime
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { scanNativeTitleAttributePositions } from "./source-inspection";

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

function location(path: string, source: string, position: number): string {
  const line = source.slice(0, position).split(/\r?\n/u).length;
  return `${relative(SOURCE_ROOT, path)}:${line}`;
}

describe("native tooltip boundary", () => {
  it("detects native and primitive title attributes", () => {
    const source = [
      '<button title="native" />',
      '<UiButton title="primitive" />',
      "<button title />",
      '<Panel title="component prop" />',
    ].join("\n");

    expect(
      scanNativeTitleAttributePositions(source, TOOLTIP_PRIMITIVES),
    ).toHaveLength(3);
  });

  it("keeps browser-native title attributes out of rendered HTML", () => {
    const violations: string[] = [];

    for (const file of productionTsxFiles(SOURCE_ROOT)) {
      const source = readFileSync(file, "utf8");
      let positions: number[];
      try {
        positions = scanNativeTitleAttributePositions(
          source,
          TOOLTIP_PRIMITIVES,
        );
      } catch (error) {
        const detail = error instanceof Error ? `: ${error.message}` : "";
        throw new Error(
          `Could not scan ${relative(SOURCE_ROOT, file)}${detail}`,
        );
      }
      violations.push(
        ...positions.map((position) => location(file, source, position)),
      );
    }

    expect(violations).toEqual([]);
  });
});
