import type { BrowserWindow, ContextMenuParams, Menu, MenuItemConstructorOptions } from "electron";

type EditingMenu = Pick<typeof Menu, "buildFromTemplate" | "setApplicationMenu">;

export function installDesktopApplicationMenu(
  menu: EditingMenu,
  platform: NodeJS.Platform = process.platform,
): void {
  // macOS routes standard editing shortcuts through the native menu roles.
  // Keep the existing menu-less Windows/Linux window unchanged.
  menu.setApplicationMenu(platform === "darwin"
    ? menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }])
    : null);
}

export function desktopTextContextMenu(
  params: Pick<ContextMenuParams, "isEditable" | "selectionText" | "editFlags">,
): MenuItemConstructorOptions[] {
  const { isEditable, selectionText, editFlags } = params;
  if (!isEditable) {
    return selectionText && editFlags.canCopy ? [{ role: "copy" }] : [];
  }
  return [
    { role: "undo", enabled: editFlags.canUndo },
    { role: "redo", enabled: editFlags.canRedo },
    { type: "separator" },
    { role: "cut", enabled: editFlags.canCut },
    { role: "copy", enabled: editFlags.canCopy },
    { role: "paste", enabled: editFlags.canPaste },
    { type: "separator" },
    { role: "selectAll", enabled: editFlags.canSelectAll },
  ];
}

export function installDesktopTextContextMenu(
  window: BrowserWindow,
  menu: Pick<typeof Menu, "buildFromTemplate">,
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform !== "darwin") return;
  window.webContents.on("context-menu", (_event, params) => {
    const template = desktopTextContextMenu(params);
    // Leave canvas/media menus to the renderer; never create an empty popup.
    if (template.length === 0) return;
    menu.buildFromTemplate(template).popup({ window, ...(params.frame ? { frame: params.frame } : {}) });
  });
}
