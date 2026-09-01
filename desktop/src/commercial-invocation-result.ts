import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface CommercialInvocationResultClient {
  invocationResult(id: string): Promise<Response>;
}

export async function saveCommercialInvocationResult(
  client: CommercialInvocationResultClient,
  id: string,
  selectFilePath: (suggestedName: string) => Promise<string | null>,
): Promise<{ saved: boolean; fileName?: string }> {
  const response = await client.invocationResult(id);
  if (!response.body) throw new Error("云端调用结果没有可保存的内容");

  const suggestedName = commercialResultFileName(
    response.headers.get("content-disposition"),
    id,
  );
  let filePath: string | null;
  try {
    filePath = await selectFilePath(suggestedName);
  } catch (error) {
    await response.body.cancel().catch(() => undefined);
    throw error;
  }
  if (!filePath) {
    await response.body.cancel().catch(() => undefined);
    return { saved: false };
  }

  const temporaryPath = join(
    dirname(filePath),
    `.${basename(filePath)}.${randomUUID()}.tmp`,
  );
  try {
    await pipeline(
      Readable.fromWeb(response.body as never),
      createWriteStream(temporaryPath, { flags: "wx" }),
    );
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
  return { saved: true, fileName: basename(filePath) };
}

function commercialResultFileName(
  contentDisposition: string | null,
  id: string,
): string {
  const fallback = `AI-anime-result-${String(id)}.bin`;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition ?? "")?.[1];
  if (encoded) {
    try {
      return sanitizeResultFileName(basename(decodeURIComponent(encoded)), fallback);
    } catch {
      // Fall through to the ASCII filename or generated fallback.
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(contentDisposition ?? "")?.[1];
  return plain
    ? sanitizeResultFileName(basename(plain.trim()), fallback)
    : fallback;
}

/**
 * Make a server-supplied filename safe to use as a save-dialog default.
 *
 * `basename` only strips directory separators. A name still carrying `: * ? "
 * < > |` or a control character, a trailing dot/space, or a reserved DOS
 * device name is rejected by Windows with EINVAL when the write is finally
 * attempted. Spaces and hyphens are legal and deliberately preserved.
 */
function sanitizeResultFileName(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/, "")
    .trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return fallback;
  const dot = cleaned.lastIndexOf(".");
  const stem = dot > 0 ? cleaned.slice(0, dot) : cleaned;
  const extension = dot > 0 ? cleaned.slice(dot) : "";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) return `_${cleaned}`;
  // Truncate the stem, never the extension: it drives the dialog type filter.
  return stem.length > 150 ? `${stem.slice(0, 150)}${extension}` : cleaned;
}
