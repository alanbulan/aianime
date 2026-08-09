import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface CommercialInvocationResultClient {
  invocationResult(id: string | number): Promise<Response>;
}

export async function saveCommercialInvocationResult(
  client: CommercialInvocationResultClient,
  id: string | number,
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
  id: string | number,
): string {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition ?? "")?.[1];
  if (encoded) {
    try {
      return basename(decodeURIComponent(encoded));
    } catch {
      // Fall through to the ASCII filename or generated fallback.
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(contentDisposition ?? "")?.[1];
  return plain ? basename(plain.trim()) : `AI-anime-result-${String(id)}.bin`;
}
