export type ModelAccessMode = "cloud" | "byok";

export interface ModelGatewayConfig {
  mode: ModelAccessMode;
  effective: { source: "cloud_proxy" | "byok"; configured: boolean };
  cloud: { configured: boolean; managed: true };
  byok: {
    allowed: boolean;
    configured: boolean;
    baseUrl: string;
    apiKeyPreview: string;
  };
}

export interface ModelGatewaySuccess<T> {
  ok: true;
  data: T;
}
