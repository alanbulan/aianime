import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export interface SecureStorageAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface ReadEncryptedJsonFileOptions {
  preserveValidationError?: boolean;
}

export async function readEncryptedJsonFile<T>(
  filePath: string,
  secureStorage: SecureStorageAdapter,
  parse: (value: unknown) => T,
  options: ReadEncryptedJsonFileOptions = {},
): Promise<T | null> {
  assertEncryptionAvailable(secureStorage);
  let encrypted: Buffer;
  try {
    encrypted = await readFile(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw error;
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(secureStorage.decryptString(encrypted)) as unknown;
  } catch {
    await clearEncryptedFile(filePath);
    return null;
  }
  try {
    return parse(decoded);
  } catch (error) {
    if (options.preserveValidationError) throw error;
    await clearEncryptedFile(filePath);
    return null;
  }
}

export async function writeEncryptedJsonFile(
  filePath: string,
  secureStorage: SecureStorageAdapter,
  value: unknown,
): Promise<void> {
  assertEncryptionAvailable(secureStorage);
  const encrypted = secureStorage.encryptString(JSON.stringify(value));
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(filePath), { recursive: true });
  try {
    await writeFile(temporaryPath, encrypted, { mode: 0o600 });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function clearEncryptedFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

function assertEncryptionAvailable(
  secureStorage: SecureStorageAdapter,
): void {
  if (!secureStorage.isEncryptionAvailable()) {
    throw new Error("操作系统安全凭据存储不可用");
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
