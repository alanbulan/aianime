// Copyright (c) 2026 AI anime
import { useState } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import "@/index.css";
import { OverlayPortal } from "./overlay";
import { UiSelect, UiModal } from "./primitives";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./select";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "./dropdown-menu";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogCancel } from "./alert-dialog";
import { AppTitleTooltip } from "./app-title-tooltip";

function hit(element: Element) {
  const rect = element.getBoundingClientRect();
  return element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
}
function Choices() {
  return <>
    <UiSelect aria-label="参考图像尺寸" defaultValue="match">
      <option value="match">match</option><option value="max">max</option>
    </UiSelect>
    <Select defaultValue="a"><SelectTrigger aria-label="平台模型"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="a">模型 A</SelectItem><SelectItem value="b">模型 B</SelectItem></SelectContent>
    </Select>
    <DropdownMenu><DropdownMenuTrigger>更多操作</DropdownMenuTrigger><DropdownMenuContent>
      <DropdownMenuSub><DropdownMenuSubTrigger>导出</DropdownMenuSubTrigger><DropdownMenuSubContent>
        <DropdownMenuItem>导出原文件</DropdownMenuItem>
      </DropdownMenuSubContent></DropdownMenuSub>
    </DropdownMenuContent></DropdownMenu>
    <button data-ui-tooltip="弹窗内提示说明">查看提示</button>
  </>;
}
afterEach(() => { document.documentElement.style.removeProperty("--desktop-title-bar-height"); });
beforeEach(async () => { await page.viewport(960, 720); });

it("菜单在自定义弹窗上方可点击，背景再高的局部层级也不能覆盖弹窗", async () => {
  const screen = await render(<>
    <div style={{ position: "relative", isolation: "isolate", zIndex: 0 }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 10000 }}>画布背景</div>
    </div>
    <UiModal isOpen title="模型设置" onClose={() => {}}><Choices /></UiModal>
  </>);
  await screen.getByRole("button", { name: "参考图像尺寸" }).click();
  const max = page.getByRole("option", { name: "max", exact: true });
  await expect.poll(() => hit(max.element())).toBe(true);
  await max.click();
  await expect.element(screen.getByRole("button", { name: "参考图像尺寸" })).toHaveTextContent("max");
  await screen.getByRole("combobox", { name: "平台模型" }).click();
  const model = page.getByRole("option", { name: "模型 B" });
  await expect.poll(() => hit(model.element())).toBe(true);
  await model.click();
  await expect.element(screen.getByRole("combobox", { name: "平台模型" })).toHaveTextContent("模型 B");
});

it("标准弹窗内菜单、子菜单和委托提示都遵循所属弹窗层级", async () => {
  const screen = await render(<><Dialog defaultOpen><DialogContent><DialogTitle>设置</DialogTitle><Choices /></DialogContent></Dialog><AppTitleTooltip /></>);
  await screen.getByRole("button", { name: "更多操作" }).click();
  await page.getByRole("menuitem", { name: "导出", exact: true }).hover();
  const item = page.getByRole("menuitem", { name: "导出原文件", exact: true });
  await expect.element(item).toBeVisible();
  await expect.poll(() => hit(item.element())).toBe(true);
  await item.click();
  await screen.getByRole("button", { name: "查看提示" }).hover();
  const tooltip = page.getByRole("tooltip");
  await expect.element(tooltip).toHaveTextContent("弹窗内提示说明");
  const level = Number(tooltip.element().closest("[data-ui-overlay-level]")?.getAttribute("data-ui-overlay-level"));
  expect(level).toBeGreaterThan(1000);
});

