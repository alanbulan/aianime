// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  scanImportSpecifiers,
  scanNativeTitleAttributePositions,
} from "./source-inspection";

describe("lightweight source inspection", () => {
  it("collects every static import and re-export form", () => {
    const source = [
      'import value from "./default";',
      'import type { Model } from "./types";',
      'import "./side-effect";',
      'export { helper } from "./named-export";',
      'export * from "./star-export";',
      'const text = `import("./not-an-import")`;',
      '// import ignored from "./comment";',
    ].join("\n");

    expect(scanImportSpecifiers(source, {
      includeDynamicImports: false,
      jsx: false,
    })).toEqual([
      "./default",
      "./types",
      "./side-effect",
      "./named-export",
      "./star-export",
    ]);
  });

  it("includes dynamic imports only when requested", () => {
    const source = [
      'import value from "./static";',
      'const lazy = () => import("./lazy");',
      'const nested = import("./nested").then((module) => module.value);',
    ].join("\n");

    expect(scanImportSpecifiers(source, {
      includeDynamicImports: false,
      jsx: false,
    })).toEqual(["./static"]);
    expect(scanImportSpecifiers(source, {
      includeDynamicImports: true,
      jsx: false,
    })).toEqual(["./static", "./lazy", "./nested"]);
  });

  it("continues scanning imports through TSX syntax", () => {
    const source = [
      'import { Button } from "./button";',
      "const view = <Button>{condition ? <span /> : null}</Button>;",
      'const lazy = () => import("./dialog");',
    ].join("\n");

    expect(scanImportSpecifiers(source, {
      includeDynamicImports: true,
      jsx: true,
    })).toEqual(["./button", "./dialog"]);
  });

  it("finds title attributes on intrinsic elements and named primitives", () => {
    const source = [
      '<button title="native" />',
      '<UiButton {...props} title={label} />',
      '<Menu.Button title />',
      '<Panel title="ordinary component prop" />',
    ].join("\n");

    expect(scanNativeTitleAttributePositions(
      source,
      new Set(["UiButton", "Menu.Button"]),
    )).toEqual([
      source.indexOf("title"),
      source.indexOf("title", source.indexOf("UiButton")),
      source.indexOf("title", source.indexOf("Menu.Button")),
    ]);
  });

  it("ignores similarly named attributes and title keys inside expressions", () => {
    const source = [
      '<div data-title="metadata" aria-title="accessible name" />',
      '<button data={{ title: "metadata" }} title="native" />',
      '<Panel config={{ title: "nested" }} title="component prop" />',
    ].join("\n");

    expect(scanNativeTitleAttributePositions(source, new Set())).toEqual([
      source.indexOf('title="native"'),
    ]);
  });

  it("walks past nested JSX expression delimiters to the owning tag", () => {
    const source = [
      "<button",
      "  onClick={() => ({ title: condition ? 'a' : 'b' })}",
      "  disabled={left < right}",
      '  title="native"',
      "/>",
    ].join("\n");

    expect(scanNativeTitleAttributePositions(source, new Set())).toEqual([
      source.lastIndexOf("title"),
    ]);
  });
});
