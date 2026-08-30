interface AIAnimeWindowControls {
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (listener: (maximized: boolean) => void) => () => void;
}

interface AIAnimeCommercialUser {
  id: string | number;
  username: string;
  nickname?: string;
  email?: string;
  avatar?: string;
}

interface AIAnimeCommercialTenant {
  id: string | number;
  code: string;
  name: string;
  isSystem?: boolean;
}

interface AIAnimeCommercialSession {
  authenticated: true;
  expiresAtEpochMs: number;
  user: AIAnimeCommercialUser;
  tenant: AIAnimeCommercialTenant;
}

interface AIAnimeCommercialUserProfile {
  id: string | number;
  username: string;
  nickname: string;
  email: string;
  phone: string;
  gender: 0 | 1 | 2;
  avatar: string;
  status: number;
  deptId: string | number;
  deptName: string;
  profileDescription: string;
}

interface AIAnimeCommercialLoginInput {
  tenantCode: string;
  username: string;
  password: string;
  rememberMe?: boolean;
  captchaKey?: string;
  captchaCode?: string;
}

interface AIAnimeCommercialRememberedLogin {
  tenantCode: string;
  username: string;
  hasPassword: true;
}

interface AIAnimeCommercialRegistrationInput {
  tenantCode: string;
  username: string;
  password: string;
  nickname?: string;
  email?: string;
  captchaKey?: string;
  captchaCode?: string;
}

interface AIAnimeByokModelAssignment {
  modelId: string;
  role: string;
  priority: number;
  enabled: boolean;
  capabilities?: Record<string, unknown>;
  capabilityOverrides?: Record<string, unknown>;
  parameterSchema?: Record<string, unknown>;
  contextWindow?: number;
  maxOutputTokens?: number;
  reasoningEfforts?: string[];
  defaultReasoningEffort?: string;
  runtimeOverrides?: {
    contextWindow?: number;
    maxOutputTokens?: number;
    reasoningEfforts?: string[];
    defaultReasoningEffort?: string;
    parameterOverrides?: Record<string, unknown>;
  };
}

type AIAnimeByokProviderProtocol =
  | "OPENAI_COMPATIBLE"
  | "ANTHROPIC"
  | "GEMINI";

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
  publicConfig: (tenantCode: string) => Promise<unknown>;
  publicLogo: (
    tenantCode: string,
  ) => Promise<{ contentType: string; dataUrl: string }>;
  publicCaptcha: (
    tenantCode: string,
  ) => Promise<{ key: string; imageDataUrl: string }>;
  register: (input: AIAnimeCommercialRegistrationInput) => Promise<void>;
  session: () => Promise<AIAnimeCommercialSession | null>;
  rememberedLogin: () => Promise<AIAnimeCommercialRememberedLogin | null>;
  revealRememberedPassword: () => Promise<string>;
  login: (input: AIAnimeCommercialLoginInput) => Promise<AIAnimeCommercialSession>;
  loginRemembered: (input: {
    rememberMe?: boolean;
    captchaKey?: string;
    captchaCode?: string;
  }) => Promise<AIAnimeCommercialSession>;
  logout: () => Promise<{ remoteRevoked: boolean }>;
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
  }) => Promise<void>;
  sendPasswordResetCode: (input: {
    tenantCode: string;
    email: string;
  }) => Promise<void>;
  verifyPasswordResetCode: (input: {
    tenantCode: string;
    email: string;
    code: string;
  }) => Promise<{ resetTicket: string; expiresIn: number }>;
  resetPassword: (input: {
    tenantCode: string;
    resetTicket: string;
    newPassword: string;
  }) => Promise<void>;
  bootstrap: (query: {
    modelOperation?: string;
    catalogVersion?: string;
    currentVersion?: string;
    target?: string;
    arch?: string;
  }) => Promise<unknown>;
  currentLicense: () => Promise<unknown>;
  activateLicense: () => Promise<unknown>;
  refreshLicenseLease: () => Promise<unknown>;
  deactivateLicense: (reason: string) => Promise<unknown>;
  modelAccessStatus: () => Promise<unknown>;
  configureByok: (input: {
    providerId?: string;
    name?: string;
    protocol?: AIAnimeByokProviderProtocol;
    baseUrl: string;
    apiKey?: string;
    enabled?: boolean;
    priority?: number;
    modelAssignments?: AIAnimeByokModelAssignment[];
  }) => Promise<unknown>;
  selectCloudModels: (input?: {
    modelAssignments?: AIAnimeByokModelAssignment[];
  }) => Promise<unknown>;
  clearByok: (input?: { providerId?: string }) => Promise<unknown>;
  byokProviderModels: (input: {
    providerId?: string;
    name?: string;
    protocol?: AIAnimeByokProviderProtocol;
    baseUrl: string;
    apiKey?: string;
  }) => Promise<unknown>;
  quotaBalance: () => Promise<unknown>;
  modelCatalog: (query: {
    operation?: string;
    catalogVersion?: string;
    source?: "active" | "cloud";
  }) => Promise<unknown>;
  modelDetails: (sku: string) => Promise<unknown>;
  invocationList: (query: {
    page?: number;
    pageSize?: number;
    status?: string;
    operation?: string;
    modelSkuCode?: string;
  }) => Promise<unknown>;
  invocationDetails: (id: string | number) => Promise<unknown>;
  cancelInvocation: (input: {
    id: string | number;
    reason: string;
  }) => Promise<unknown>;
  saveInvocationResult: (
    id: string | number,
  ) => Promise<{ saved: boolean; fileName?: string }>;
  announcements: (limit?: number) => Promise<unknown>;
  checkRelease: () => Promise<unknown>;
  downloadUpdate: (
    artifactId: string | number,
  ) => Promise<{ version: string }>;
  onUpdateDownloadProgress: (
    listener: (progress: AIAnimeCommercialUpdateDownloadProgress) => void,
  ) => () => void;
  installUpdate: () => Promise<void>;
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