it("嵌套确认框覆盖父弹窗和它已展开的菜单，关闭后可继续操作父弹窗", async () => {
  function Fixture() {
    const [confirm, setConfirm] = useState(false);
    return <UiModal isOpen title="父弹窗" onClose={() => {}}>
      <Choices />
      <button onClick={() => setConfirm(true)}>确认操作</button>
      <AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent>
        <AlertDialogTitle>最终确认</AlertDialogTitle><AlertDialogCancel>返回编辑</AlertDialogCancel>
      </AlertDialogContent></AlertDialog>
    </UiModal>;
  }
  const screen = await render(<Fixture />);
  const parentElement = screen.getByRole("button", { name: "参考图像尺寸" }).element();
  await screen.getByRole("button", { name: "确认操作" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect.poll(() => hit(confirm.element())).toBe(true);
  const parent = screen.getByRole("button", { name: "参考图像尺寸" });
  expect(hit(parentElement)).toBe(false);
  await page.getByRole("button", { name: "返回编辑" }).click();
  await parent.click();
  await page.getByRole("option", { name: "max", exact: true }).click();
});

it("弹层空白区域不会吞掉背景点击，普通菜单不会覆盖后打开的模态框", async () => {
  const screen = await render(<>
    <OverlayPortal><div style={{ position: "fixed", left: 20, top: 20 }}>普通浮层</div></OverlayPortal>
    <Dialog><DialogTrigger style={{ position: "fixed", left: 30, top: 100 }}>打开设置</DialogTrigger>
      <DialogContent><DialogTitle>覆盖浮层的设置</DialogTitle></DialogContent>
    </Dialog>
  </>);
  await screen.getByRole("button", { name: "打开设置" }).click();
  const rect = screen.getByText("普通浮层").element().getBoundingClientRect();
  const top = document.elementFromPoint(rect.left + 2, rect.top + 2);
  expect(top?.closest('[data-ui-overlay="modal"]')).not.toBeNull();
});

it("长下拉菜单在矮窗口底部翻转，末尾选项仍能滚动选择", async () => {
  await page.viewport(400, 320);
  document.documentElement.style.setProperty("--desktop-title-bar-height", "36px");
  const screen = await render(<div style={{ position: "fixed", right: 4, bottom: 4, width: 200 }}>
    <UiSelect aria-label="长列表" defaultValue="0">{Array.from({ length: 30 }, (_, i) => <option key={i} value={String(i)}>选项 {i}</option>)}</UiSelect>
  </div>);
  await screen.getByRole("button", { name: "长列表" }).click();
  const menu = page.getByRole("listbox");
  await expect.element(menu).toBeVisible();
  const bounds = menu.element().getBoundingClientRect();
  expect(bounds.left).toBeGreaterThanOrEqual(8);
  expect(bounds.right).toBeLessThanOrEqual(392);
  expect(bounds.top).toBeGreaterThanOrEqual(44);
  expect(bounds.bottom).toBeLessThanOrEqual(312);
  await page.getByRole("option", { name: "选项 29", exact: true }).click();
  await expect.element(screen.getByRole("button", { name: "长列表" })).toHaveTextContent("选项 29");
  await userEvent.keyboard("{Escape}");
});

it("后打开的同级弹窗覆盖前一个弹窗的子菜单，窗口控制始终可点击", async () => {
  const screen = await render(<>
    <OverlayPortal kind="modal"><div style={{ position: "fixed", inset: 0 }}>
      <OverlayPortal><button style={{ position: "fixed", left: 40, top: 80 }}>旧弹窗菜单</button></OverlayPortal>
    </div></OverlayPortal>
    <OverlayPortal kind="modal"><div data-testid="new-dialog" style={{ position: "fixed", inset: 0 }}>新弹窗</div></OverlayPortal>
    <OverlayPortal kind="chrome"><button style={{ position: "fixed", right: 0, top: 0 }}>窗口最小化</button></OverlayPortal>
  </>);
  const old = screen.getByRole("button", { name: "旧弹窗菜单" });
  expect(hit(old.element())).toBe(false);
  expect(document.elementFromPoint(45, 85)).toBe(screen.getByTestId("new-dialog").element());
  await screen.getByRole("button", { name: "窗口最小化" }).click();
});
