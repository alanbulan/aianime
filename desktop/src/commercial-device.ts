import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from "node:crypto";

import {
  readEncryptedJsonFile,
  writeEncryptedJsonFile,
  type SecureStorageAdapter,
} from "./secure-file-store.js";
import {
  requiredRecord,
  requiredText,
} from "./value-validation.js";

interface StoredDeviceIdentity {
  schemaVersion: 1;
  publicKey: string;
  publicKeyHash: string;
  privateKeyPkcs8: string;
}

export interface CommercialDeviceIdentitySummary {
  publicKey: string;
  publicKeyHash: string;
}

export interface CommercialDeviceSigner {
  summary(): Promise<CommercialDeviceIdentitySummary>;
  signMessage(message: string): Promise<string>;
}

export class EncryptedFileCommercialDeviceIdentity
  implements CommercialDeviceSigner
{
  private cache: StoredDeviceIdentity | null = null;
  private loading: Promise<StoredDeviceIdentity> | null = null;

  constructor(
    private readonly filePath: string,
    private readonly secureStorage: SecureStorageAdapter,
  ) {}

  async summary(): Promise<CommercialDeviceIdentitySummary> {
    const identity = await this.loadOrCreate();
    return {
      publicKey: identity.publicKey,
      publicKeyHash: identity.publicKeyHash,
    };
  }

  async signMessage(message: string): Promise<string> {
    if (!message) throw new Error("设备激活挑战消息不能为空");
    const identity = await this.loadOrCreate();
    const privateKey = createPrivateKey({
      key: Buffer.from(identity.privateKeyPkcs8, "base64"),
      format: "der",
      type: "pkcs8",
    });
    return withoutBase64Padding(
      sign(null, Buffer.from(message, "utf8"), privateKey).toString("base64"),
    );
  }

  private async loadOrCreate(): Promise<StoredDeviceIdentity> {
    if (this.cache) return this.cache;
    // Share one in-flight load. Two concurrent first callers (summary() and
    // signMessage() both run during startup) would otherwise each generate a
    // keypair and write it, leaving the cached identity and the on-disk one
    // disagreeing — which forces the user to re-activate the device.
    if (this.loading) return this.loading;
    const run = this.readOrGenerate();
    this.loading = run;
    try {
      const identity = await run;
      this.cache = identity;
      return identity;
    } finally {
      this.loading = null;
    }
  }

  private async readOrGenerate(): Promise<StoredDeviceIdentity> {
    const stored = await readEncryptedJsonFile(
      this.filePath,
      this.secureStorage,
      parseStoredDeviceIdentity,
    );
    if (stored) return stored;

    const created = createDeviceIdentity();
    await writeEncryptedJsonFile(this.filePath, this.secureStorage, created);
    return created;
  }
}

function createDeviceIdentity(): StoredDeviceIdentity {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const exportedPublic = publicKey.export({ format: "jwk" });
  if (typeof exportedPublic.x !== "string" || !exportedPublic.x) {
    throw new Error("无法导出 Ed25519 设备公钥");
  }
  const rawPublicKey = Buffer.from(exportedPublic.x, "base64url");
  if (rawPublicKey.byteLength !== 32) {
    throw new Error("Ed25519 设备公钥长度无效");
  }
  return {
    schemaVersion: 1,
    publicKey: withoutBase64Padding(rawPublicKey.toString("base64")),
    publicKeyHash: createHash("sha256").update(rawPublicKey).digest("hex"),
    privateKeyPkcs8: privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64"),
  };
}

function parseStoredDeviceIdentity(value: unknown): StoredDeviceIdentity {
  const record = requiredRecord(value, "device identity");
  if (record.schemaVersion !== 1) {
    throw new Error("不支持的设备身份存储版本");
  }
  const privateKeyPkcs8 = requiredText(
    record.privateKeyPkcs8,
    "privateKeyPkcs8",
  );
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyPkcs8, "base64"),
    format: "der",
    type: "pkcs8",
  });
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("设备私钥不是 Ed25519");
  }
  const exportedPublic = createPublicKey(privateKey).export({ format: "jwk" });
  if (typeof exportedPublic.x !== "string" || !exportedPublic.x) {
    throw new Error("无法从设备私钥恢复公钥");
  }
  const rawPublicKey = Buffer.from(exportedPublic.x, "base64url");
  const publicKey = withoutBase64Padding(rawPublicKey.toString("base64"));
  const publicKeyHash = createHash("sha256").update(rawPublicKey).digest("hex");
  if (
    requiredText(record.publicKey, "publicKey") !== publicKey ||
    requiredText(record.publicKeyHash, "publicKeyHash") !== publicKeyHash
  ) {
    throw new Error("设备身份公私钥不匹配");
  }
  return {
    schemaVersion: 1,
    publicKey,
    publicKeyHash,
    privateKeyPkcs8,
  };
}

function withoutBase64Padding(value: string): string {
  return value.replace(/=+$/, "");
}
