// Copyright (c) 2026 AI anime
import { page } from "vitest/browser";
import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import "@/index.css";
import { UiSelect } from "./primitives";

it("closes a select when an outside canvas control stops mouse event bubbling", async () => {
  const screen = await render(<div>
    <UiSelect aria-label="Quality" defaultValue="standard">
      <option value="standard">Standard</option><option value="high">High</option>
    </UiSelect>
    <button type="button" style={{ marginTop: 180 }}
      onMouseDown={(event) => event.stopPropagation()}>Canvas control</button>
  </div>);
  const select = screen.getByRole("button", { name: "Quality" });
  await select.click();
  await expect.element(page.getByRole("listbox", { name: "Quality" })).toBeVisible();
  await screen.getByRole("button", { name: "Canvas control" }).click();
  await expect.element(select).toHaveAttribute("aria-expanded", "false");
  await expect.element(page.getByRole("listbox", { name: "Quality" })).not.toBeInTheDocument();
});
