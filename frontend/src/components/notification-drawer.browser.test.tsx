// Copyright (c) 2026 AI anime
import { useState } from "react";
import i18next from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { NotificationDrawer } from "./notification-drawer";

const notice = vi.hoisted(() => ({
  title: "更新公告：完整内容与阅读状态",
  body: [
    "本次更新修复公告无法打开，以及阅读后通知提示未消失的问题。",
    ...Array.from({ length: 16 }, (_, index) => `第 ${index + 1} 项更新说明：公告正文保留段落和换行，可以在窗口内滚动阅读，不会被两行摘要截断。`),
    `长文本换行检查：https://example.test/${"announcement".repeat(24)}`,
    '<img src="invalid" onerror="alert(1)">',
    "公告全文结束。",
  ].join("\n\n"),
}));

vi.mock("@/modules/platform_release/public", () => ({
  useCommercialAnnouncements: () => ({
    data: { items: [{ id: "notice-1", ...notice, publishAt: "2026-09-24T00:00:00Z" }], total: 1 },
    isLoading: false,
    error: null,
  }),
}));

function Fixture() {
  const [open, setOpen] = useState(false);
  return <>
    <h1>项目管理中心</h1>
    <button type="button" onClick={() => setOpen(true)}>打开通知中心</button>
    <NotificationDrawer open={open} onOpenChange={setOpen} />
  </>;
}

async function openNotifications() {
  await page.getByRole("button", { name: "打开通知中心" }).click();
  const drawer = page.getByRole("complementary", { name: "通知中心" });
  await expect.element(drawer).toBeVisible();
  // Wait for the actual slide-in geometry, not just a mounted, still-moving row.
  await expect.poll(() => Math.round(drawer.element().getBoundingClientRect().right))
    .toBe(window.innerWidth);
}

beforeEach(async () => {
  i18next.addResourceBundle("zh", "translation", {
    notifications: {
      title: "通知中心",
      close: "关闭通知中心",
      closeAnnouncement: "关闭公告",
      announcementBody: "公告内容",
    },
  }, true, true);
  await i18next.changeLanguage("zh");
  await page.viewport(960, 720);
  document.documentElement.style.setProperty("--desktop-title-bar-height", "36px");
});

afterEach(() => {
  document.documentElement.style.removeProperty("--desktop-title-bar-height");
  document.documentElement.classList.remove("dark");
});

for (const theme of ["light", "dark"] as const) {
  it(`全文弹窗在${theme === "light" ? "浅色" : "深色"}主题可滚动且位于通知列表上方`, async () => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    await render(<Fixture />);
    await openNotifications();
    await page.getByRole("button", { name: notice.title }).click();
    const dialog = page.getByRole("dialog", { name: notice.title });
    await expect.element(dialog).toBeVisible();
    const body = page.getByRole("region", { name: "公告内容" });
    expect(body.element().textContent).toBe(notice.body);
    expect(body.element().querySelector("img")).toBeNull();
    expect(getComputedStyle(body.element()).whiteSpace).toBe("pre-wrap");
    expect(body.element().scrollHeight).toBeGreaterThan(body.element().clientHeight);
    expect(body.element().scrollWidth).toBeLessThanOrEqual(body.element().clientWidth);
    const level = Number(dialog.element().closest("[data-ui-overlay-level]")?.getAttribute("data-ui-overlay-level"));
    expect(level).toBeGreaterThan(1000);
    const rect = dialog.element().getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    expect(dialog.element().contains(top)).toBe(true);
    await page.screenshot({ path: `../.codex-tmp/announcement-detail-${theme}.png` });
    body.element().scrollTop = body.element().scrollHeight;
    expect(body.element().scrollTop).toBeGreaterThan(0);
    await page.getByRole("button", { name: "关闭公告", exact: true }).click();
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(page.getByRole("complementary", { name: "通知中心" })).toBeVisible();
    await page.getByRole("button", { name: notice.title }).click();
    await expect.element(dialog).toBeVisible();
    await page.getByRole("button", { name: "关闭公告", exact: true }).click();
    await expect.element(dialog).not.toBeInTheDocument();
  });
}

it("窄矮窗口完整展示公告，键盘可打开且 Escape 只关闭最上层", async () => {
  await page.viewport(400, 360);
  await render(<Fixture />);
  await openNotifications();
  const row = page.getByRole("button", { name: notice.title });
  await expect.element(row).toBeVisible();
  row.element().focus();
  await userEvent.keyboard("{Enter}");
  const dialog = page.getByRole("dialog", { name: notice.title });
  await expect.element(dialog).toBeVisible();
  const bounds = dialog.element().getBoundingClientRect();
  expect(bounds.left).toBeGreaterThanOrEqual(15);
  expect(bounds.right).toBeLessThanOrEqual(385);
  expect(bounds.top).toBeGreaterThanOrEqual(51);
  expect(bounds.bottom).toBeLessThanOrEqual(345);
  const body = page.getByRole("region", { name: "公告内容" });
  expect(body.element().clientHeight).toBeGreaterThan(40);
  expect(body.element().scrollWidth).toBeLessThanOrEqual(body.element().clientWidth);
  await page.screenshot({ path: "../.codex-tmp/announcement-detail-small.png" });
  await userEvent.keyboard("{Escape}");
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(row).toBeVisible();
  await expect.element(row).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("complementary", { name: "通知中心" })).not.toBeInTheDocument();
});
