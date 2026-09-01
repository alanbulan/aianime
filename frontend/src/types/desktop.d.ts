interface AIAnimeWindowControls {
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (listener: (maximized: boolean) => void) => () => void;
}

type AIAnimeJsonValue =
  | null
  | boolean
  | number
  | string
  | AIAnimeJsonValue[]
  | { [key: string]: AIAnimeJsonValue };

type AIAnimeCommercialEditionType = "STANDARD" | "PROFESSIONAL";

interface AIAnimeCommercialUser {
  id: number;
  username: string;
  nickname: string;
  email: string;
  avatar: string;
}

interface AIAnimeCommercialTenant {
  id: number;
  code: string;
  name: string;
  isSystem: boolean;
}

interface AIAnimeCommercialSession {
  authenticated: true;
  expiresAtEpochMs: number;
  user: AIAnimeCommercialUser;
  tenant: AIAnimeCommercialTenant;
}

interface AIAnimeCommercialUserProfile {
  id: number;
  username: string;
  nickname: string;
  email: string;
  phone: string;
  gender: 0 | 1 | 2;
  avatar: string;
  status: number;
  deptId: number;
  deptName: string;
  profileDescription: string;
}

interface AIAnimeCommercialDesktopPublicConfig {
  brand: { siteName: string; siteDescription: string };
  login: {
    captchaEnabled: boolean;
    rememberMe: boolean;
    smsLoginEnabled: boolean;
  };
  password: {
    minLength: number;
    maxLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumber: boolean;
    requireSpecial: boolean;
  };
}

type AIAnimeCommercialLoginInput =
  | {
      loginType: "PASSWORD";
      tenantCode: string;
      username: string;
      password: string;
      rememberMe?: boolean;
      captchaKey?: string;
      captchaCode?: string;
    }
  | {
      loginType: "SMS";
      tenantCode: string;
      phone: string;
      smsCode: string;
      rememberMe?: boolean;
    };

interface AIAnimeCommercialRememberedLogin {
  tenantCode: string;
  username: string;
  hasPassword: true;
}

interface AIAnimeCommercialAuthorization {
  license: {
    id: string;
    versionCode: string;
    versionName: string;
    editionType: AIAnimeCommercialEditionType;
    allowsCustomModels: boolean;
    status: string;
    validFrom: string;
    validUntil: string;
    maxDevices: number;
    activeDevices: number;
  };
  device: {
    id: string;
    publicKeyHash: string;
    name: string;
    platform: string;
    arch: string;
    clientVersion: string;
    status: string;
    createdAt: string;
    lastSeenAt: string;
  } | null;
  activation: {
    id: string;
    licenseId: string;
    deviceId: string;
    status: string;
    activatedAt: string;
    lastHeartbeatAt: string;
    endedAt: string;
    endReason: string;
  } | null;
  lease: {
    id: string;
    activationId: string;
    issuedAt: string;
    expiresAt: string;
    keyId: string;
    verifiedOffline: boolean;
  } | null;
  capabilities: {
    editionType: AIAnimeCommercialEditionType | null;
    deviceActivated: boolean;
    allowsCloudModels: boolean;
    allowsCustomModels: boolean;
  };
}

interface AIAnimeCommercialQuota {
  spendableUnits: number;
  account: {
    id: string;
    subjectType: string;
    subjectId: number;
    status: string;
    availableUnits: number;
    reservedUnits: number;
    version: number;
  };
  buckets: Array<{
    id: string;
    sourceType: string;
    initialUnits: number;
    remainingUnits: number;
    reservedUnits: number;
    expiresAt: string;
    status: string;
    bucketType: string;
  }>;
}

interface AIAnimeCommercialModel {
  id: string;
  code: string;
  displayName: string;
  operation: string;
  capabilityJson?: string;
  parameterSchemaJson?: string;
  unitsPerCall?: number;
  clientVisible?: boolean;
  status?: string;
  isDefault?: boolean;
}

interface AIAnimeCommercialModelCatalog {
  catalogVersion: string;
  items: AIAnimeCommercialModel[];
}

