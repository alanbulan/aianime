import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VersionUpdateDialog } from "./VersionUpdateDialog";
import { CommercialUpdateRequired } from "./CommercialUpdateRequired";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function fixture(required: boolean) {
  const pending = deferred<{ accepted: boolean }>();
  const installUpdate = vi.fn().mockReturnValue(pending.promise);
  const downloadUpdate = vi.fn().mockResolvedValue({ version: "1.1.64" });
  const checkRelease = vi.fn().mockResolvedValue({
    available: true, required, reason: "update-available",
    artifactId: "33333333-3333-4333-8333-333333333333",
    version: {
      id: "44444444-4444-4444-8444-444444444444", version: "1.1.64",
      notes: "", pubDate: "2026-09-08T00:00:00Z", minimumSupportedVersion: "",
      status: "PUBLISHED", createdAt: "2026-09-08T00:00:00Z",
      publishedAt: "2026-09-08T00:00:00Z", artifacts: [],
    },
  });
  window.aiAnimeDesktop = {
    platform: "darwin", versions: { electron: "44", chrome: "0", node: "0" },
    commercial: { checkRelease, downloadUpdate, installUpdate } as unknown as AIAnimeCommercialBridge,
  } as AIAnimeDesktopBridge;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>
    {required ? <CommercialUpdateRequired enabled /> : <VersionUpdateDialog />}
  </QueryClientProvider>);
  return { pending, installUpdate, downloadUpdate, checkRelease, client };
}

afterEach(() => { cleanup(); delete window.aiAnimeDesktop; });

describe.each([false, true])("update installation (required=%s)", (required) => {
  it("keeps installing visible after acknowledgement and prevents duplicate requests", async () => {
    const { pending, installUpdate, downloadUpdate, checkRelease, client } = fixture(required);
    fireEvent.click(await screen.findByRole("button", { name: "app.commercialUpdate.downloadAndInstall" }));
    await waitFor(() => expect(installUpdate).toHaveBeenCalledOnce());
    const installing = screen.getByRole("button", { name: "app.commercialUpdate.installing" });
    expect(installing).toBeDisabled();
    expect(screen.getByText("app.commercialUpdate.preparingInstall")).toBeVisible();
    fireEvent.click(installing);
    expect(downloadUpdate).toHaveBeenCalledOnce();
    await act(async () => pending.resolve({ accepted: true }));
    expect(screen.getByRole("button", { name: "app.commercialUpdate.installing" })).toBeDisabled();
    expect(checkRelease).toHaveBeenCalledOnce();
    if (!required) {
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      expect(screen.getByRole("dialog")).toBeVisible();
    }
    client.clear();
  });

  it.each([
    ["UPDATE_SIGNATURE_INVALID", "signatureInvalid"],
    ["UPDATE_READ_ONLY", "readOnly"],
    ["UPDATE_INSTALL_FAILED", "installFailed"],
  ])("shows asynchronous %s failures and allows retry", async (code, key) => {
    const { pending, installUpdate, client } = fixture(required);
    fireEvent.click(await screen.findByRole("button", { name: "app.commercialUpdate.downloadAndInstall" }));
    await waitFor(() => expect(installUpdate).toHaveBeenCalledOnce());
    await act(async () => pending.reject(new Error(`AI_ANIME_COMMERCIAL_ERROR:${JSON.stringify({ message: "safe message", status: 0, code, requestId: null })}`)));
    expect(await screen.findByRole("alert")).toHaveTextContent(`app.commercialUpdate.${key}`);
    expect(screen.queryByText("app.commercialUpdate.downloadProgressUnknownTotal")).not.toBeInTheDocument();
    installUpdate.mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: "app.commercialUpdate.downloadAndInstall" }));
    await waitFor(() => expect(installUpdate).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    client.clear();
  });
});
