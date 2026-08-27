// Copyright (c) 2026 AI anime

import { CommercialApiError } from "./commercial-api-error.js";
import {
  parseStoredRememberedLogin,
  parseStoredSession,
} from "./commercial-api-response.js";
import type {
  CommercialRememberedLoginStore,
  CommercialSessionStore,
  StoredCommercialRememberedLogin,
  StoredCommercialSession,
} from "./commercial-api-types.js";
import {
  clearEncryptedFile,
  readEncryptedJsonFile,
  writeEncryptedJsonFile,
  type SecureStorageAdapter,
} from "./secure-file-store.js";

export class EncryptedFileCommercialSessionStore
  implements CommercialSessionStore
{
  constructor(
    private readonly filePath: string,
    private readonly secureStorage: SecureStorageAdapter,
  ) {}

  async load(): Promise<StoredCommercialSession | null> {
    try {
      return await readEncryptedJsonFile(
        this.filePath,
        this.secureStorage,
        parseStoredSession,
      );
    } catch (error) {
      if (error instanceof CommercialApiError) throw error;
      throw new CommercialApiError(
        error instanceof Error ? error.message : "无法读取云端会话",
      );
    }
  }

  async save(session: StoredCommercialSession): Promise<void> {
    try {
      await writeEncryptedJsonFile(this.filePath, this.secureStorage, session);
    } catch (error) {
      throw new CommercialApiError(
        error instanceof Error ? error.message : "无法保存云端会话",
      );
    }
  }

  async clear(): Promise<void> {
    await clearEncryptedFile(this.filePath);
  }
}
export class EncryptedFileCommercialRememberedLoginStore
  implements CommercialRememberedLoginStore
{
  constructor(
    private readonly filePath: string,
    private readonly secureStorage: SecureStorageAdapter,
  ) {}

  async load(): Promise<StoredCommercialRememberedLogin | null> {
    try {
      return await readEncryptedJsonFile(
        this.filePath,
        this.secureStorage,
        parseStoredRememberedLogin,
      );
    } catch (error) {
      if (error instanceof CommercialApiError) throw error;
      throw new CommercialApiError(
        error instanceof Error ? error.message : "无法读取已记住的登录信息",
      );
    }
  }

  async save(login: StoredCommercialRememberedLogin): Promise<void> {
    try {
      await writeEncryptedJsonFile(this.filePath, this.secureStorage, login);
    } catch (error) {
      throw new CommercialApiError(
        error instanceof Error ? error.message : "无法保存登录信息",
      );
    }
  }

  async clear(): Promise<void> {
    await clearEncryptedFile(this.filePath);
  }
}
