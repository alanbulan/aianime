// Copyright (c) 2026 AI anime
import { useState } from "react";
import { page } from "vitest/browser";
import { beforeEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import "@/index.css";
import type { ImageModelDefinition } from "../domain/imageModelDefinition";
import { ModelParamsControls } from "./ModelParamsControls";

const aspect = { value: "1:1", label: "1:1" };
const resolution = { value: "1024", label: "1024" };

function Fixture({ edge, onChange }: {
  edge: "center" | "edge";
  onChange: (key: string, value: unknown) => void;
}) {
  const [params, setParams] = useState<Record<string, unknown>>({});
  const model: ImageModelDefinition = {
    id: "test-image", mediaType: "image", displayName: "Test image", description: "", eta: "",
    defaultAspectRatio: "1:1", defaultResolution: "1024",
    aspectRatios: [aspect], resolutions: [resolution],
    resolveRequest: () => ({ requestModel: "test-image", modeLabel: "Image" }),
    extraParamsSchema: ["quality", "thinking_level"].map((key) => ({
      key, label: key, type: "enum", defaultValue: "standard",
      options: [{ value: "standard", label: "Standard" }, { value: "high", label: "High" }],
    })),
  };
  return (
    <div style={{ paddingTop: 480, paddingLeft: edge === "edge" ? 850 : 240 }}>
      <button type="button" style={{ position: "fixed", top: 20, right: 20 }}
        onMouseDown={(event) => event.stopPropagation()}>Outside control</button>
      <ModelParamsControls
        imageModels={[model]} selectedModel={model}
        resolutionOptions={[resolution]} selectedResolution={resolution}
        selectedAspectRatio={aspect} aspectRatioOptions={[aspect]}
        onModelChange={() => {}} onResolutionChange={() => {}} onAspectRatioChange={() => {}}
        extraParams={params}
        onExtraParamChange={(key, value) => {
          setParams((previous) => ({ ...previous, [key]: value }));
          onChange(key, value);
        }}
      />
    </div>
  );
}

beforeEach(async () => { await page.viewport(960, 900); });

for (const edge of ["center", "edge"] as const) {
  for (const key of ["quality", "thinking_level"]) {
    it(`keeps ${edge} ${key} panel open after selecting a portaled option`, async () => {
      const onChange = vi.fn();
      const screen = await render(<Fixture edge={edge} onChange={onChange} />);
      await screen.getByRole("button", { name: key === "quality" ? "1:1 · 1024" : "modelParams.otherParams" }).click();
      const select = page.getByRole("button", { name: key, exact: true });
      await select.click();
      await page.getByRole("option", { name: "High", exact: true }).click();
      expect(onChange).toHaveBeenLastCalledWith(key, "high");
      await expect.element(select).toHaveTextContent("High");
      // Wait out the parent's exit animation by reopening and selecting again.
      await select.click();
      await expect.element(page.getByRole("option", { name: "High", exact: true }))
        .toHaveAttribute("aria-selected", "true");
      await screen.getByRole("button", { name: "Outside control" }).click();
      await expect.element(select).not.toBeInTheDocument();
    });
  }
}
