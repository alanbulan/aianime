// Copyright (c) 2026 AI anime
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "../..");
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.[tj]sx?$/.test(file) && !file.includes("test") ? [file] : [];
  });
}

it("全局弹层只通过共享所有者创建，原生门户仅保留页面插槽用途", () => {
  const directPortalOwners = sourceFiles(sourceRoot).filter((file) =>
    /import\s*\{[^}]*\bcreatePortal\b[^}]*\}\s*from\s*["']react-dom/.test(readFileSync(file, "utf8")),
  ).map((file) => relative(sourceRoot, file).replace(/\\/g, "/")).sort();
  expect(directPortalOwners).toEqual([
    "components/assets/asset-header-actions-slot.tsx",
    "components/layout/header.tsx",
    "components/ui/overlay.tsx",
    "modules/narrative_planning/presentation/BeatsPageView.tsx",
  ]);
  for (const owner of directPortalOwners.filter((file) => file !== "components/ui/overlay.tsx")) {
    expect(readFileSync(resolve(sourceRoot, owner), "utf8")).not.toMatch(/createPortal\([\s\S]*?document\.body/);
  }
});
