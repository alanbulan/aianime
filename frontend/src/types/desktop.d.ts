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
  login: (input: AIAnimeCommercialLoginInput) => Promise<AIAnimeCommercialSession>;
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
    baseUrl: string;
    apiKey?: string;
    modelAssignments?: AIAnimeByokModelAssignment[];
  }) => Promise<unknown>;
  selectCloudModels: () => Promise<unknown>;
  clearByok: () => Promise<unknown>;
  quotaBalance: () => Promise<unknown>;
  modelCatalog: (query: {
    operation?: string;
    catalogVersion?: string;
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
  commercial?: Readonly<AIAnimeCommercialBridge>;
}

interface Window {
  aiAnimeDesktop?: AIAnimeDesktopBridge;
}
