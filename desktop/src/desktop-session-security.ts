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

/**
 * 人脸直过的 Haar worker 通过 importScripts 加载 opencv.js；其 embind 绑定层用
 * `new Function` 动态生成每个 C++ 方法的调用器，离不开 'unsafe-eval'。专用 worker 的
 * CSP 来自它自己脚本响应头，因此只给这一个脚本放开 eval：worker 没有 DOM，connect-src
 * 与页面相同，影响面仅限该 worker。文件名是与前端的契约，见
 * frontend/src/modules/creative_canvas/infrastructure/facePassHaarWorker.js。
 */
const DYNAMIC_CODE_WORKER_SCRIPT = /(?:^|\/)facePassHaarWorker(?:-[A-Za-z0-9_-]+)?\.js$/u;

export function isDynamicCodeWorkerScriptUrl(
  url: string | undefined,
  trustedOrigins: readonly string[],
): boolean {
  if (!url) return false;
  try {
    const target = new URL(url);
    return (
      trustedOrigins.some((origin) => isSameOrigin(target.href, origin)) &&
      DYNAMIC_CODE_WORKER_SCRIPT.test(target.pathname)
    );
  } catch {
    return false;
  }
}

function contentSecurityPolicy(
  connectSources: readonly string[],
  scriptSources: readonly string[],
  allowScriptEval = false,
): string {
  const connectSourceList = ["'self'", "blob:", ...new Set(connectSources)].join(" ");
  const scriptSourceList = [
    "'self'",
    "'wasm-unsafe-eval'",
    ...(allowScriptEval ? ["'unsafe-eval'"] : []),
    ...new Set(scriptSources),
  ].join(" ");
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
  const dynamicCodeWorkerPolicy = contentSecurityPolicy(
    options.additionalConnectSources ?? [],
    options.additionalScriptSources ?? [],
    true,
  );
  const trustedOrigins = [...new Set([backend.baseUrl, rendererOrigin])];
  const responseUrls = trustedOrigins.map(
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
          "Content-Security-Policy": [
            isDynamicCodeWorkerScriptUrl(details.url, trustedOrigins)
              ? dynamicCodeWorkerPolicy
              : policy,
          ],
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
    (webContents, permission, requestingOrigin, details) => {
      const permissionName = String(permission);
      const trustedMainFrame =
        details.isMainFrame &&
        isTrustedWindow(webContents?.id) &&
        isSameOrigin(requestingOrigin, rendererOrigin);
      if (!trustedMainFrame) return false;
      if (permissionName === "media") return details.mediaType === "audio";
      return (
        permissionName === "automatic-fullscreen" ||
        permissionName === "fullscreen"
      );
    },
  );
  targetSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const permissionName = String(permission);
      const mediaTypes = "mediaTypes" in details ? details.mediaTypes : undefined;
      const trustedMainFrame =
        details.isMainFrame &&
        isTrustedWindow(webContents.id) &&
        isSameOrigin(details.requestingUrl, rendererOrigin);
      if (!trustedMainFrame) {
        callback(false);
        return;
      }
      if (permissionName === "media") {
        callback(mediaTypes?.length === 1 && mediaTypes[0] === "audio");
        return;
      }
      callback(
        permissionName === "fullscreen" ||
          permissionName === "automatic-fullscreen",
      );
    },
  );
}
