import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommercialLicensePage } from "@/components/commercial-license-page";

const navigate = vi.hoisted(() => vi.fn());
const activateCurrentDevice = vi.hoisted(() => vi.fn());
const initialize = vi.hoisted(() => vi.fn());
const logoutAllSessions = vi.hoisted(() => vi.fn());
const entitlementState = vi.hoisted(() => ({
  status: "ready" as "idle" | "loading" | "ready" | "error",
  entitlement: {
    license: {
      id: "license-1",
      editionType: "PROFESSIONAL" as const,
      allowsCustomModels: true,
      versionName: "专业版",
    },
    device: null,
    activation: null,
    lease: null,
    capabilities: {
      editionType: "PROFESSIONAL" as const,
      deviceActivated: false,
      allowsCloudModels: false,
      allowsCustomModels: false,
    },
  },
  error: null as string | null,
  initialize,
  activateCurrentDevice,
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@/app/commercial-access", () => ({
  ensureCommercialBootstrap: initialize,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/modules/identity_access/public", () => ({
  useCommercialEntitlementStore: (selector: (state: typeof entitlementState) => unknown) =>
    selector(entitlementState),
  commercialEntitlementAllowsWorkspace: (entitlement: typeof entitlementState.entitlement) =>
    Boolean(entitlement.license && entitlement.capabilities.deviceActivated),
  logoutAllSessions,
}));

describe("commercial license page", () => {
  beforeEach(() => {
    navigate.mockReset();
    activateCurrentDevice.mockReset();
    initialize.mockReset();
    logoutAllSessions.mockReset();
    entitlementState.status = "ready";
    entitlementState.error = null;
  });

  it("enters the workspace after device activation is confirmed", async () => {
    activateCurrentDevice.mockResolvedValue({
      ...entitlementState.entitlement,
      device: { id: "device-1" },
      activation: { id: "activation-1" },
      capabilities: {
        ...entitlementState.entitlement.capabilities,
        deviceActivated: true,
        allowsCloudModels: true,
        allowsCustomModels: true,
      },
    });
    const user = userEvent.setup();
    render(<CommercialLicensePage />);

    await user.click(screen.getByRole("button", { name: "license.activateDevice" }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/", replace: true }),
    );
  });
});