interface AIAnimeCommercialInvocation {
  id: string;
  modelCode: string;
  operation: string;
  executionMode: string;
  status: string;
  quotaStatus: string;
  reservationId: string;
  reservedUnits: number;
  chargedUnits: number;
  refundedUnits: number;
  balanceBefore: number;
  balanceAfter: number;
  errorCode: string;
  errorMessage: string;
  createdAt: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

interface AIAnimeCommercialReleaseArtifact {
  id: string;
  versionId: string;
  target: string;
  arch: string;
  installerKind: string;
  fileId: number;
  manifestFileId: number;
  sha256: string;
  sizeBytes: number;
  manifestSha256: string;
  manifestSizeBytes: number;
  fileName: string;
  manifestFileName: string;
  contentType: string;
  manifestContentType: string;
  createdAt: string;
}

interface AIAnimeCommercialReleaseVersion {
  id: string;
  version: string;
  notes: string;
  pubDate: string;
  minimumSupportedVersion: string;
  status: string;
  createdAt: string;
  publishedAt: string;
  artifacts: AIAnimeCommercialReleaseArtifact[];
}

interface AIAnimeCommercialRelease {
  available: boolean;
  required: boolean;
  version: AIAnimeCommercialReleaseVersion;
  reason: string;
}

interface AIAnimeCommercialBootstrap {
  softwareAuthorization: AIAnimeCommercialAuthorization | null;
  personalQuota: AIAnimeCommercialQuota | null;
  models: AIAnimeCommercialModelCatalog | null;
  release: AIAnimeCommercialRelease | null;
  warnings: string[];
}

interface AIAnimeByokModelAssignment {
  modelId: string;
  role: string;
  priority: number;
  enabled: boolean;
  capabilities?: object;
  capabilityOverrides?: object;
  parameterSchema?: object;
  contextWindow?: number;
  maxOutputTokens?: number;
  reasoningEfforts?: string[];
  defaultReasoningEffort?: string;
  runtimeOverrides?: {
    contextWindow?: number;
    maxOutputTokens?: number;
    reasoningEfforts?: string[];
    defaultReasoningEffort?: string;
    parameterOverrides?: object;
  };
}

type AIAnimeByokProviderProtocol =
  | "OPENAI_COMPATIBLE"
  | "ANTHROPIC"
  | "GEMINI";

interface AIAnimeByokProviderStatus {
  id: string;
  name: string;
  protocol: AIAnimeByokProviderProtocol;
  baseUrl: string;
  apiKeyPreview: string;
  configured: boolean;
  enabled: boolean;
  priority: number;
  modelAssignments: AIAnimeByokModelAssignment[];
}

interface AIAnimeCommercialModelAccessStatus {
  mode: "mixed";
  cloudModelAssignments: AIAnimeByokModelAssignment[];
  byokConfigured: boolean;
  byokProviders: AIAnimeByokProviderStatus[];
  allowsCustomModels: boolean;
  gatewayOrigin: string;
}

interface AIAnimeDiscoveredModel {
  id: string;
  capabilities?: object;
  parameterSchema?: object;
  contextWindow?: number;
  maxOutputTokens?: number;
  reasoningEfforts?: string[];
  defaultReasoningEffort?: string;
}

interface AIAnimeCommercialUpdateDownloadProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

type AIAnimeRuntimeDependencyState =
  | "unsupported"
  | "not-installed"
  | "incomplete"
  | "ready"
  | "installing";

interface AIAnimeRuntimeDependencyStatus {
  id: "world";
  supported: boolean;
  installed: boolean;
  healthy: boolean;
  installing: boolean;
  state: AIAnimeRuntimeDependencyState;
  platform: string;
  arch: string;
  accelerator: string;
  version?: string;
  downloadSizeBytes?: number;
  installedSizeBytes?: number;
  message: string;
}

interface AIAnimeRuntimeDependencyProgress {
  phase:
    | "manifest"
    | "downloading"
    | "verifying"
    | "extracting"
    | "checking"
    | "complete";
  message: string;
  transferredBytes?: number;
  totalBytes?: number;
  percent?: number;
}

interface AIAnimeRuntimeDependencyBridge {
  status: () => Promise<AIAnimeRuntimeDependencyStatus>;
  install: () => Promise<AIAnimeRuntimeDependencyStatus>;
  onProgress: (
    listener: (progress: AIAnimeRuntimeDependencyProgress) => void,
  ) => () => void;
}

interface AIAnimeCommercialBridge {
  status: () => Promise<{ configured: boolean; gatewayOrigin: string }>;
  publicConfig: (
    tenantCode: string,
  ) => Promise<AIAnimeCommercialDesktopPublicConfig>;
  publicLogo: (
    tenantCode: string,
  ) => Promise<{ contentType: string; dataUrl: string }>;
  publicCaptcha: (
    tenantCode: string,
  ) => Promise<{ key: string; imageDataUrl: string }>;
  session: () => Promise<AIAnimeCommercialSession | null>;
  rememberedLogin: () => Promise<AIAnimeCommercialRememberedLogin | null>;
  revealRememberedPassword: () => Promise<string>;
  login: (
    input: AIAnimeCommercialLoginInput,
  ) => Promise<AIAnimeCommercialSession>;
  loginRemembered: (input: {
    rememberMe?: boolean;
    captchaKey?: string;
    captchaCode?: string;
  }) => Promise<AIAnimeCommercialSession>;
  logout: () => Promise<{ remoteRevoked: boolean; success: boolean }>;
  profile: () => Promise<AIAnimeCommercialUserProfile>;
  updateProfile: (input: {
    nickname: string;
    email: string;
    phone: string;
    gender: 0 | 1 | 2;
    profileDescription: string;
  }) => Promise<AIAnimeCommercialUserProfile>;
  avatar: () => Promise<{ contentType: string; dataUrl: string }>;
  uploadAvatar: (input: {
    fileName: string;
    contentType: string;
    bytes: Uint8Array;
  }) => Promise<{
    profile: AIAnimeCommercialUserProfile;
    avatar: { contentType: string; dataUrl: string };
  }>;
  deleteAvatar: () => Promise<{ profile: AIAnimeCommercialUserProfile }>;
  changePassword: (input: {
    oldPassword: string;
    newPassword: string;
  }) => Promise<{
    success: boolean;
    sessionsRevoked: boolean;
    tokenReissued: boolean;
  }>;
  sendSmsLoginCode: (input: {
    tenantCode: string;
    phone: string;
  }) => Promise<{ success: boolean; message: string }>;
  sendPasswordResetCode: (input: {
    tenantCode: string;
    email: string;
  }) => Promise<{ success: boolean; message: string }>;
  verifyPasswordResetCode: (input: {
    tenantCode: string;
    email: string;
    code: string;
  }) => Promise<{ resetTicket: string; expiresIn: number }>;
  resetPassword: (input: {
    tenantCode: string;
    resetTicket: string;
    newPassword: string;
  }) => Promise<{
    success: boolean;
    message: string;
    sessionsRevoked: boolean;
    tokenReissued: boolean;
  }>;
  bootstrap: (query: {
    modelOperation?: string;
    catalogVersion?: string;
    currentVersion?: string;
    target?: string;
    arch?: string;
  }) => Promise<AIAnimeCommercialBootstrap>;
  currentLicense: () => Promise<AIAnimeCommercialAuthorization>;
  activateLicense: () => Promise<AIAnimeCommercialAuthorization>;
  refreshLicenseLease: () => Promise<AIAnimeCommercialAuthorization>;
  deactivateLicense: (reason: string) => Promise<AIAnimeCommercialAuthorization>;
  modelAccessStatus: () => Promise<AIAnimeCommercialModelAccessStatus>;
  configureByok: (input: {
    providerId?: string;
    name?: string;
    protocol?: AIAnimeByokProviderProtocol;
    baseUrl: string;
    apiKey?: string;
    enabled?: boolean;
    priority?: number;
    modelAssignments?: AIAnimeByokModelAssignment[];
  }) => Promise<AIAnimeCommercialModelAccessStatus>;
  selectCloudModels: (input?: {
    modelAssignments?: AIAnimeByokModelAssignment[];
  }) => Promise<AIAnimeCommercialModelAccessStatus>;
  clearByok: (input?: {
    providerId?: string;
  }) => Promise<AIAnimeCommercialModelAccessStatus>;
  byokProviderModels: (input: {
    providerId?: string;
    name?: string;
    protocol?: AIAnimeByokProviderProtocol;
    baseUrl: string;
    apiKey?: string;
  }) => Promise<{
    providerId: string;
    models: string[];
    modelMetadata: AIAnimeDiscoveredModel[];
    catalogVersion: string;
  }>;
  quotaBalance: () => Promise<AIAnimeCommercialQuota>;
  modelCatalog: (query: {
    operation?: string;
    catalogVersion?: string;
    source?: "active" | "cloud";
  }) => Promise<AIAnimeCommercialModelCatalog>;
  modelDetails: (sku: string) => Promise<AIAnimeCommercialModel>;
  invocationList: (query: {
    status?: string;
    operation?: string;
    modelCode?: string;
    limit?: number;
    offset?: number;
  }) => Promise<{ items: AIAnimeCommercialInvocation[]; total: number }>;
  invocationDetails: (
    id: string,
  ) => Promise<{ invocation: AIAnimeCommercialInvocation }>;
  cancelInvocation: (input: {
    id: string;
    reason: string;
  }) => Promise<{ invocation: AIAnimeCommercialInvocation }>;
  saveInvocationResult: (
    id: string,
  ) => Promise<{ saved: boolean; fileName?: string }>;
  announcements: (limit?: number) => Promise<{
    items: Array<{
      id: string;
      title: string;
      body: string;
      level: string;
      pinned: boolean;
      publishAt: string;
      expiresAt: string;
    }>;
    total: number;
  }>;
  checkRelease: () => Promise<
    AIAnimeCommercialRelease & { artifactId: string | null }
  >;
  downloadUpdate: (artifactId: string) => Promise<{ version: string }>;
  onUpdateDownloadProgress: (
    listener: (progress: AIAnimeCommercialUpdateDownloadProgress) => void,
  ) => () => void;
  installUpdate: () => Promise<{ accepted: boolean }>;
}

interface AIAnimeDesktopBridge {
  platform: string;
  versions: Readonly<{
    electron: string;
    chrome: string;
    node: string;
  }>;
  windowControls: Readonly<AIAnimeWindowControls>;
  clipboard: Readonly<{
    writeText: (value: string) => Promise<void>;
  }>;
  runtimeDependencies?: Readonly<AIAnimeRuntimeDependencyBridge>;
  commercial?: Readonly<AIAnimeCommercialBridge>;
}

interface Window {
  aiAnimeDesktop?: AIAnimeDesktopBridge;
}
