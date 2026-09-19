import { useState } from "react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import "@/index.css";
import { CommercialBudgetPrompt } from "./CommercialBudgetDialog";
import type { BudgetPrompt } from "../domain/budget-confirmation";

const i18n = createInstance();
declare const __BUDGET_CONFIRMATION_LOCALES__: Record<string, { translation: { budgetConfirmation: Record<string, string> } }>;
await i18n.init({ lng: "zh", resources: __BUDGET_CONFIRMATION_LOCALES__, interpolation: { escapeValue: false } });

const prompt = (extra: Partial<BudgetPrompt> = {}): BudgetPrompt => ({
  requestId: "11111111-1111-4111-8111-111111111111", modelCode: "MINIMAX_H3", modelName: "MiniMax H3 (Self-hosted)",
  estimatedMicroPoints: "2160000000", maximumMicroPoints: "2160000000", policyVersion: 2,
  tenantMultiplier: "1.000000000000000000", expiresAt: new Date(Date.now() + 60_000).toISOString(), estimateOnly: true, ...extra,
});

function Fixture({ request = prompt(), decide = async () => true }: { request?: BudgetPrompt; decide?: (id: string, decision: "accept" | "cancel") => Promise<boolean> }) {
  const [open, setOpen] = useState(true);
  return <I18nextProvider i18n={i18n}>
    <div style={{ position: "relative", isolation: "isolate", zIndex: 0 }}><div style={{ position: "fixed", inset: 0, zIndex: 10000 }}>画布</div></div>
    {open && <CommercialBudgetPrompt request={request} pendingCount={2} decide={async (id, decision) => { const applied = await decide(id, decision); if (applied) setOpen(false); return applied; }} />}
  </I18nextProvider>;
}

beforeEach(async () => { await page.viewport(1440, 920); await i18n.changeLanguage("zh"); });
afterEach(() => document.documentElement.classList.remove("dark"));

it("shows the reported image quote as 2.175 creation points without changing authorization", async () => {
  const request = prompt({ modelName: "Qwen-Image-2512 / Qwen-Image-Edit-2511", estimatedMicroPoints: "217500000", maximumMicroPoints: "217500000" });
  const decide = vi.fn(async () => true);
  await render(<Fixture request={request} decide={decide} />);
  const dialog = page.getByRole("dialog");
  await expect.element(dialog).toHaveTextContent("2.175");
  await expect.element(dialog).toHaveTextContent("创作点");
  await expect.element(dialog).not.toHaveTextContent("217.5");
  await page.screenshot({ path: "../.codex-tmp/creation-points-budget-confirmation.png" });
  await page.getByRole("button", { name: "确认预算并继续" }).click();
  expect(decide).toHaveBeenCalledExactlyOnceWith(request.requestId, "accept");
  expect(request.maximumMicroPoints).toBe("217500000");
});

for (const theme of ["light", "dark"]) it(`uses framework portal above the canvas and shows exact budget in ${theme}`, async () => {
  document.documentElement.classList.toggle("dark", theme === "dark");
  const decide = vi.fn(async () => true);
  await render(<Fixture decide={decide} />);
  const dialog = page.getByRole("dialog");
  await expect.element(dialog).toBeVisible();
  await expect.element(dialog).toHaveTextContent("21.6");
  await expect.element(dialog).toHaveTextContent("创作点");
  await expect.element(dialog).toHaveTextContent("倍率 1×");
  await expect.element(dialog).not.toHaveTextContent("1.000000000000000000");
  const accept = page.getByRole("button", { name: "确认预算并继续" });
  const rect = accept.element().getBoundingClientRect();
  expect(accept.element().contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))).toBe(true);
  await expect.poll(() => document.activeElement?.textContent).toBe("取消");
  await page.screenshot({ path: `../.codex-tmp/budget-confirmation-${theme}.png` });
  await accept.click();
  expect(decide).toHaveBeenCalledExactlyOnceWith(prompt().requestId, "accept");
  await expect.element(dialog).not.toBeInTheDocument();
});

it("Escape and the close button cancel instead of submitting generation", async () => {
  const decide = vi.fn(async () => true);
  const first = await render(<Fixture decide={decide} />);
  await userEvent.keyboard("{Escape}");
  await expect.poll(() => decide.mock.calls.length).toBe(1);
  expect(decide.mock.calls[0]).toEqual([prompt().requestId, "cancel"]);
  await first.unmount();
  await render(<Fixture decide={decide} />);
  await page.getByRole("button", { name: "取消并关闭" }).click();
  expect(decide.mock.calls[1]).toEqual([prompt().requestId, "cancel"]);
});

it("disables duplicate decisions while acknowledging and handles a bridge failure", async () => {
  let reject!: (reason: Error) => void;
  const decide = vi.fn(() => new Promise<boolean>((_resolve, fail) => { reject = fail; }));
  await render(<Fixture decide={decide} />);
  const accept = page.getByRole("button", { name: "确认预算并继续" });
  await accept.click();
  await expect.element(accept).toBeDisabled();
  await expect.element(page.getByRole("button", { name: "取消", exact: true })).toBeDisabled();
  reject(new Error("test transport failure"));
  await expect.element(page.getByRole("alert")).toHaveTextContent("确认状态暂时无法同步");
  expect(decide).toHaveBeenCalledTimes(1);
});

it("never enables acceptance after expiry, and long names fit a narrow viewport", async () => {
  await page.viewport(390, 640);
  const decide = vi.fn(async () => true);
  await render(<Fixture request={prompt({ modelName: "视频模型".repeat(40), expiresAt: new Date(Date.now() - 1).toISOString() })} decide={decide} />);
  const dialog = page.getByRole("dialog");
  const rect = dialog.element().getBoundingClientRect();
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.right).toBeLessThanOrEqual(390);
  expect(rect.bottom).toBeLessThanOrEqual(640);
  await expect.element(page.getByRole("button", { name: "确认预算并继续" })).toBeDisabled();
  expect(decide).not.toHaveBeenCalled();
});

it("English does not fall back to technical translation keys", async () => {
  await i18n.changeLanguage("en");
  await render(<Fixture request={prompt({ maximumMicroPoints: "9000000000000000" })} />);
  await expect.element(page.getByRole("dialog")).toHaveTextContent("90,000,000");
  await expect.element(page.getByRole("button", { name: "Authorize and continue" })).toBeVisible();
  await expect.element(page.getByRole("dialog")).not.toHaveTextContent("budgetConfirmation.");
});
