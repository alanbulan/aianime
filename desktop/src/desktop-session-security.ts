import type { BrowserWindow, Session } from "electron";

import { isSameOrigin } from "./desktop-runtime-contracts.js";

interface BackendSecurityTarget {
  readonly baseUrl: string;
  readonly tokenHeader: string;
  readonly token: string;
}

interface DesktopSessionSecurityOptions {
  targetSession: Session;
  backend: BackendSecurityTarget;
  rendererOrigin: string;
  getMainWindow: () => BrowserWindow | null;
  additionalConnectSources?: readonly string[];
  additionalScriptSources?: readonly string[];
}

function contentSecurityPolicy(
  connectSources: readonly string[],
  scriptSources: readonly string[],
): string {
  const connectSourceList = ["'self'", ...new Set(connectSources)].join(" ");
  const scriptSourceList = ["'self'", ...new Set(scriptSources)].join(" ");
  return [
    "default-src 'self';",
    `script-src ${scriptSourceList};`,
    "style-src 'self' 'unsafe-inline';",
    "img-src 'self' data: blob: https:;",
    "media-src 'self' blob:;",
    "font-src 'self' data:;",
    `connect-src ${connectSourceList};`,
    "worker-src 'self' blob:;",
    "frame-ancestors 'none';",
    "base-uri 'self';",
    "form-action 'self';",
    "object-src 'none';",
  ].join(" ");
}

export function installDesktopSessionSecurity(
  options: DesktopSessionSecurityOptions,
): void {
  const { backend, targetSession, rendererOrigin } = options;
  const policy = contentSecurityPolicy(
    options.additionalConnectSources ?? [],
    options.additionalScriptSources ?? [],
  );
  const responseUrls = [...new Set([backend.baseUrl, rendererOrigin])].map(
    (origin) => `${origin.replace(/\/+$/u, "")}/*`,
  );

  targetSession.webRequest.onBeforeSendHeaders(
    { urls: [`${backend.baseUrl}/*`] },
    (details, callback) => {
      details.requestHeaders[backend.tokenHeader] = backend.token;
      callback({ requestHeaders: details.requestHeaders });
    },
  );
  targetSession.webRequest.onHeadersReceived(
    { urls: responseUrls },
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [policy],
          "X-Content-Type-Options": ["nosniff"],
        },
      });
    },
  );

  const isTrustedWindow = (senderId: number | undefined): boolean => {
    const window = options.getMainWindow();
    return Boolean(
      senderId !== undefined &&
        window &&
        !window.isDestroyed() &&
        window.webContents.id === senderId,
    );
  };
  targetSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details) =>
      permission === "media" &&
      details.mediaType === "audio" &&
      details.isMainFrame &&
      isTrustedWindow(webContents?.id) &&
      isSameOrigin(requestingOrigin, rendererOrigin),
  );
  targetSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const mediaTypes = "mediaTypes" in details ? details.mediaTypes : undefined;
      callback(
        permission === "media" &&
          details.isMainFrame &&
          isTrustedWindow(webContents.id) &&
          isSameOrigin(details.requestingUrl, rendererOrigin) &&
          mediaTypes?.length === 1 &&
          mediaTypes[0] === "audio",
      );
    },
  );
}
