// Copyright (c) 2026 AI anime

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { pipeline } from "node:stream";

export interface SparkleUpdate {
  version: string;
  archivePath: string;
  edSignature: string;
}

export function assertSparkleSignature(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(value)
    || Buffer.from(value, "base64").length !== 64) {
    throw new Error("Missing or invalid Sparkle signature");
  }
}

function xml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;",
  })[char]!);
}

// Only the already authenticated, SHA-512-checked local ZIP is exposed. The
// random loopback capability never crosses IPC and carries no Gateway token.
// Sparkle verifies Ed25519 with the trust root in the installed Info.plist,
// then owns replacement and relaunch; no custom bundle replacement is used.
export async function installSparkleUpdate(
  bundlePath: string,
  update: SparkleUpdate,
  launch: typeof spawn = spawn,
): Promise<void> {
  assertSparkleSignature(update.edSignature);
  const archive = await stat(update.archivePath);
  if (!archive.isFile() || archive.size === 0) throw new Error("Invalid update archive");
  const capability = randomBytes(32).toString("hex");
  const feedPath = `/${capability}/appcast.xml`;
  const zipPath = `/${capability}/update.zip`;
  let feed = "";
  const server = createServer((request, response) => {
    if (request.method !== "GET" || (request.url !== feedPath && request.url !== zipPath)) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Cache-Control", "no-store");
    if (request.url === feedPath) {
      response.writeHead(200, { "Content-Type": "application/xml" }).end(feed);
    } else {
      response.writeHead(200, { "Content-Type": "application/zip", "Content-Length": archive.size });
      pipeline(createReadStream(update.archivePath), response, () => {});
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") { server.close(); throw new Error("Invalid updater address"); }
  const origin = `http://127.0.0.1:${address.port}`;
  feed = `<?xml version="1.0" encoding="utf-8"?><rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><title>AI anime</title><item><sparkle:version>${xml(update.version)}</sparkle:version><sparkle:shortVersionString>${xml(update.version)}</sparkle:shortVersionString><enclosure url="${origin}${zipPath}" length="${archive.size}" type="application/octet-stream" sparkle:edSignature="${xml(update.edSignature)}" /></item></channel></rss>`;
  try {
    await new Promise<void>((resolve, reject) => {
      const child = launch(join(bundlePath, "Contents", "MacOS", "sparkle"), [bundlePath,
        "--check-immediately", "--feed-url", `${origin}${feedPath}`,
        "--user-agent-name", "AI anime", "--interactive"], {
        detached: true, stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr?.on("data", (data: Buffer) => { stderr = (stderr + data.toString()).slice(-8192); });
      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Sparkle installation failed (${code}): ${stderr}`));
      });
    });
  } finally {
    server.close();
    server.closeAllConnections();
  }
}
