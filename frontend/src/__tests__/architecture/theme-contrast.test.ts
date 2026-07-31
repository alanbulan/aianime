import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const THEME_SOURCE = readFileSync(
  resolve(process.cwd(), "src/app/styles/themes.css"),
  "utf8",
);

const TEXT_PAIRS = [
  ["background", "foreground"],
  ["card", "card-foreground"],
  ["popover", "popover-foreground"],
  ["primary", "primary-foreground"],
  ["secondary", "secondary-foreground"],
  ["muted", "muted-foreground"],
  ["accent", "accent-foreground"],
  ["destructive", "destructive-foreground"],
  ["success", "success-foreground"],
  ["warning", "warning-foreground"],
  ["sidebar", "sidebar-foreground"],
  ["sidebar-primary", "sidebar-primary-foreground"],
  ["sidebar-accent", "sidebar-accent-foreground"],
  ["media-surface", "media-foreground"],
] as const;

const BOUNDARY_PAIRS = [
  ["background", "border"],
  ["background", "input"],
  ["background", "ring"],
  ["card", "border"],
  ["card", "input"],
  ["sidebar", "sidebar-border"],
] as const;

type ThemeTokens = Record<string, string>;

function tokensForSelector(selector: ":root" | ".dark"): ThemeTokens {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = THEME_SOURCE.match(
    new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`),
  )?.[1];
  if (!block) throw new Error(`Missing ${selector} theme block`);

  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[\da-fA-F]{6});/g)].map(
      ([, name, value]) => [name, value.toLowerCase()],
    ),
  );
}

function relativeLuminance(color: string): number {
  const channels = color
    .slice(1)
    .match(/.{2}/g)
    ?.map((value) => Number.parseInt(value, 16) / 255);
  if (!channels || channels.length !== 3) {
    throw new Error(`Expected a six-digit hex color, received ${color}`);
  }
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(
    relativeLuminance(first),
    relativeLuminance(second),
  );
  const darker = Math.min(
    relativeLuminance(first),
    relativeLuminance(second),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function assertPairs(
  mode: "light" | "dark",
  tokens: ThemeTokens,
  pairs: readonly (readonly [string, string])[],
  minimum: number,
) {
  const failures = pairs.flatMap(([background, foreground]) => {
    const backgroundColor = tokens[background];
    const foregroundColor = tokens[foreground];
    if (!backgroundColor || !foregroundColor) {
      return [`${mode}: missing --${background} or --${foreground}`];
    }
    const ratio = contrastRatio(backgroundColor, foregroundColor);
    return ratio < minimum
      ? [
          `${mode}: --${foreground} on --${background} is ${ratio.toFixed(2)}:1, expected at least ${minimum}:1`,
        ]
      : [];
  });
  expect(failures).toEqual([]);
}

describe("theme contrast contract", () => {
  const light = tokensForSelector(":root");
  const dark = { ...light, ...tokensForSelector(".dark") };

  it.each([
    ["light", light],
    ["dark", dark],
  ] as const)("keeps %s text tokens readable", (mode, tokens) => {
    assertPairs(mode, tokens, TEXT_PAIRS, 4.5);
  });

  it.each([
    ["light", light],
    ["dark", dark],
  ] as const)("keeps %s control boundaries visible", (mode, tokens) => {
    assertPairs(mode, tokens, BOUNDARY_PAIRS, 3);
  });
});
