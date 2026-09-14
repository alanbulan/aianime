// Copyright (c) 2026 AI anime
import { useState } from "react";
import { page, userEvent } from "vitest/browser";
import { beforeEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import "@/index.css";
import { VideoConfigChip, type VideoConfigPatch } from "./VideoConfigChip";

const referenceSizeLabel = "Reference image encoding size";

function H3ConfigFixture({ onChange }: { onChange: (patch: VideoConfigPatch) => void }) {
  const [extraParams, setExtraParams] = useState<Record<string, unknown>>({
    reference_image_size: "match",
    seed: 42,
  });

  return (
    <div style={{ paddingTop: 650, paddingLeft: 40 }}>
      <button
        type="button"
        style={{ position: "fixed", top: 20, right: 20 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        Outside control
      </button>
      <VideoConfigChip
        aspectRatio="16:9"
        aspectRatioOptions={["16:9", "9:16", "21:9"]}
        outputValue="1024x576"
        outputOptions={["1024x576", "576x1024", "1344x576"]}
        outputParameter="size"
        extraParamDefinitions={[{
          key: "reference_image_size",
          label: "reference_image_size",
          type: "enum",
          defaultValue: "match",
          options: [{ value: "match", label: "match" }, { value: "max", label: "max" }],
        }]}
        extraParams={extraParams}
        durationSec={15}
        durationBounds={{ min: 1, max: 15 }}
        durationOptions={[]}
        normalizeDuration={(value) => Math.min(15, Math.max(1, value))}
        sceneOptimizeOptions={[]}
        generateAudio={false}
        supportsGenerateAudio={false}
        onChange={(patch) => {
          if (patch.extraParams) setExtraParams(patch.extraParams);
          onChange(patch);
        }}
      />
    </div>
  );
}

beforeEach(async () => {
  await page.viewport(960, 900);
});

it("selects and retains H3 max from the portaled menu without closing the config panel", async () => {
  const onChange = vi.fn();
  const screen = await render(<H3ConfigFixture onChange={onChange} />);
  await screen.getByRole("button", { name: /Size 1024x576/ }).click();
  const select = screen.getByRole("button", { name: referenceSizeLabel });
  await select.click();
  const max = page.getByRole("option", { name: "max", exact: true });
  await expect.element(max).toBeEnabled();
  await max.click();

  expect(onChange).toHaveBeenLastCalledWith({
    extraParams: { reference_image_size: "max", seed: 42 },
  });
  await expect.element(select).toHaveTextContent("max");
  await expect.element(screen.getByText("高级模型参数")).toBeVisible();
  await select.click();
  await expect.element(page.getByRole("option", { name: "max", exact: true }))
    .toHaveAttribute("aria-selected", "true");
  await page.getByRole("option", { name: "match", exact: true }).click();
  await expect.element(select).toHaveTextContent("match");
});

it("still closes the config and its menu when an outside control stops bubbling", async () => {
  const screen = await render(<H3ConfigFixture onChange={vi.fn()} />);
  await screen.getByRole("button", { name: /Size 1024x576/ }).click();
  await screen.getByRole("button", { name: referenceSizeLabel }).click();
  await expect.element(page.getByRole("option", { name: "max", exact: true })).toBeVisible();
  await screen.getByRole("button", { name: "Outside control" }).click();
  await expect.element(screen.getByText("高级模型参数")).not.toBeInTheDocument();
  await expect.element(page.getByRole("option", { name: "max", exact: true })).not.toBeInTheDocument();
});

it("can also choose max with the keyboard", async () => {
  const onChange = vi.fn();
  const screen = await render(<H3ConfigFixture onChange={onChange} />);
  await screen.getByRole("button", { name: /Size 1024x576/ }).click();
  const select = screen.getByRole("button", { name: referenceSizeLabel });
  await select.click();
  await userEvent.keyboard("{ArrowDown}");
  expect(onChange).toHaveBeenLastCalledWith({
    extraParams: { reference_image_size: "max", seed: 42 },
  });
  await expect.element(select).toHaveTextContent("max");
});

it("keeps the complete H3 panel and max menu inside a small viewport above a clipped, zoomed canvas", async () => {
  await page.viewport(420, 360);
  const onChange = vi.fn();
  const screen = await render(<div data-testid="zoomed-canvas" style={{
    position: "fixed", left: 8, bottom: 12, width: 400, height: 38,
    overflow: "hidden", transform: "scale(0.75)", transformOrigin: "left bottom",
  }}><VideoConfigChip
    aspectRatio="16:9" aspectRatioOptions={["16:9", "9:16", "21:9"]}
    outputValue="1360x768" outputOptions={["1360x768", "768x1360", "1024x1024"]} outputParameter="size"
    durationSec={5} durationBounds={{ min: 1, max: 15 }} durationOptions={[]}
    normalizeDuration={(n) => n} sceneOptimizeOptions={[]} generateAudio={false} supportsGenerateAudio={false}
    extraParams={{ reference_image_size: "match", seed: 42, steps: 8, turbo: true }}
    extraParamDefinitions={[
      { key: "seed", label: "seed", type: "number", defaultValue: 42 },
      { key: "steps", label: "steps", type: "number", defaultValue: 8 },
      { key: "turbo", label: "turbo", type: "boolean", defaultValue: true },
      { key: "reference_image_size", label: "reference_image_size", type: "enum", defaultValue: "match",
        description: "Ref2VA 参考图编码尺寸：match 匹配输出像素面积，max 保留最高 2048 短边。",
        options: [{ value: "match", label: "match" }, { value: "max", label: "max" }] },
    ]} onChange={onChange}
  /></div>);
  const trigger = screen.getByRole("button", { name: /Size 1360x768/ });
  await trigger.click();
  const panel = page.getByTestId("video-config-panel");
  await expect.element(panel).toBeVisible();
  const bounds = panel.element().getBoundingClientRect();
  expect(bounds.top).toBeGreaterThanOrEqual(8);
  expect(bounds.bottom).toBeLessThanOrEqual(352);
  expect(bounds.right).toBeLessThanOrEqual(412);
  expect(panel.element().scrollHeight).toBeGreaterThan(panel.element().clientHeight);
  await page.getByRole("button", { name: referenceSizeLabel }).click();
  const max = page.getByRole("option", { name: "max", exact: true });
  await expect.element(max).toBeVisible();
  const menuBounds = page.getByRole("listbox").element().getBoundingClientRect();
  expect(menuBounds.top).toBeGreaterThanOrEqual(8);
  expect(menuBounds.bottom).toBeLessThanOrEqual(352);
  await max.click();
  expect(onChange).toHaveBeenCalledWith({ extraParams: { reference_image_size: "max", seed: 42, steps: 8, turbo: true } });
  screen.getByTestId("zoomed-canvas").element().style.transform = "translate(60px, -50px) scale(0.75)";
  await expect.poll(() => Math.round(panel.element().getBoundingClientRect().bottom))
    .toBe(Math.round(trigger.element().getBoundingClientRect().top - 8));
});
