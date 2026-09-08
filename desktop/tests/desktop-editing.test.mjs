import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  desktopTextContextMenu,
  installDesktopApplicationMenu,
  installDesktopTextContextMenu,
} from "../src/desktop-editing.ts";

function menuHarness() {
  const built = [];
  const popups = [];
  const applications = [];
  return {
    built, popups, applications,
    api: {
      buildFromTemplate(template) {
        built.push(template);
        return { popup: (options) => popups.push(options) };
      },
      setApplicationMenu(menu) { applications.push(menu); },
    },
  };
}

const flags = {
  canUndo: true, canRedo: false, canCut: true, canCopy: true,
  canPaste: true, canSelectAll: true, canDelete: true, canEditRichly: true,
};

test("macOS keeps native application, editing and window menu roles", () => {
  const menus = menuHarness();
  installDesktopApplicationMenu(menus.api, "darwin");
  assert.deepEqual(menus.built[0].map((item) => item.role), ["appMenu", "editMenu", "windowMenu"]);
  assert.notEqual(menus.applications[0], null);
});

test("Windows/Linux keep their existing menu-less window and context menu behavior", () => {
  for (const platform of ["win32", "linux"]) {
    const menus = menuHarness();
    const window = { webContents: new EventEmitter() };
    installDesktopApplicationMenu(menus.api, platform);
    installDesktopTextContextMenu(window, menus.api, platform);
    assert.deepEqual(menus.applications, [null]);
    assert.equal(menus.built.length, 0);
    assert.equal(window.webContents.listenerCount("context-menu"), 0);
  }
});

test("editable text menus respect Chromium edit permissions rather than assuming clipboard access", () => {
  const entries = desktopTextContextMenu({ isEditable: true, selectionText: "中文", editFlags: flags });
  assert.deepEqual(entries.filter((item) => item.role).map(({ role, enabled }) => [role, enabled]), [
    ["undo", true], ["redo", false], ["cut", true], ["copy", true], ["paste", true], ["selectAll", true],
  ]);
  const disabled = Object.fromEntries(Object.keys(flags).map((name) => [name, false]));
  assert.ok(desktopTextContextMenu({ isEditable: true, selectionText: "", editFlags: disabled })
    .filter((item) => item.role).every((item) => item.enabled === false));
});

test("read-only selected text offers copy while empty canvas/media gets no native popup", () => {
  assert.deepEqual(desktopTextContextMenu({ isEditable: false, selectionText: "中文", editFlags: flags }), [{ role: "copy" }]);
  assert.deepEqual(desktopTextContextMenu({ isEditable: false, selectionText: "", editFlags: flags }), []);
  assert.deepEqual(desktopTextContextMenu({ isEditable: false, selectionText: "secret", editFlags: { ...flags, canCopy: false } }), []);
});

test("macOS text context menu targets the requesting window and frame", () => {
  const menus = menuHarness();
  const window = { webContents: new EventEmitter() };
  const frame = {};
  installDesktopTextContextMenu(window, menus.api, "darwin");
  window.webContents.emit("context-menu", {}, { isEditable: true, selectionText: "", editFlags: flags, frame });
  assert.deepEqual(menus.popups, [{ window, frame }]);
  window.webContents.emit("context-menu", {}, { isEditable: false, selectionText: "", editFlags: flags, frame });
  assert.equal(menus.popups.length, 1);
});

test("development and packaged entry points install the same native editing behavior after app readiness", async () => {
  for (const path of ["../src/main.ts", "../scripts/dev.mjs"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /installDesktopTextContextMenu\(window, Menu\)/);
    assert.match(source, /app\.whenReady\(\)\.then\(\(\) => \{\s*installDesktopApplicationMenu\(Menu\);/);
    assert.doesNotMatch(source, /Menu\.setApplicationMenu\(null\)/);
  }
});
